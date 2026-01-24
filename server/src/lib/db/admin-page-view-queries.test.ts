import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Pool } from "pg"
import {
  getPageViewSummary,
  getTopViewedPages,
  getPageViewTrends,
  trackPageView,
} from "./admin-page-view-queries.js"

describe("Admin Page View Queries", () => {
  let mockPool: Pool

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool
  })

  describe("getPageViewSummary", () => {
    it("returns summary for all page types", async () => {
      const mockSummary = {
        total_views: 5000,
        death_page_views: 1200,
        movie_views: 2000,
        show_views: 1500,
        episode_views: 300,
        unique_entities_viewed: 850,
      }

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSummary],
      } as any)

      const result = await getPageViewSummary(mockPool, "2024-01-01", "2024-01-31")

      expect(result).toEqual(mockSummary)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*) as total_views"),
        ["2024-01-01", "2024-01-31"]
      )
    })

    it("filters by page type", async () => {
      const mockSummary = {
        total_views: 1200,
        death_page_views: 1200,
        movie_views: 0,
        show_views: 0,
        episode_views: 0,
        unique_entities_viewed: 150,
      }

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSummary],
      } as any)

      await getPageViewSummary(mockPool, "2024-01-01", "2024-01-31", "actor_death")

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("AND page_type = $3"), [
        "2024-01-01",
        "2024-01-31",
        "actor_death",
      ])
    })

    it("does not filter when pageType is 'all'", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{}],
      } as any)

      await getPageViewSummary(mockPool, "2024-01-01", "2024-01-31", "all")

      const call = vi.mocked(mockPool.query).mock.calls[0]
      expect(call[0]).not.toContain("AND page_type = $3")
      expect(call[1]).toEqual(["2024-01-01", "2024-01-31"])
    })
  })

  describe("getTopViewedPages", () => {
    it("returns top viewed actor death pages", async () => {
      const mockPages = [
        {
          page_type: "actor_death" as const,
          entity_id: 1,
          view_count: 500,
          last_viewed_at: "2024-01-31T12:00:00Z",
          entity_name: "Test Actor",
          entity_tmdb_id: 123,
        },
      ]

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockPages,
      } as any)

      const result = await getTopViewedPages(
        mockPool,
        "actor_death",
        "2024-01-01",
        "2024-01-31",
        20
      )

      expect(result).toEqual(mockPages)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN actors a ON a.id = pv.entity_id"),
        ["2024-01-01", "2024-01-31", 20]
      )
    })

    it("returns top viewed movies", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getTopViewedPages(mockPool, "movie", "2024-01-01", "2024-01-31", 20)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN movies m ON m.id = pv.entity_id"),
        ["2024-01-01", "2024-01-31", 20]
      )
    })

    it("returns top viewed shows", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getTopViewedPages(mockPool, "show", "2024-01-01", "2024-01-31", 20)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN shows s ON s.id = pv.entity_id"),
        ["2024-01-01", "2024-01-31", 20]
      )
    })

    it("returns top viewed episodes", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getTopViewedPages(mockPool, "episode", "2024-01-01", "2024-01-31", 20)

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN episodes e ON e.id = pv.entity_id"),
        ["2024-01-01", "2024-01-31", 20]
      )
    })

    it("returns all types when pageType is not specific", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getTopViewedPages(mockPool, "all", "2024-01-01", "2024-01-31", 20)

      const call = vi.mocked(mockPool.query).mock.calls[0]
      expect(call[0]).not.toContain("JOIN")
      expect(call[0]).toContain("FROM page_views")
    })
  })

  describe("getPageViewTrends", () => {
    it("returns daily trends", async () => {
      const mockTrends = [
        {
          date: "2024-01-01",
          total_views: 100,
          movie_views: 40,
          show_views: 30,
          episode_views: 10,
          actor_death_views: 20,
        },
      ]

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockTrends,
      } as any)

      const result = await getPageViewTrends(mockPool, "2024-01-01", "2024-01-31", "daily")

      expect(result).toEqual(mockTrends)
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("TO_CHAR(viewed_at, $3)"),
        ["2024-01-01", "2024-01-31", "YYYY-MM-DD"]
      )
    })

    it("returns weekly trends", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getPageViewTrends(mockPool, "2024-01-01", "2024-01-31", "weekly")

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [
        "2024-01-01",
        "2024-01-31",
        "YYYY-IW",
      ])
    })

    it("returns monthly trends", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await getPageViewTrends(mockPool, "2024-01-01", "2024-12-31", "monthly")

      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [
        "2024-01-01",
        "2024-12-31",
        "YYYY-MM",
      ])
    })
  })

  describe("trackPageView", () => {
    it("inserts page view record", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await trackPageView(mockPool, {
        pageType: "movie",
        entityId: 123,
        path: "/movie/test-movie-2024-123",
        referrer: "https://google.com",
        userAgent: "Mozilla/5.0",
      })

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO page_views"),
        ["movie", 123, "/movie/test-movie-2024-123", "https://google.com", "Mozilla/5.0"]
      )
    })

    it("handles missing optional fields", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      await trackPageView(mockPool, {
        pageType: "actor_death",
        entityId: 456,
        path: "/death/john-doe-2157",
      })

      const call = vi.mocked(mockPool.query).mock.calls[0]
      expect(call[1]).toEqual(["actor_death", 456, "/death/john-doe-2157", null, null])
    })
  })
})
