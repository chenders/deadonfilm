/**
 * Tests for usePopularity hooks
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import {
  usePopularityStats,
  useTopActors,
  useLowConfidenceActors,
  useMissingPopularityActors,
  usePopularityLastRun,
} from "./usePopularity"

const mockStats = {
  actors: {
    total: 100000,
    withScore: 85000,
    avgScore: 12.5,
    avgConfidence: 0.75,
    highConfidence: 70000,
    lowConfidence: 15000,
  },
  movies: {
    total: 50000,
    withScore: 48000,
    avgScore: 15.2,
    avgWeight: 14.8,
  },
  shows: {
    total: 10000,
    withScore: 9500,
    avgScore: 18.3,
    avgWeight: 17.1,
  },
  distribution: [
    { bucket: "50-100 (Top)", count: 500 },
    { bucket: "0-20 (Minimal)", count: 49500 },
  ],
}

const mockTopActors = {
  actors: [
    {
      id: 530,
      tmdbId: 1810,
      name: "Heath Ledger",
      dofPopularity: 42.38,
      confidence: 1.0,
      tmdbPopularity: 25.5,
      deathday: "2008-01-22",
      profilePath: "/path.jpg",
    },
  ],
}

const mockLowConfidence = {
  actors: [
    {
      id: 12345,
      tmdbId: 9999,
      name: "Unknown Actor",
      dofPopularity: 15.5,
      confidence: 0.25,
      tmdbPopularity: 5.0,
      movieCount: 2,
      showCount: 1,
    },
  ],
}

const mockMissing = {
  totalMissing: 15000,
  actors: [
    {
      id: 99999,
      tmdbId: 88888,
      name: "Missing Score Actor",
      tmdbPopularity: 3.2,
      movieCount: 1,
      showCount: 0,
    },
  ],
}

const mockLastRun = {
  lastRun: {
    id: 1,
    job_name: "scheduled-popularity-update",
    started_at: "2026-01-31T03:00:00Z",
    completed_at: "2026-01-31T03:05:00Z",
    status: "success",
    error_message: null,
    duration_ms: 300000,
  },
  recentRuns: [],
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe("usePopularity hooks", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/stats")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockStats),
          })
        }
        if (url.includes("/top-actors")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockTopActors),
          })
        }
        if (url.includes("/low-confidence")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockLowConfidence),
          })
        }
        if (url.includes("/missing")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMissing),
          })
        }
        if (url.includes("/last-run")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockLastRun),
          })
        }
        return Promise.reject(new Error("Unknown URL"))
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("usePopularityStats", () => {
    it("fetches popularity stats", async () => {
      const { result } = renderHook(() => usePopularityStats(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockStats)
      expect(fetch).toHaveBeenCalledWith("/admin/api/popularity/stats", {
        credentials: "include",
      })
    })

    it("handles fetch errors", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: "Internal Server Error",
        })
      )

      const { result } = renderHook(() => usePopularityStats(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe("useTopActors", () => {
    it("fetches top actors with default params", async () => {
      const { result } = renderHook(() => useTopActors(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockTopActors)
      expect(fetch).toHaveBeenCalledWith(
        "/admin/api/popularity/top-actors?limit=100&minConfidence=0.5",
        { credentials: "include" }
      )
    })

    it("fetches top actors with custom params", async () => {
      const { result } = renderHook(() => useTopActors(50, 0.7), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(fetch).toHaveBeenCalledWith(
        "/admin/api/popularity/top-actors?limit=50&minConfidence=0.7",
        { credentials: "include" }
      )
    })
  })

  describe("useLowConfidenceActors", () => {
    it("fetches low confidence actors with default params", async () => {
      const { result } = renderHook(() => useLowConfidenceActors(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockLowConfidence)
      expect(fetch).toHaveBeenCalledWith(
        "/admin/api/popularity/low-confidence?limit=100&maxConfidence=0.3",
        { credentials: "include" }
      )
    })

    it("fetches low confidence actors with custom params", async () => {
      const { result } = renderHook(() => useLowConfidenceActors(200, 0.5), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(fetch).toHaveBeenCalledWith(
        "/admin/api/popularity/low-confidence?limit=200&maxConfidence=0.5",
        { credentials: "include" }
      )
    })
  })

  describe("useMissingPopularityActors", () => {
    it("fetches missing popularity actors", async () => {
      const { result } = renderHook(() => useMissingPopularityActors(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockMissing)
      expect(fetch).toHaveBeenCalledWith("/admin/api/popularity/missing?limit=100", {
        credentials: "include",
      })
    })

    it("includes totalMissing in response", async () => {
      const { result } = renderHook(() => useMissingPopularityActors(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.totalMissing).toBe(15000)
    })
  })

  describe("usePopularityLastRun", () => {
    it("fetches last run status", async () => {
      const { result } = renderHook(() => usePopularityLastRun(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockLastRun)
      expect(fetch).toHaveBeenCalledWith("/admin/api/popularity/last-run", {
        credentials: "include",
      })
    })

    it("includes lastRun in response", async () => {
      const { result } = renderHook(() => usePopularityLastRun(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.lastRun?.status).toBe("success")
      expect(result.current.data?.lastRun?.duration_ms).toBe(300000)
    })
  })
})
