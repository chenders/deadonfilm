# Enrichment Logs Parity & Run-Level Log Capture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add rich per-actor log modals to biography enrichment (matching death enrichment), and add run-level all-log capture to both enrichment systems via a new `run_logs` table + `RunLogger` utility.

**Architecture:** New `run_logs` DB table stores all-level logs for both enrichment systems. A `RunLogger` utility buffers and flushes logs during enrichment runs. Shared React components (`ActorLogsModal`, `RunLogsSection`) provide consistent UI across both death and biography enrichment admin pages.

**Tech Stack:** PostgreSQL (migration), Express routes, React + TanStack Query, Vitest

**Design doc:** `docs/plans/2026-02-24-enrichment-logs-design.md`

---

### Task 1: Database Migration — `run_logs` Table

**Files:**
- Create: `server/migrations/{timestamp}_create-run-logs-table.cjs`

**Step 1: Create the migration**

```bash
cd server && npm run migrate:create -- create-run-logs-table
```

**Step 2: Write the migration**

Edit the generated file:

```javascript
/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.createTable("run_logs", {
    id: { type: "serial", primaryKey: true },
    run_type: { type: "text", notNull: true },
    run_id: { type: "integer", notNull: true },
    timestamp: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    level: { type: "text", notNull: true },
    message: { type: "text", notNull: true },
    data: { type: "jsonb" },
    source: { type: "text" },
  })

  pgm.createIndex("run_logs", ["run_type", "run_id", "timestamp"], {
    name: "idx_run_logs_lookup",
  })
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropTable("run_logs")
}
```

**Step 3: Run the migration**

```bash
cd server && npm run migrate:up
```

Expected: `Migrations complete` with table `run_logs` created.

**Step 4: Verify**

```bash
cd server && npx tsx -e "
import 'dotenv/config';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const r = await pool.query(\"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'run_logs' ORDER BY ordinal_position\");
console.log(r.rows);
await pool.end();
"
```

Expected: 7 columns (id, run_type, run_id, timestamp, level, message, data, source).

**Step 5: Commit**

```bash
git add server/migrations/*create-run-logs-table*
git commit -m "feat: add run_logs table for all-level enrichment log capture"
```

---

### Task 2: RunLogger Utility

**Files:**
- Create: `server/src/lib/run-logger.ts`
- Create: `server/src/lib/run-logger.test.ts`

**Step 1: Write the failing test**

Create `server/src/lib/run-logger.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the pool
const mockQuery = vi.fn().mockResolvedValue({ rows: [] })
vi.mock("./db/pool.js", () => ({
  getPool: () => ({ query: mockQuery }),
}))

import { RunLogger } from "./run-logger.js"

describe("RunLogger", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockQuery.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("buffers log entries and flushes on flush()", async () => {
    const logger = new RunLogger("death", 42)
    logger.info("Starting enrichment")
    logger.warn("Source failed", { source: "Wikidata" })
    logger.error("Fatal error")

    // Not yet flushed
    expect(mockQuery).not.toHaveBeenCalled()

    await logger.flush()

    expect(mockQuery).toHaveBeenCalledTimes(1)
    const [sql, params] = mockQuery.mock.calls[0]
    expect(sql).toContain("INSERT INTO run_logs")
    expect(params[0]).toBe("death")
    expect(params[1]).toBe(42)
    // 3 entries: timestamps, levels, messages, data arrays, sources array
    expect(params[2]).toHaveLength(3) // timestamps
    expect(params[3]).toEqual(["info", "warn", "error"]) // levels
    expect(params[4]).toEqual(["Starting enrichment", "Source failed", "Fatal error"])
  })

  it("auto-flushes when buffer reaches threshold", async () => {
    const logger = new RunLogger("biography", 10, { flushThreshold: 3 })
    logger.info("msg1")
    logger.info("msg2")
    expect(mockQuery).not.toHaveBeenCalled()

    logger.info("msg3") // triggers flush at threshold
    // Allow microtask to complete
    await vi.advanceTimersByTimeAsync(0)

    expect(mockQuery).toHaveBeenCalledTimes(1)
  })

  it("does nothing on flush() when buffer is empty", async () => {
    const logger = new RunLogger("death", 1)
    await logger.flush()
    expect(mockQuery).not.toHaveBeenCalled()
  })

  it("includes source field when provided", async () => {
    const logger = new RunLogger("death", 5)
    logger.info("Source result", { source: "Wikipedia", confidence: 0.8 }, "wikipedia")

    await logger.flush()

    const [, params] = mockQuery.mock.calls[0]
    expect(params[7]).toEqual(["wikipedia"]) // sources array
  })

  it("still console.logs in addition to buffering", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const logger = new RunLogger("death", 1)
    logger.info("test message")
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/lib/run-logger.test.ts
```

Expected: FAIL — cannot find `./run-logger.js`

**Step 3: Write the implementation**

Create `server/src/lib/run-logger.ts`:

```typescript
/**
 * RunLogger — buffers structured log entries and batch-inserts them into
 * the `run_logs` table. Both death and biography enrichment orchestrators
 * create an instance at run start and call flush() at the end.
 *
 * Logs are also written to console so Docker/process logs still work.
 */

import { getPool } from "./db/pool.js"

interface LogEntry {
  timestamp: Date
  level: string
  message: string
  data: Record<string, unknown> | null
  source: string | null
}

interface RunLoggerOptions {
  /** Number of buffered entries before auto-flush (default 50) */
  flushThreshold?: number
}

export class RunLogger {
  private buffer: LogEntry[] = []
  private readonly runType: string
  private readonly runId: number
  private readonly flushThreshold: number

  constructor(runType: "death" | "biography", runId: number, options?: RunLoggerOptions) {
    this.runType = runType
    this.runId = runId
    this.flushThreshold = options?.flushThreshold ?? 50
  }

  info(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("info", message, data, source)
  }

  warn(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("warn", message, data, source)
  }

  error(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("error", message, data, source)
  }

  debug(message: string, data?: Record<string, unknown>, source?: string): void {
    this.log("debug", message, data, source)
  }

  private log(level: string, message: string, data?: Record<string, unknown>, source?: string): void {
    const prefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : level === "debug" ? "DEBUG" : "INFO"
    const dataStr = data ? ` ${JSON.stringify(data)}` : ""
    console.log(`[${this.runType}:${this.runId}] [${prefix}] ${message}${dataStr}`)

    this.buffer.push({
      timestamp: new Date(),
      level,
      message,
      data: data ?? null,
      source: source ?? null,
    })

    if (this.buffer.length >= this.flushThreshold) {
      void this.flush()
    }
  }

  /** Flush all buffered entries to the database */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return

    const entries = this.buffer.splice(0)
    const pool = getPool()

    const timestamps = entries.map((e) => e.timestamp.toISOString())
    const levels = entries.map((e) => e.level)
    const messages = entries.map((e) => e.message)
    const dataArr = entries.map((e) => (e.data ? JSON.stringify(e.data) : null))
    const sources = entries.map((e) => e.source)

    try {
      await pool.query(
        `INSERT INTO run_logs (run_type, run_id, timestamp, level, message, data, source)
         SELECT $1, $2, t.ts::timestamptz, t.lvl, t.msg,
                CASE WHEN t.d IS NOT NULL THEN t.d::jsonb ELSE NULL END,
                t.src
         FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[])
           AS t(ts, lvl, msg, d, src)`,
        [this.runType, this.runId, timestamps, levels, messages, dataArr, sources]
      )
    } catch (err) {
      console.error("[RunLogger] Failed to flush logs:", err)
    }
  }
}
```

**Step 4: Run test to verify it passes**

```bash
cd server && npx vitest run src/lib/run-logger.test.ts
```

Expected: All 5 tests pass.

**Step 5: Commit**

```bash
git add server/src/lib/run-logger.ts server/src/lib/run-logger.test.ts
git commit -m "feat: add RunLogger utility for buffered DB log capture"
```

---

### Task 3: Run Logs API Endpoints (Both Systems)

**Files:**
- Modify: `server/src/routes/admin/enrichment.ts` — add `/runs/:id/run-logs` endpoint
- Modify: `server/src/routes/admin/biography-enrichment.ts` — add `/runs/:id/run-logs` and `/runs/:id/actors/:actorId/logs` endpoints
- Create: `server/src/routes/admin/run-logs.test.ts` — tests for both endpoints

**Step 1: Write the failing tests**

Create `server/src/routes/admin/run-logs.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockQuery = vi.fn()
vi.mock("../../lib/db/pool.js", () => ({
  getPool: () => ({ query: mockQuery }),
}))
vi.mock("../../middleware/admin-auth.js", () => ({
  adminAuthMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import express from "express"
import request from "supertest"

// We'll test the shared handler logic
import { createRunLogsHandler } from "./run-logs-handler.js"

describe("run logs handler", () => {
  const app = express()
  app.get("/run-logs", createRunLogsHandler("death"))
  app.get("/bio-run-logs", createRunLogsHandler("biography"))

  beforeEach(() => {
    mockQuery.mockReset()
  })

  it("returns paginated run logs filtered by run_type and run_id", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "5" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            timestamp: "2026-02-24T00:00:00Z",
            level: "info",
            message: "Starting enrichment",
            data: null,
            source: null,
          },
        ],
      })

    const res = await request(app).get("/run-logs?runId=42&page=1&pageSize=50")
    expect(res.status).toBe(200)
    expect(res.body.logs).toHaveLength(1)
    expect(res.body.logs[0].message).toBe("Starting enrichment")
    expect(res.body.pagination.total).toBe(5)
  })

  it("filters by level when provided", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 2, timestamp: "2026-02-24T00:00:00Z", level: "error", message: "Failed", data: null, source: null },
        ],
      })

    const res = await request(app).get("/run-logs?runId=42&level=error")
    expect(res.status).toBe(200)

    // Verify level filter was applied in the SQL
    const countCall = mockQuery.mock.calls[0]
    expect(countCall[0]).toContain("level = $")
  })

  it("returns 400 for missing runId", async () => {
    const res = await request(app).get("/run-logs")
    expect(res.status).toBe(400)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd server && npx vitest run src/routes/admin/run-logs.test.ts
```

Expected: FAIL — cannot find `./run-logs-handler.js`

**Step 3: Write the shared handler**

Create `server/src/routes/admin/run-logs-handler.ts`:

```typescript
/**
 * Shared handler factory for run_logs queries.
 * Used by both death and biography enrichment routes.
 */

import { Request, Response } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

export function createRunLogsHandler(runType: "death" | "biography") {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const pool = getPool()
      const runId = parseInt((req.params.id ?? req.query.runId) as string, 10)

      if (isNaN(runId)) {
        res.status(400).json({ error: { message: "Invalid or missing run ID" } })
        return
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50))
      const level = req.query.level as string | undefined

      const conditions = ["run_type = $1", "run_id = $2"]
      const params: (string | number)[] = [runType, runId]
      let paramIndex = 3

      if (level && ["info", "warn", "error", "debug"].includes(level)) {
        conditions.push(`level = $${paramIndex}`)
        params.push(level)
        paramIndex++
      }

      const whereClause = conditions.join(" AND ")

      const [countResult, logsResult] = await Promise.all([
        pool.query<{ total: string }>(`SELECT COUNT(*) as total FROM run_logs WHERE ${whereClause}`, params),
        pool.query(
          `SELECT id, timestamp, level, message, data, source
           FROM run_logs
           WHERE ${whereClause}
           ORDER BY timestamp ASC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, pageSize, (page - 1) * pageSize]
        ),
      ])

      const total = parseInt(countResult.rows[0]?.total ?? "0", 10)

      res.json({
        logs: logsResult.rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    } catch (error) {
      logger.error({ error }, `Failed to fetch ${runType} run logs`)
      res.status(500).json({ error: { message: `Failed to fetch ${runType} run logs` } })
    }
  }
}
```

**Step 4: Wire into death enrichment routes**

Add to `server/src/routes/admin/enrichment.ts` (after existing `/runs/:id/logs` endpoint):

```typescript
import { createRunLogsHandler } from "./run-logs-handler.js"

// Run-level logs (all levels, from run_logs table)
router.get("/runs/:id/run-logs", createRunLogsHandler("death"))
```

**Step 5: Wire into bio enrichment routes + add actor logs endpoint**

Add to `server/src/routes/admin/biography-enrichment.ts`:

```typescript
import { createRunLogsHandler } from "./run-logs-handler.js"

// Run-level logs (all levels, from run_logs table)
router.get("/runs/:id/run-logs", createRunLogsHandler("biography"))

// Per-actor logs (from bio_enrichment_run_actors.log_entries)
router.get("/runs/:id/actors/:actorId/logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)
    const actorId = parseInt(req.params.actorId, 10)

    if (isNaN(runId) || isNaN(actorId)) {
      res.status(400).json({ error: { message: "Invalid run ID or actor ID" } })
      return
    }

    const result = await pool.query<{ log_entries: unknown[]; actor_name: string }>(
      `SELECT bra.log_entries, a.name AS actor_name
       FROM bio_enrichment_run_actors bra
       JOIN actors a ON a.id = bra.actor_id
       WHERE bra.run_id = $1 AND bra.actor_id = $2`,
      [runId, actorId]
    )

    const row = result.rows[0]
    if (!row) {
      res.status(404).json({ error: { message: "Not found" } })
      return
    }

    res.json({
      actorName: row.actor_name,
      logEntries: row.log_entries || [],
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch bio actor enrichment logs")
    res.status(500).json({ error: { message: "Failed to fetch bio actor enrichment logs" } })
  }
})
```

**Step 6: Run tests**

```bash
cd server && npx vitest run src/routes/admin/run-logs.test.ts
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add server/src/routes/admin/run-logs-handler.ts server/src/routes/admin/run-logs.test.ts server/src/routes/admin/enrichment.ts server/src/routes/admin/biography-enrichment.ts
git commit -m "feat: add run-logs API endpoints for both enrichment systems"
```

---

### Task 4: Shared ActorLogsModal Component

**Files:**
- Create: `src/components/admin/ActorLogsModal.tsx`
- Modify: `src/pages/admin/EnrichmentRunDetailsPage.tsx` — remove inline modal, import shared
- Modify: `src/hooks/admin/useEnrichmentRuns.ts` — export `ActorLogEntry` type (already exported)

**Step 1: Extract ActorLogsModal into shared component**

Create `src/components/admin/ActorLogsModal.tsx`:

Extract the `ActorLogsModal` function component (currently at lines 673-797 of `EnrichmentRunDetailsPage.tsx`) and the `ActorLogEntryRow` helper and constants (`ACTOR_LOG_LEVEL_BADGE`, `COLLAPSIBLE_MESSAGES`) into this new file.

The component accepts these props:

```typescript
import type { ActorLogEntry } from "../../hooks/admin/useEnrichmentRuns"

interface ActorLogsModalProps {
  title: string       // e.g. "Enrichment Logs: Sam Bottoms"
  subtitle: string    // e.g. "Run #162 / Actor #6361"
  logEntries: ActorLogEntry[] | undefined
  isLoading: boolean
  error: Error | null
  onClose: () => void
}
```

Keep all the existing rendering logic: timestamp formatting (HH:MM:SS), level badges with colors, JSON payload rendering in `<pre>` blocks, collapsible `[CLAUDE_REQUEST]` and `[CLAUDE_RESPONSE]` sections.

**Step 2: Update EnrichmentRunDetailsPage to use shared component**

In `src/pages/admin/EnrichmentRunDetailsPage.tsx`:
- Remove the inline `ActorLogsModal`, `ActorLogEntryRow`, `ACTOR_LOG_LEVEL_BADGE`, and `COLLAPSIBLE_MESSAGES` code (~130 lines)
- Add import: `import { ActorLogsModal } from "../../components/admin/ActorLogsModal"`
- Update the modal rendering site to pass the new props:

```tsx
{selectedActorForLogs && (
  <ActorLogsModal
    title={`Enrichment Logs: ${selectedActorForLogs.actorName}`}
    subtitle={`Run #${runId} / Actor #${selectedActorForLogs.actorId}`}
    logEntries={actorLogs?.logEntries}
    isLoading={actorLogsLoading}
    error={actorLogsError}
    onClose={() => setSelectedActorForLogs(null)}
  />
)}
```

**Step 3: Verify death enrichment page still works**

```bash
npm test -- --run src/pages/admin/EnrichmentRunDetailsPage
```

Expected: Existing tests pass.

**Step 4: Commit**

```bash
git add src/components/admin/ActorLogsModal.tsx src/pages/admin/EnrichmentRunDetailsPage.tsx
git commit -m "refactor: extract ActorLogsModal into shared component"
```

---

### Task 5: Bio Enrichment — Actor Logs Modal + Hook

**Files:**
- Modify: `src/hooks/admin/useBioEnrichmentRuns.ts` — add `useBioActorEnrichmentLogs` hook
- Modify: `src/pages/admin/BioEnrichmentRunDetailsPage.tsx` — replace inline logs with "View" button + modal

**Step 1: Add hook for fetching bio actor logs**

In `src/hooks/admin/useBioEnrichmentRuns.ts`, add:

```typescript
import type { ActorLogEntry, ActorLogsResponse } from "./useEnrichmentRuns"

export function useBioActorEnrichmentLogs(
  runId: number,
  actorId: number | null
): UseQueryResult<ActorLogsResponse> {
  return useQuery({
    queryKey: ["bio-enrichment-run", runId, "actors", actorId, "logs"],
    queryFn: () =>
      fetchJson<ActorLogsResponse>(
        `${BASE_URL}/runs/${runId}/actors/${actorId}/logs`
      ),
    staleTime: 60000,
    enabled: !!runId && !!actorId,
  })
}
```

**Step 2: Update BioEnrichmentRunDetailsPage**

In `src/pages/admin/BioEnrichmentRunDetailsPage.tsx`:

1. Import the shared modal and hook:
```typescript
import { ActorLogsModal } from "../../components/admin/ActorLogsModal"
import { useBioActorEnrichmentLogs } from "../../hooks/admin/useBioEnrichmentRuns"
```

2. Add state for selected actor:
```typescript
const [selectedActorForLogs, setSelectedActorForLogs] = useState<{
  actorId: number
  actorName: string
} | null>(null)

const { data: actorLogs, isLoading: actorLogsLoading, error: actorLogsError } =
  useBioActorEnrichmentLogs(runId, selectedActorForLogs?.actorId ?? null)
```

3. In the actor results table, replace the "Show (N)" / "Hide (N)" button with a "View" button that opens the modal:
```tsx
<button onClick={() => setSelectedActorForLogs({ actorId: actor.actor_id, actorName: actor.actor_name })}>
  View
</button>
```

4. Remove the inline expandable log section (the row that shows log entries and sources attempted inline).

5. Add the modal at the bottom of the component:
```tsx
{selectedActorForLogs && (
  <ActorLogsModal
    title={`Biography Logs: ${selectedActorForLogs.actorName}`}
    subtitle={`Run #${runId} / Actor #${selectedActorForLogs.actorId}`}
    logEntries={actorLogs?.logEntries}
    isLoading={actorLogsLoading}
    error={actorLogsError}
    onClose={() => setSelectedActorForLogs(null)}
  />
)}
```

**Step 3: Run tests**

```bash
npm test -- --run src/pages/admin/BioEnrichmentRunDetailsPage
```

Expected: Tests pass (update assertions if they reference inline log expansion).

**Step 4: Commit**

```bash
git add src/hooks/admin/useBioEnrichmentRuns.ts src/pages/admin/BioEnrichmentRunDetailsPage.tsx
git commit -m "feat: add actor logs modal to bio enrichment run details"
```

---

### Task 6: Shared RunLogsSection Component + Hooks

**Files:**
- Create: `src/components/admin/RunLogsSection.tsx`
- Modify: `src/hooks/admin/useEnrichmentRuns.ts` — add `useRunLogs` hook
- Modify: `src/pages/admin/EnrichmentRunDetailsPage.tsx` — add RunLogsSection
- Modify: `src/pages/admin/BioEnrichmentRunDetailsPage.tsx` — add RunLogsSection

**Step 1: Add the useRunLogs hook**

In `src/hooks/admin/useEnrichmentRuns.ts`, add:

```typescript
export interface RunLog {
  id: number
  timestamp: string
  level: string
  message: string
  data: Record<string, unknown> | null
  source: string | null
}

export interface RunLogsResponse {
  logs: RunLog[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export function useRunLogs(
  runType: "death" | "biography",
  runId: number,
  page: number = 1,
  pageSize: number = 50,
  level?: string
): UseQueryResult<RunLogsResponse> {
  const baseUrl = runType === "death"
    ? "/admin/api/enrichment"
    : "/admin/api/biography-enrichment"

  return useQuery({
    queryKey: ["run-logs", runType, runId, page, pageSize, level],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (level) params.set("level", level)
      const res = await fetch(`${baseUrl}/runs/${runId}/run-logs?${params}`)
      if (!res.ok) throw new Error("Failed to fetch run logs")
      return res.json()
    },
    staleTime: 30000,
    enabled: !!runId,
  })
}
```

**Step 2: Create RunLogsSection component**

Create `src/components/admin/RunLogsSection.tsx`:

```tsx
import { useState } from "react"
import { useRunLogs } from "../../hooks/admin/useEnrichmentRuns"

const LEVEL_COLORS: Record<string, string> = {
  info: "bg-blue-500/20 text-blue-300",
  warn: "bg-yellow-500/20 text-yellow-300",
  error: "bg-red-500/20 text-red-300",
  debug: "bg-gray-500/20 text-gray-300",
}

interface RunLogsSectionProps {
  runType: "death" | "biography"
  runId: number
}

export function RunLogsSection({ runType, runId }: RunLogsSectionProps) {
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState<string | undefined>(undefined)
  const { data, isLoading } = useRunLogs(runType, runId, page, 50, level)

  return (
    <div className="rounded-lg border border-admin-card-border bg-admin-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-admin-text-primary">Run Logs</h2>
        <select
          value={level ?? ""}
          onChange={(e) => { setLevel(e.target.value || undefined); setPage(1) }}
          className="rounded border border-admin-card-border bg-admin-card px-3 py-1.5 text-sm text-admin-text-primary"
        >
          <option value="">All Levels</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="debug">Debug</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-admin-text-muted">Loading logs...</p>
      ) : !data || data.logs.length === 0 ? (
        <p className="text-sm text-admin-text-muted">No run logs found. Run logs will appear here for new enrichment runs.</p>
      ) : (
        <>
          <div className="space-y-2">
            {data.logs.map((log) => (
              <div key={log.id} className="rounded border border-admin-card-border p-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-mono text-admin-text-muted">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${LEVEL_COLORS[log.level] ?? LEVEL_COLORS.info}`}>
                    {log.level}
                  </span>
                  {log.source && (
                    <span className="text-xs text-admin-text-muted">[{log.source}]</span>
                  )}
                  <span className="text-sm text-admin-text-primary">{log.message}</span>
                </div>
                {log.data && (
                  <pre className="mt-2 overflow-x-auto rounded bg-admin-surface p-2 text-xs text-admin-text-secondary">
                    {JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>

          {data.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-admin-text-muted">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-admin-card-border px-3 py-1 text-xs text-admin-text-primary disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= (data?.pagination.totalPages ?? 1)}
                  className="rounded border border-admin-card-border px-3 py-1 text-xs text-admin-text-primary disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

**Step 3: Add RunLogsSection to both pages**

In `src/pages/admin/EnrichmentRunDetailsPage.tsx`, add after the existing "Error Logs" section:

```tsx
import { RunLogsSection } from "../../components/admin/RunLogsSection"

// In the JSX, after the Error Logs section:
<RunLogsSection runType="death" runId={runId} />
```

In `src/pages/admin/BioEnrichmentRunDetailsPage.tsx`, add after the Actor Results section:

```tsx
import { RunLogsSection } from "../../components/admin/RunLogsSection"

// In the JSX, after Configuration section:
<RunLogsSection runType="biography" runId={runId} />
```

**Step 4: Run all tests**

```bash
npm test -- --run
```

Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/components/admin/RunLogsSection.tsx src/hooks/admin/useEnrichmentRuns.ts src/pages/admin/EnrichmentRunDetailsPage.tsx src/pages/admin/BioEnrichmentRunDetailsPage.tsx
git commit -m "feat: add RunLogsSection to both enrichment run detail pages"
```

---

### Task 7: Wire Orchestrators to RunLogger

**Files:**
- Modify: `server/src/lib/death-sources/orchestrator.ts` — replace console.log with RunLogger
- Modify: `server/src/lib/biography-sources/orchestrator.ts` — replace console.log with RunLogger

**Step 1: Wire death enrichment orchestrator**

In `server/src/lib/death-sources/orchestrator.ts`:

1. Import RunLogger:
```typescript
import { RunLogger } from "../run-logger.js"
```

2. Add `runLogger` as a class property. Initialize it when `runId` is known (in `enrichBatch` or when run record is created). If no `runId` is available, the logger can be created with a temporary ID and updated later.

3. Replace the `console.log` calls throughout the file with `this.runLogger.info(...)`, `.warn(...)`, `.error(...)`:

Key replacements:
- Line 323: `console.log(\`Initialized...\`)` → `this.runLogger.info(\`Initialized...\`)`
- Lines 1024-1029 (cost limit): → `this.runLogger.warn("Cost limit reached", { processed: i+1, total: actors.length })`
- Lines 1057-1060 (batch complete): → `this.runLogger.info("Batch enrichment complete!")`
- Lines 1212-1247 (stats summary): → `this.runLogger.info("Run summary", { ...stats })`

4. Call `await this.runLogger.flush()` at the end of `enrichBatch()`.

**Step 2: Wire biography enrichment orchestrator**

In `server/src/lib/biography-sources/orchestrator.ts`:

Same pattern:

1. Import RunLogger
2. Add `runLogger` property, initialized when run starts
3. Replace `console.log` calls:
- Line 247: `console.log(\`Initialized...\`)` → `this.runLogger.info(...)`
- Line 282: `console.log(\`Enriching biography: ${actor.name}\`)` → `this.runLogger.info(...)`
- Line 288: `console.log(\`  Trying ${source.name}\`)` → `this.runLogger.info("Trying source", { source: source.name }, source.type)`
- Line 309: `console.log(\`    Failed: ...\`)` → `this.runLogger.warn("Source failed", { source: source.name, error: ... }, source.type)`
- Line 400: `console.log(\`  Running Claude synthesis...\`)` → `this.runLogger.info("Running Claude synthesis", { sourceCount: rawSources.length })`
- Lines 531-536: `console.log(\`Starting batch...\`)` → `this.runLogger.info("Starting biography batch enrichment", { actorCount: actors.length })`
- Lines 582-588: `console.log(\`Batch complete...\`)` → `this.runLogger.info("Batch complete", { processed, enriched, fillRate, totalCost })`

4. Call `await this.runLogger.flush()` at the end of `enrichBatch()`.

**Step 3: Run all server tests**

```bash
cd server && npm test
```

Expected: All tests pass. Some tests may need updating if they mock console.log — update those to account for RunLogger.

**Step 4: Run quality checks**

```bash
npm run lint && npm run type-check
```

Expected: No errors.

**Step 5: Commit**

```bash
git add server/src/lib/death-sources/orchestrator.ts server/src/lib/biography-sources/orchestrator.ts
git commit -m "feat: wire orchestrators to RunLogger for all-level DB log capture"
```

---

## Testing Checklist

After all tasks are complete:

1. **Unit tests**: `npm test && cd server && npm test` — all pass
2. **Type checking**: `npm run type-check` — no errors
3. **Linting**: `npm run lint` — no errors
4. **Manual testing** (requires dev server with production DB):
   - Death enrichment run details page loads RunLogsSection (empty for existing runs, populated for new runs)
   - Death enrichment actor logs modal still works (shared component)
   - Bio enrichment run details page shows "View" button instead of inline logs
   - Bio enrichment actor logs modal opens with proper formatting
   - Bio enrichment RunLogsSection visible
   - Level filtering works in RunLogsSection
   - Pagination works in RunLogsSection
5. **Take "after" screenshots** for PR

## File Summary

| Action | File |
|--------|------|
| Create | `server/migrations/*_create-run-logs-table.cjs` |
| Create | `server/src/lib/run-logger.ts` |
| Create | `server/src/lib/run-logger.test.ts` |
| Create | `server/src/routes/admin/run-logs-handler.ts` |
| Create | `server/src/routes/admin/run-logs.test.ts` |
| Create | `src/components/admin/ActorLogsModal.tsx` |
| Create | `src/components/admin/RunLogsSection.tsx` |
| Modify | `server/src/routes/admin/enrichment.ts` |
| Modify | `server/src/routes/admin/biography-enrichment.ts` |
| Modify | `src/pages/admin/EnrichmentRunDetailsPage.tsx` |
| Modify | `src/pages/admin/BioEnrichmentRunDetailsPage.tsx` |
| Modify | `src/hooks/admin/useEnrichmentRuns.ts` |
| Modify | `src/hooks/admin/useBioEnrichmentRuns.ts` |
| Modify | `server/src/lib/death-sources/orchestrator.ts` |
| Modify | `server/src/lib/biography-sources/orchestrator.ts` |
