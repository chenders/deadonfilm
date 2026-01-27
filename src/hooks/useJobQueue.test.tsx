import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  useQueueStats,
  useQueueDetail,
  useJobRuns,
  useJobRun,
  useDeadLetterQueue,
  useJobStats,
  useRetryJob,
  usePauseQueue,
  useResumeQueue,
  useCleanupJobs,
  useReviewDeadLetterJob,
  jobQueueKeys,
} from "./useJobQueue"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

describe("useJobQueue hooks", () => {
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

  describe("jobQueueKeys", () => {
    it("generates correct query keys", () => {
      expect(jobQueueKeys.all).toEqual(["admin", "jobs"])
      expect(jobQueueKeys.queues()).toEqual(["admin", "jobs", "queues"])
      expect(jobQueueKeys.queue("ratings")).toEqual(["admin", "jobs", "queue", "ratings"])
      expect(jobQueueKeys.runs({ page: 1, status: "failed" })).toEqual([
        "admin",
        "jobs",
        "runs",
        { page: 1, status: "failed" },
      ])
      expect(jobQueueKeys.run(123)).toEqual(["admin", "jobs", "run", 123])
      expect(jobQueueKeys.deadLetter(1, 20, false)).toEqual([
        "admin",
        "jobs",
        "dead-letter",
        { page: 1, pageSize: 20, reviewed: false },
      ])
      expect(jobQueueKeys.stats()).toEqual(["admin", "jobs", "stats"])
    })
  })

  describe("useQueueStats", () => {
    it("fetches queue stats successfully", async () => {
      const mockData = {
        queues: [
          {
            name: "ratings",
            waiting: 5,
            active: 2,
            completed: 100,
            failed: 3,
            delayed: 0,
            isPaused: false,
          },
        ],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const { result } = renderHook(() => useQueueStats(0), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/queues", { credentials: "include" })
    })

    it("handles fetch error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const { result } = renderHook(() => useQueueStats(0), { wrapper })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeDefined()
    })
  })

  describe("useQueueDetail", () => {
    it("fetches queue details", async () => {
      const mockData = {
        name: "ratings",
        stats: { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 0, isPaused: false },
        recentJobs: [],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const { result } = renderHook(() => useQueueDetail("ratings"), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/queue/ratings", {
        credentials: "include",
      })
    })

    it("does not fetch when name is empty", async () => {
      const { result } = renderHook(() => useQueueDetail(""), { wrapper })

      expect(result.current.fetchStatus).toBe("idle")
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("useJobRuns", () => {
    it("fetches job runs with filters", async () => {
      const mockData = {
        runs: [{ id: 1, job_id: "test-job", status: "completed" }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const { result } = renderHook(() => useJobRuns({ page: 1, pageSize: 20, status: "failed" }), {
        wrapper,
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/api/jobs/runs?"),
        expect.any(Object)
      )
    })
  })

  describe("useJobRun", () => {
    it("fetches single job run", async () => {
      const mockData = {
        id: 1,
        job_id: "test-job",
        status: "completed",
        payload: {},
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const { result } = renderHook(() => useJobRun(1), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/runs/1", { credentials: "include" })
    })

    it("does not fetch when id is 0", async () => {
      const { result } = renderHook(() => useJobRun(0), { wrapper })

      expect(result.current.fetchStatus).toBe("idle")
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe("useDeadLetterQueue", () => {
    it("fetches dead letter queue with pagination", async () => {
      const mockData = {
        jobs: [{ id: 1, job_id: "failed-job", final_error: "Test error" }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const { result } = renderHook(() => useDeadLetterQueue(1, 20, false), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/api/jobs/dead-letter?"),
        expect.any(Object)
      )
    })
  })

  describe("useJobStats", () => {
    it("fetches job statistics", async () => {
      const mockData = {
        successRates: [],
        durations: [],
        deadLetterQueue: [],
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      })

      const { result } = renderHook(() => useJobStats(), { wrapper })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockData)
      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/stats", { credentials: "include" })
    })
  })

  describe("useRetryJob", () => {
    it("retries a failed job", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, jobId: "new-job-id" }),
      })

      const { result } = renderHook(() => useRetryJob(), { wrapper })

      result.current.mutate(123)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/runs/123/retry", {
        method: "POST",
        credentials: "include",
      })
    })

    it("invalidates queries on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, jobId: "new-job-id" }),
      })

      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")

      const { result } = renderHook(() => useRetryJob(), { wrapper })

      result.current.mutate(123)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: jobQueueKeys.all })
    })
  })

  describe("usePauseQueue", () => {
    it("pauses a queue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => usePauseQueue(), { wrapper })

      result.current.mutate("ratings")

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/queue/ratings/pause", {
        method: "POST",
        credentials: "include",
      })
    })
  })

  describe("useResumeQueue", () => {
    it("resumes a paused queue", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useResumeQueue(), { wrapper })

      result.current.mutate("ratings")

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/queue/ratings/resume", {
        method: "POST",
        credentials: "include",
      })
    })
  })

  describe("useCleanupJobs", () => {
    it("cleans up old jobs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, cleaned: 42 }),
      })

      const { result } = renderHook(() => useCleanupJobs(), { wrapper })

      result.current.mutate(24)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/cleanup", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gracePeriod: 24 }),
      })
    })
  })

  describe("useReviewDeadLetterJob", () => {
    it("marks a job as reviewed", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useReviewDeadLetterJob(), { wrapper })

      result.current.mutate({ id: 123, notes: "Test review notes" })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/dead-letter/123/review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Test review notes" }),
      })
    })

    it("marks a job as reviewed without notes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const { result } = renderHook(() => useReviewDeadLetterJob(), { wrapper })

      result.current.mutate({ id: 123 })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockFetch).toHaveBeenCalledWith("/admin/api/jobs/dead-letter/123/review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: undefined }),
      })
    })
  })
})
