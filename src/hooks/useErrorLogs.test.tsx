import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  useErrorLogs,
  useErrorLog,
  useErrorLogStats,
  useCleanupErrorLogs,
  errorLogKeys,
  type ErrorLog,
  type ErrorLogsResponse,
  type ErrorLogStats,
} from "./useErrorLogs"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("useErrorLogs hooks", () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    mockFetch.mockReset()
  })

  afterEach(() => {
    queryClient.clear()
  })

  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  describe("errorLogKeys", () => {
    it("generates correct query keys", () => {
      expect(errorLogKeys.all).toEqual(["admin", "logs"])
      expect(errorLogKeys.list({ page: 1 })).toEqual(["admin", "logs", "list", { page: 1 }])
      expect(errorLogKeys.detail(123)).toEqual(["admin", "logs", "detail", 123])
      expect(errorLogKeys.stats()).toEqual(["admin", "logs", "stats"])
    })

    it("generates list key with all filters", () => {
      const filters = {
        level: "error" as const,
        source: "route" as const,
        search: "test",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        page: 2,
        pageSize: 25,
      }
      expect(errorLogKeys.list(filters)).toEqual(["admin", "logs", "list", filters])
    })
  })

  describe("useErrorLogs", () => {
    const mockLogsResponse: ErrorLogsResponse = {
      logs: [
        {
          id: 1,
          level: "error",
          source: "route",
          message: "Test error",
          details: null,
          request_id: "req_123",
          path: "/api/test",
          method: "GET",
          script_name: null,
          job_name: null,
          error_stack: "Error: Test\n  at test.ts:1",
          created_at: "2026-01-28T12:00:00Z",
        },
      ],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      },
    }

    it("fetches logs successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogsResponse),
      })

      const { result } = renderHook(() => useErrorLogs({}), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockLogsResponse)
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/logs?", { credentials: "include" })
    })

    it("includes filters in query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogsResponse),
      })

      const { result } = renderHook(
        () =>
          useErrorLogs({
            level: "error",
            source: "route",
            search: "test query",
            page: 2,
            pageSize: 25,
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // Verify the URL contains all expected params
      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain("level=error")
      expect(callUrl).toContain("source=route")
      expect(callUrl).toContain("search=test+query")
      expect(callUrl).toContain("page=2")
      expect(callUrl).toContain("pageSize=25")
    })

    it("includes date filters in query params", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLogsResponse),
      })

      const { result } = renderHook(
        () =>
          useErrorLogs({
            startDate: "2026-01-01",
            endDate: "2026-01-31",
          }),
        { wrapper }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const callUrl = mockFetch.mock.calls[0][0] as string
      expect(callUrl).toContain("startDate=2026-01-01")
      expect(callUrl).toContain("endDate=2026-01-31")
    })

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { result } = renderHook(() => useErrorLogs({}), { wrapper })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe("Failed to fetch error logs")
    })

    it("supports refetchInterval", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockLogsResponse),
      })

      renderHook(() => useErrorLogs({}, 5000), { wrapper })

      // The hook should be configured with refetchInterval
      // We can verify the query was created successfully
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
    })
  })

  describe("useErrorLog", () => {
    const mockLog: ErrorLog = {
      id: 123,
      level: "error",
      source: "route",
      message: "Detailed error",
      details: { extra: "info" },
      request_id: "req_456",
      path: "/api/actor/123",
      method: "GET",
      script_name: null,
      job_name: null,
      error_stack: "Error: Detailed\n  at detailed.ts:10",
      created_at: "2026-01-28T12:30:00Z",
    }

    it("fetches single log by id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLog),
      })

      const { result } = renderHook(() => useErrorLog(123), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockLog)
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/logs/123", { credentials: "include" })
    })

    it("does not fetch when id is 0", async () => {
      const { result } = renderHook(() => useErrorLog(0), { wrapper })

      expect(result.current.fetchStatus).toBe("idle")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("does not fetch when id is negative", async () => {
      const { result } = renderHook(() => useErrorLog(-1), { wrapper })

      expect(result.current.fetchStatus).toBe("idle")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const { result } = renderHook(() => useErrorLog(999), { wrapper })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe("Failed to fetch error log details")
    })
  })

  describe("useErrorLogStats", () => {
    const mockStats: ErrorLogStats = {
      totals: {
        total_24h: 100,
        errors_24h: 25,
        fatals_24h: 2,
      },
      byLevel: [
        { level: "error", count: 25 },
        { level: "warn", count: 50 },
        { level: "info", count: 23 },
      ],
      bySource: [
        { source: "route", count: 60 },
        { source: "script", count: 30 },
        { source: "cronjob", count: 10 },
      ],
      timeline: [
        { hour: "2026-01-28T10:00:00Z", count: 10 },
        { hour: "2026-01-28T11:00:00Z", count: 15 },
        { hour: "2026-01-28T12:00:00Z", count: 8 },
      ],
      topMessages: [
        {
          message_preview: "Connection timeout",
          count: 15,
          last_occurred: "2026-01-28T12:30:00Z",
        },
        {
          message_preview: "Invalid request",
          count: 10,
          last_occurred: "2026-01-28T12:25:00Z",
        },
      ],
    }

    it("fetches stats successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStats),
      })

      const { result } = renderHook(() => useErrorLogStats(), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockStats)
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/logs/stats", { credentials: "include" })
    })

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { result } = renderHook(() => useErrorLogStats(), { wrapper })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe("Failed to fetch error log stats")
    })

    it("supports refetchInterval", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStats),
      })

      renderHook(() => useErrorLogStats(10000), { wrapper })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled()
      })
    })
  })

  describe("useCleanupErrorLogs", () => {
    it("cleans up old logs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, deleted: 150 }),
      })

      const { result } = renderHook(() => useCleanupErrorLogs(), { wrapper })

      result.current.mutate(30)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual({ success: true, deleted: 150 })
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/logs/cleanup", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysToKeep: 30 }),
      })
    })

    it("invalidates queries on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, deleted: 50 }),
      })

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

      const { result } = renderHook(() => useCleanupErrorLogs(), { wrapper })

      result.current.mutate(14)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: errorLogKeys.all })
    })

    it("handles cleanup error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { result } = renderHook(() => useCleanupErrorLogs(), { wrapper })

      result.current.mutate(30)

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe("Failed to cleanup error logs")
    })
  })
})
