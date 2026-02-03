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
