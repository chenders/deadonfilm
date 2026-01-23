/**
 * Tests for enrichment review React Query hooks.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  usePendingEnrichments,
  useEnrichmentReviewDetail,
  useApproveEnrichment,
  useRejectEnrichment,
  useEditEnrichment,
  useCommitEnrichmentRun,
  type EnrichmentPendingReview,
  type EnrichmentReviewDetail,
} from "./useEnrichmentReview"

// Mock fetch
globalThis.fetch = vi.fn()

// Create wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useEnrichmentReview hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("usePendingEnrichments", () => {
    it("fetches pending enrichments with pagination", async () => {
      const mockData = {
        items: [
          {
            enrichment_run_actor_id: 1,
            run_id: 1,
            actor_id: 100,
            actor_name: "Test Actor",
            actor_tmdb_id: 1000,
            deathday: "2020-01-01",
            cause_of_death: "Natural causes",
            overall_confidence: 0.85,
            cause_confidence: "high",
            winning_source: "claude",
            cost_usd: "0.01",
            created_at: "2024-01-01T00:00:00Z",
          } as EnrichmentPendingReview,
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response)

      const { result } = renderHook(() => usePendingEnrichments(1, 20, {}), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(fetch).toHaveBeenCalledWith(
        "/admin/api/enrichment/pending-review?page=1&pageSize=20",
        { credentials: "include" }
      )
      expect(result.current.data).toEqual(mockData)
    })

    it("includes filters in query params", async () => {
      const mockData = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response)

      renderHook(
        () =>
          usePendingEnrichments(1, 20, {
            runId: 5,
            minConfidence: 0.8,
            causeConfidence: "high",
          }),
        { wrapper: createWrapper() }
      )

      await waitFor(() => expect(fetch).toHaveBeenCalled())

      expect(fetch).toHaveBeenCalledWith(
        "/admin/api/enrichment/pending-review?page=1&pageSize=20&runId=5&minConfidence=0.8&causeConfidence=high",
        { credentials: "include" }
      )
    })
  })

  describe("useEnrichmentReviewDetail", () => {
    it("fetches enrichment review detail", async () => {
      const mockData: EnrichmentReviewDetail = {
        enrichment_run_actor_id: 1,
        run_id: 1,
        actor_id: 100,
        actor_name: "Test Actor",
        actor_tmdb_id: 1000,
        winning_source: "claude",
        cost_usd: "0.01",
        overall_confidence: 0.85,
        staging: {
          deathday: "2020-01-01",
          cause_of_death: "Natural causes",
          cause_of_death_details: "Heart attack",
          age_at_death: 75,
          years_lost: 5,
          violent_death: false,
          has_detailed_death_info: true,
          circumstances: "Died peacefully at home",
          location_of_death: "Los Angeles, CA",
        },
        production: {
          deathday: null,
          cause_of_death: null,
          cause_of_death_details: null,
          age_at_death: null,
          years_lost: null,
          violent_death: null,
          has_detailed_death_info: null,
          circumstances: null,
          location_of_death: null,
        },
        confidence_breakdown: {
          cause_confidence: 0.9,
          details_confidence: 0.85,
          deathday_confidence: 0.95,
          birthday_confidence: 0.8,
          circumstances_confidence: 0.75,
        },
        raw_response: '{"cause": "Natural causes"}',
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as Response)

      const { result } = renderHook(() => useEnrichmentReviewDetail(1), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(fetch).toHaveBeenCalledWith("/admin/api/enrichment/review/1", {
        credentials: "include",
      })
      expect(result.current.data).toEqual(mockData)
    })
  })

  describe("useApproveEnrichment", () => {
    it("approves an enrichment", async () => {
      const mockResponse = { success: true }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const { result } = renderHook(() => useApproveEnrichment(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(1)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(fetch).toHaveBeenCalledWith("/admin/api/enrichment/review/1/approve", {
        method: "POST",
        credentials: "include",
      })
    })

    it("handles approval error", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Approval failed" } }),
      } as Response)

      const { result } = renderHook(() => useApproveEnrichment(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(1)

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  describe("useRejectEnrichment", () => {
    it("rejects an enrichment", async () => {
      const mockResponse = { success: true }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const { result } = renderHook(() => useRejectEnrichment(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({ id: 1, data: { reason: "incorrect_data" } })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(fetch).toHaveBeenCalledWith("/admin/api/enrichment/review/1/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "incorrect_data" }),
      })
    })
  })

  describe("useEditEnrichment", () => {
    it("edits enrichment staging data", async () => {
      const mockResponse = { success: true }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const { result } = renderHook(() => useEditEnrichment(), {
        wrapper: createWrapper(),
      })

      const editData = {
        deathday: "2020-01-02",
        cause_of_death: "Updated cause",
      }

      result.current.mutate({ id: 1, data: editData })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(fetch).toHaveBeenCalledWith("/admin/api/enrichment/review/1/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editData),
      })
    })
  })

  describe("useCommitEnrichmentRun", () => {
    it("commits approved enrichments", async () => {
      const mockResponse = {
        approvedCount: 5,
        actorCount: 5,
        totalCost: 0.5,
        actors: [
          { actor_id: 1, actor_name: "Actor 1" },
          { actor_id: 2, actor_name: "Actor 2" },
        ],
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const { result } = renderHook(() => useCommitEnrichmentRun(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(1)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(fetch).toHaveBeenCalledWith("/admin/api/enrichment/runs/1/commit", {
        method: "POST",
        credentials: "include",
      })
      expect(result.current.data).toEqual(mockResponse)
    })

    it("handles commit error", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Commit failed" } }),
      } as Response)

      const { result } = renderHook(() => useCommitEnrichmentRun(), {
        wrapper: createWrapper(),
      })

      result.current.mutate(1)

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })
})
