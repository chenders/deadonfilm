# Phase 3: Enhanced Per-Field History & Revert - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add lazy-loaded per-field history with revert-to-any-value capability in the Admin Actor Editor.

**Architecture:** New API endpoint returns paginated history for a specific field. Frontend hook lazy-loads when user expands history panel. EditableField component enhanced with scrollable history list and per-row revert buttons.

**Tech Stack:** Express.js, React Query, Vitest, React Testing Library

---

## Task 1: API Endpoint - Write Failing Tests

**Files:**
- Modify: `server/src/routes/admin/actors.test.ts`

**Step 1: Add test for valid field history request**

Add this test block after the existing `GET /admin/api/actors/:id` describe block:

```typescript
describe("GET /admin/api/actors/:id/history/:field", () => {
  const mockHistoryRows = [
    {
      id: 1,
      old_value: "heart attack",
      new_value: "cardiac arrest",
      source: "admin-manual-edit",
      batch_id: "admin-edit-123",
      created_at: "2026-01-15T10:00:00Z",
    },
    {
      id: 2,
      old_value: null,
      new_value: "heart attack",
      source: "claude-enrichment",
      batch_id: null,
      created_at: "2026-01-10T10:00:00Z",
    },
  ]

  it("should return history for valid actor field", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 123 }] }) // actor exists check
      .mockResolvedValueOnce({ rows: mockHistoryRows }) // history query
      .mockResolvedValueOnce({ rows: [{ count: "2" }] }) // count query

    const res = await request(app).get("/admin/api/actors/123/history/cause_of_death")

    expect(res.status).toBe(200)
    expect(res.body.field).toBe("cause_of_death")
    expect(res.body.history).toHaveLength(2)
    expect(res.body.history[0].old_value).toBe("heart attack")
    expect(res.body.total).toBe(2)
    expect(res.body.hasMore).toBe(false)
  })

  it("should return history for circumstances field with prefix", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 123 }] })
      .mockResolvedValueOnce({ rows: mockHistoryRows })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })

    const res = await request(app).get(
      "/admin/api/actors/123/history/circumstances.circumstances"
    )

    expect(res.status).toBe(200)
    expect(res.body.field).toBe("circumstances.circumstances")
  })

  it("should return 404 for non-existent actor", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app).get("/admin/api/actors/999/history/cause_of_death")

    expect(res.status).toBe(404)
    expect(res.body.error.message).toBe("Actor not found")
  })

  it("should return 400 for invalid field name", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: 123 }] })

    const res = await request(app).get("/admin/api/actors/123/history/invalid_field")

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe("Invalid field name")
  })

  it("should respect limit parameter", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 123 }] })
      .mockResolvedValueOnce({ rows: mockHistoryRows.slice(0, 1) })
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })

    const res = await request(app).get("/admin/api/actors/123/history/cause_of_death?limit=1")

    expect(res.status).toBe(200)
    expect(res.body.history).toHaveLength(1)
    expect(res.body.hasMore).toBe(true)
  })

  it("should cap limit at 200", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 123 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })

    await request(app).get("/admin/api/actors/123/history/cause_of_death?limit=500")

    // Verify the query was called with capped limit
    const historyQueryCall = mockPool.query.mock.calls[1]
    expect(historyQueryCall[1]).toContain(200) // limit should be capped
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- --run actors.test.ts`

Expected: Tests fail with route not found (404)

**Step 3: Commit failing tests**

```bash
git add server/src/routes/admin/actors.test.ts
git commit -m "test: add failing tests for field history endpoint"
```

---

## Task 2: API Endpoint - Implementation

**Files:**
- Modify: `server/src/routes/admin/actors.ts`

**Step 1: Add the valid fields set for history lookup**

Add after `CIRCUMSTANCES_EDITABLE_FIELDS` (around line 95):

```typescript
// All fields that can have history queried
const HISTORY_QUERYABLE_FIELDS = new Set([
  ...ACTOR_EDITABLE_FIELDS,
  ...CIRCUMSTANCES_EDITABLE_FIELDS.map((f) => `circumstances.${f}`),
])
```

**Step 2: Add the history endpoint**

Add before the `export default router` line:

```typescript
// ============================================================================
// GET /admin/api/actors/:id/history/:field
// Get paginated history for a specific field
// ============================================================================

router.get("/:id(\\d+)/history/:field", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const actorId = parseInt(req.params.id, 10)
    const fieldName = req.params.field

    if (isNaN(actorId)) {
      res.status(400).json({ error: { message: "Invalid actor ID" } })
      return
    }

    // Validate field name
    if (!HISTORY_QUERYABLE_FIELDS.has(fieldName)) {
      res.status(400).json({ error: { message: "Invalid field name" } })
      return
    }

    // Verify actor exists
    const actorResult = await pool.query(`SELECT id FROM actors WHERE id = $1`, [actorId])
    if (actorResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Actor not found" } })
      return
    }

    // Parse pagination params
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200)
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0)

    // Query history
    const historyResult = await pool.query<{
      id: number
      old_value: string | null
      new_value: string | null
      source: string
      batch_id: string | null
      created_at: string
    }>(
      `SELECT id, old_value, new_value, source, batch_id, created_at
       FROM actor_death_info_history
       WHERE actor_id = $1 AND field_name = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [actorId, fieldName, limit, offset]
    )

    // Get total count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text as count
       FROM actor_death_info_history
       WHERE actor_id = $1 AND field_name = $2`,
      [actorId, fieldName]
    )

    const total = parseInt(countResult.rows[0]?.count || "0", 10)
    const hasMore = offset + historyResult.rows.length < total

    res.json({
      field: fieldName,
      history: historyResult.rows,
      total,
      hasMore,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch field history")
    res.status(500).json({ error: { message: "Failed to fetch field history" } })
  }
})
```

**Step 3: Run tests to verify they pass**

Run: `cd server && npm test -- --run actors.test.ts`

Expected: All tests pass

**Step 4: Commit implementation**

```bash
git add server/src/routes/admin/actors.ts
git commit -m "feat: add GET /admin/api/actors/:id/history/:field endpoint"
```

---

## Task 3: Frontend Hook - Write Failing Tests

**Files:**
- Create: `src/hooks/admin/useFieldHistory.test.tsx`

**Step 1: Create test file**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useFieldHistory } from "./useFieldHistory"

const mockHistoryResponse = {
  field: "cause_of_death",
  history: [
    {
      id: 1,
      old_value: "heart attack",
      new_value: "cardiac arrest",
      source: "admin-manual-edit",
      batch_id: "admin-edit-123",
      created_at: "2026-01-15T10:00:00Z",
    },
  ],
  total: 1,
  hasMore: false,
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useFieldHistory", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("should fetch history when enabled", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockHistoryResponse),
    })

    const { result } = renderHook(() => useFieldHistory(123, "cause_of_death", true), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].old_value).toBe("heart attack")
    expect(result.current.total).toBe(1)
    expect(result.current.hasMore).toBe(false)
    expect(mockFetch).toHaveBeenCalledWith(
      "/admin/api/actors/123/history/cause_of_death",
      expect.any(Object)
    )
  })

  it("should not fetch when disabled", () => {
    const { result } = renderHook(() => useFieldHistory(123, "cause_of_death", false), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.history).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("should not fetch when actorId is undefined", () => {
    const { result } = renderHook(() => useFieldHistory(undefined, "cause_of_death", true), {
      wrapper: createWrapper(),
    })

    expect(result.current.isLoading).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("should handle fetch errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: { message: "Invalid field" } }),
    })

    const { result } = renderHook(() => useFieldHistory(123, "invalid", true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error?.message).toBe("Invalid field")
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run useFieldHistory.test.tsx`

Expected: Tests fail with module not found

**Step 3: Commit failing tests**

```bash
git add src/hooks/admin/useFieldHistory.test.tsx
git commit -m "test: add failing tests for useFieldHistory hook"
```

---

## Task 4: Frontend Hook - Implementation

**Files:**
- Create: `src/hooks/admin/useFieldHistory.ts`

**Step 1: Create hook implementation**

```typescript
/**
 * React Query hook for lazy-loading field history.
 */

import { useQuery } from "@tanstack/react-query"

export interface FieldHistoryEntry {
  id: number
  old_value: string | null
  new_value: string | null
  source: string
  batch_id: string | null
  created_at: string
}

interface FieldHistoryResponse {
  field: string
  history: FieldHistoryEntry[]
  total: number
  hasMore: boolean
}

async function fetchFieldHistory(
  actorId: number,
  fieldName: string
): Promise<FieldHistoryResponse> {
  const response = await fetch(`/admin/api/actors/${actorId}/history/${fieldName}`, {
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to fetch history" } }))
    throw new Error(error.error?.message || "Failed to fetch history")
  }

  return response.json()
}

export interface UseFieldHistoryResult {
  history: FieldHistoryEntry[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  total: number
  hasMore: boolean
}

export function useFieldHistory(
  actorId: number | undefined,
  fieldName: string,
  enabled: boolean
): UseFieldHistoryResult {
  const query = useQuery({
    queryKey: ["admin", "actor", actorId, "history", fieldName],
    queryFn: () => fetchFieldHistory(actorId!, fieldName),
    enabled: enabled && !!actorId,
    staleTime: 60000, // 1 minute
  })

  return {
    history: query.data?.history ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    total: query.data?.total ?? 0,
    hasMore: query.data?.hasMore ?? false,
  }
}
```

**Step 2: Run tests to verify they pass**

Run: `npm test -- --run useFieldHistory.test.tsx`

Expected: All tests pass

**Step 3: Commit implementation**

```bash
git add src/hooks/admin/useFieldHistory.ts
git commit -m "feat: add useFieldHistory hook for lazy-loaded field history"
```

---

## Task 5: EditableField Enhancement - Write Failing Tests

**Files:**
- Modify: `src/components/admin/actor-editor/EditableField.test.tsx`

**Step 1: Add mock for useFieldHistory**

Add at the top of the file after imports:

```typescript
// Mock the useFieldHistory hook
vi.mock("../../../hooks/admin/useFieldHistory", () => ({
  useFieldHistory: vi.fn(() => ({
    history: [],
    isLoading: false,
    isError: false,
    error: null,
    total: 0,
    hasMore: false,
  })),
}))

import { useFieldHistory } from "../../../hooks/admin/useFieldHistory"
```

**Step 2: Add tests for expanded history panel**

Add this new describe block at the end before the closing `})`:

```typescript
describe("expanded history panel", () => {
  const mockFullHistory = [
    {
      id: 1,
      old_value: "value3",
      new_value: "value4",
      source: "admin-manual-edit",
      batch_id: "batch-1",
      created_at: "2026-01-15T10:00:00Z",
    },
    {
      id: 2,
      old_value: "value2",
      new_value: "value3",
      source: "claude-enrichment",
      batch_id: null,
      created_at: "2026-01-10T10:00:00Z",
    },
    {
      id: 3,
      old_value: "value1",
      new_value: "value2",
      source: "admin-manual-edit",
      batch_id: "batch-2",
      created_at: "2026-01-05T10:00:00Z",
    },
  ]

  it("should show loading state when fetching full history", () => {
    vi.mocked(useFieldHistory).mockReturnValue({
      history: [],
      isLoading: true,
      isError: false,
      error: null,
      total: 0,
      hasMore: false,
    })

    render(
      <EditableField
        name="test"
        label="Test Field"
        value="value4"
        onChange={vi.fn()}
        actorId={123}
        history={[mockFullHistory[0]]} // initial history from parent
      />
    )

    fireEvent.click(screen.getByText("Show history"))

    expect(screen.getByText("Loading history...")).toBeInTheDocument()
  })

  it("should show all history entries when expanded", () => {
    vi.mocked(useFieldHistory).mockReturnValue({
      history: mockFullHistory,
      isLoading: false,
      isError: false,
      error: null,
      total: 3,
      hasMore: false,
    })

    render(
      <EditableField
        name="test"
        label="Test Field"
        value="value4"
        onChange={vi.fn()}
        actorId={123}
        history={[mockFullHistory[0]]}
        onRevert={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText("Show history"))

    // Should show all 3 entries
    expect(screen.getAllByRole("button", { name: /Revert/i })).toHaveLength(3)
  })

  it("should call onRevert with correct value from any history row", () => {
    vi.mocked(useFieldHistory).mockReturnValue({
      history: mockFullHistory,
      isLoading: false,
      isError: false,
      error: null,
      total: 3,
      hasMore: false,
    })

    const handleRevert = vi.fn()
    render(
      <EditableField
        name="test"
        label="Test Field"
        value="value4"
        onChange={vi.fn()}
        actorId={123}
        history={[mockFullHistory[0]]}
        onRevert={handleRevert}
      />
    )

    fireEvent.click(screen.getByText("Show history"))

    // Click the third revert button (oldest entry)
    const revertButtons = screen.getAllByRole("button", { name: /Revert/i })
    fireEvent.click(revertButtons[2])

    expect(handleRevert).toHaveBeenCalledWith("value1")
  })

  it("should only fetch when panel is expanded", () => {
    vi.mocked(useFieldHistory).mockReturnValue({
      history: [],
      isLoading: false,
      isError: false,
      error: null,
      total: 0,
      hasMore: false,
    })

    render(
      <EditableField
        name="test"
        label="Test Field"
        value="value"
        onChange={vi.fn()}
        actorId={123}
        history={[mockFullHistory[0]]}
      />
    )

    // Initially not expanded - should be called with enabled=false
    expect(useFieldHistory).toHaveBeenLastCalledWith(123, "test", false)

    // Expand the panel
    fireEvent.click(screen.getByText("Show history"))

    // Now should be called with enabled=true
    expect(useFieldHistory).toHaveBeenLastCalledWith(123, "test", true)
  })
})
```

**Step 3: Run tests to verify they fail**

Run: `npm test -- --run EditableField.test.tsx`

Expected: Tests fail because EditableField doesn't have actorId prop or useFieldHistory integration

**Step 4: Commit failing tests**

```bash
git add src/components/admin/actor-editor/EditableField.test.tsx
git commit -m "test: add failing tests for expanded history panel"
```

---

## Task 6: EditableField Enhancement - Implementation

**Files:**
- Modify: `src/components/admin/actor-editor/EditableField.tsx`

**Step 1: Add import for useFieldHistory**

Add after the existing imports:

```typescript
import { useFieldHistory } from "../../../hooks/admin/useFieldHistory"
```

**Step 2: Add actorId prop to interface**

Update the `EditableFieldProps` interface:

```typescript
interface EditableFieldProps {
  name: string
  label: string
  value: unknown
  onChange: (value: unknown) => void
  type?: FieldType
  options?: { value: string; label: string }[]
  placeholder?: string
  helpText?: string
  disabled?: boolean
  history?: FieldChange[]
  onRevert?: (previousValue: string | null) => void
  className?: string
  actorId?: number  // Add this line
}
```

**Step 3: Update component to use hook and render expanded panel**

Update the component function (replace the entire component body):

```typescript
export default function EditableField({
  name,
  label,
  value,
  onChange,
  type = "text",
  options,
  placeholder,
  helpText,
  disabled = false,
  history = [],
  onRevert,
  className = "",
  actorId,
}: EditableFieldProps) {
  const [showFullHistory, setShowFullHistory] = useState(false)

  // Lazy-load full history when panel is expanded
  const {
    history: fullHistory,
    isLoading: isLoadingHistory,
  } = useFieldHistory(actorId, name, showFullHistory)

  const lastChange = history.length > 0 ? history[0] : null
  const hasHistory = history.length > 0

  // Use full history when expanded, otherwise use initial history
  const displayHistory = showFullHistory ? fullHistory : history.slice(0, 5)

  const handleRevert = (oldValue: string | null) => {
    if (onRevert) {
      onRevert(oldValue)
    }
  }

  const renderInput = () => {
    const baseInputClass =
      "w-full rounded border bg-admin-surface-inset px-3 py-2 text-admin-text-primary focus:outline-none focus:ring-1 border-admin-border focus:border-admin-interactive focus:ring-admin-interactive disabled:opacity-50 disabled:cursor-not-allowed"

    switch (type) {
      case "textarea":
        return (
          <textarea
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={placeholder}
            disabled={disabled}
            className={`${baseInputClass} min-h-[100px] resize-y`}
            rows={4}
          />
        )

      case "date":
        return (
          <input
            type="date"
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className={baseInputClass}
          />
        )

      case "boolean":
        return (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={name}
              name={name}
              checked={(value as boolean) ?? false}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
              className="h-4 w-4 rounded border-admin-border bg-admin-surface-inset text-admin-interactive focus:ring-admin-interactive"
            />
            <span className="text-sm text-admin-text-muted">{value ? "Yes" : "No"}</span>
          </div>
        )

      case "select":
        return (
          <select
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            className={baseInputClass}
          >
            <option value="">-- Select --</option>
            {options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )

      case "array": {
        const arrayValue = Array.isArray(value) ? value.join(", ") : ""
        return (
          <input
            type="text"
            id={name}
            name={name}
            value={arrayValue}
            onChange={(e) => {
              const newValue = e.target.value
                ? e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                : null
              onChange(newValue)
            }}
            placeholder={placeholder || "Enter values separated by commas"}
            disabled={disabled}
            className={baseInputClass}
          />
        )
      }

      default:
        return (
          <input
            type="text"
            id={name}
            name={name}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={placeholder}
            disabled={disabled}
            className={baseInputClass}
          />
        )
    }
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-sm font-medium text-admin-text-primary">
          {label}
        </label>
        {hasHistory && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFullHistory(!showFullHistory)}
              className="text-xs text-admin-text-muted hover:text-admin-text-primary"
              title="View history"
            >
              {showFullHistory ? "Hide history" : "Show history"}
            </button>
            {!showFullHistory && onRevert && lastChange && (
              <button
                type="button"
                onClick={() => handleRevert(lastChange.old_value)}
                className="bg-admin-surface-raised flex items-center gap-1 rounded px-2 py-1 text-xs text-admin-text-muted hover:bg-admin-surface-inset hover:text-admin-text-primary"
                title={`Revert to: ${lastChange.old_value ?? "(empty)"}`}
              >
                <span aria-hidden="true">&#8617;</span>
                Revert
              </button>
            )}
          </div>
        )}
      </div>

      {renderInput()}

      {helpText && <p className="text-xs text-admin-text-muted">{helpText}</p>}

      {lastChange && !showFullHistory && (
        <p className="text-xs text-admin-text-muted">
          Last changed: {new Date(lastChange.created_at).toLocaleDateString()} by{" "}
          {lastChange.source}
        </p>
      )}

      {showFullHistory && (
        <div className="bg-admin-surface-raised mt-2 max-h-[200px] overflow-y-auto rounded border border-admin-border p-2">
          <h4 className="mb-2 text-xs font-medium text-admin-text-primary">Change History</h4>
          {isLoadingHistory ? (
            <p className="text-xs text-admin-text-muted">Loading history...</p>
          ) : displayHistory.length === 0 ? (
            <p className="text-xs text-admin-text-muted">No history available</p>
          ) : (
            <ul className="space-y-2">
              {displayHistory.map((change, idx) => (
                <li
                  key={"id" in change ? change.id : idx}
                  className="flex items-start justify-between gap-2 rounded bg-admin-surface-inset p-2 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-admin-text-muted">
                      <span>{new Date(change.created_at).toLocaleDateString()}</span>
                      <span className="rounded bg-admin-surface-overlay px-1">{change.source}</span>
                    </div>
                    <div className="mt-1 truncate text-admin-text-primary">
                      <span className="text-admin-text-muted line-through">
                        {change.old_value || "(empty)"}
                      </span>
                      {" → "}
                      <span>{change.new_value || "(empty)"}</span>
                    </div>
                  </div>
                  {onRevert && (
                    <button
                      type="button"
                      onClick={() => handleRevert(change.old_value)}
                      className="shrink-0 rounded bg-admin-surface-overlay px-2 py-1 text-admin-text-muted hover:bg-admin-surface-raised hover:text-admin-text-primary"
                      title={`Revert to: ${change.old_value ?? "(empty)"}`}
                    >
                      Revert
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run EditableField.test.tsx`

Expected: All tests pass

**Step 5: Commit implementation**

```bash
git add src/components/admin/actor-editor/EditableField.tsx
git commit -m "feat: enhance EditableField with expanded history panel and revert-to-any"
```

---

## Task 7: Wire Up actorId in ActorEditorPage

**Files:**
- Modify: `src/pages/admin/ActorEditorPage.tsx`

**Step 1: Pass actorId to EditableField**

Find all `<EditableField` usages and add the `actorId` prop. There are three render locations (in each tab).

For Basic Info tab (around line 332):
```typescript
<EditableField
  key={field.name}
  name={field.name}
  label={field.label}
  type={field.type}
  options={field.options}
  value={getFieldValue("actor", field.name)}
  onChange={(value) => handleFieldChange("actor", field.name, value)}
  history={getFieldHistory(field.name)}
  onRevert={(oldValue) => handleFieldChange("actor", field.name, oldValue)}
  actorId={actorId}  // Add this line
/>
```

For Death Info tab (around line 350):
```typescript
<EditableField
  key={field.name}
  name={field.name}
  label={field.label}
  type={field.type}
  options={field.options}
  value={getFieldValue("actor", field.name)}
  onChange={(value) => handleFieldChange("actor", field.name, value)}
  history={getFieldHistory(field.name)}
  onRevert={(oldValue) => handleFieldChange("actor", field.name, oldValue)}
  className={field.type === "textarea" ? "md:col-span-2" : ""}
  actorId={actorId}  // Add this line
/>
```

For Circumstances tab (around line 370):
```typescript
<EditableField
  key={field.name}
  name={field.name}
  label={field.label}
  type={field.type}
  options={field.options}
  value={getFieldValue("circumstances", field.name)}
  onChange={(value) => handleFieldChange("circumstances", field.name, value)}
  history={getFieldHistory(`circumstances.${field.name}`)}
  onRevert={(oldValue) => handleFieldChange("circumstances", field.name, oldValue)}
  className={field.type === "textarea" ? "md:col-span-2" : ""}
  actorId={actorId}  // Add this line
/>
```

**Step 2: Run all tests**

Run: `npm test && cd server && npm test`

Expected: All tests pass

**Step 3: Commit integration**

```bash
git add src/pages/admin/ActorEditorPage.tsx
git commit -m "feat: wire up actorId to EditableField for history fetching"
```

---

## Task 8: Manual Testing & Lint Check

**Step 1: Run linter**

Run: `npm run lint && cd server && npm run lint`

Expected: No lint errors

**Step 2: Run type check**

Run: `npm run type-check && cd server && npm run type-check`

Expected: No type errors

**Step 3: Manual testing**

Start dev server: `npm run dev:all`

1. Navigate to `/admin/actors/{id}/edit` for an actor with history
2. Click "Show history" on a field
3. Verify history loads and displays all entries
4. Click "Revert" on an older entry
5. Verify the value is staged as a pending change
6. Save changes and verify it persists

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "chore: lint and type fixes for Phase 3"
```

---

## Summary

Phase 3 implementation complete. Changes:

| File | Change |
|------|--------|
| `server/src/routes/admin/actors.ts` | Added `GET /:id/history/:field` endpoint |
| `server/src/routes/admin/actors.test.ts` | Added 6 tests for history endpoint |
| `src/hooks/admin/useFieldHistory.ts` | Created lazy-loading hook |
| `src/hooks/admin/useFieldHistory.test.tsx` | Created 4 tests for hook |
| `src/components/admin/actor-editor/EditableField.tsx` | Enhanced with expanded panel |
| `src/components/admin/actor-editor/EditableField.test.tsx` | Added 4 tests for expansion |
| `src/pages/admin/ActorEditorPage.tsx` | Wired up actorId prop |
