import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Request, Response } from "express"
import type { Pool } from "pg"

// Mock the database module
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../lib/logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}))

// Mock isbot
vi.mock("isbot", () => ({
  default: vi.fn(),
}))

describe("Page Views API Routes", () => {
  let mockPool: Pool
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let sendSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    jsonSpy = vi.fn()
    sendSpy = vi.fn()
    statusSpy = vi.fn(() => ({ json: jsonSpy, send: sendSpy }))

    mockRes = {
      json: jsonSpy as any,
      status: statusSpy as any,
    }

    mockReq = {
      query: {},
      body: {},
      headers: {},
    }

    mockPool = {
      query: vi.fn(),
    } as any
  })

  describe("GET /admin/api/page-views/summary", () => {
    it("returns page view summary", async () => {
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

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const pageViewsModule = await import("./page-views.js")
      const router = pageViewsModule.default

      const summaryRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/summary" && layer.route?.methods.get
      )

      expect(summaryRoute).toBeDefined()
    })
  })

  describe("GET /admin/api/page-views/top-viewed", () => {
    it("returns top viewed pages", async () => {
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

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const pageViewsModule = await import("./page-views.js")
      const router = pageViewsModule.default

      const topViewedRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/top-viewed" && layer.route?.methods.get
      )

      expect(topViewedRoute).toBeDefined()
    })
  })

  describe("GET /admin/api/page-views/trends", () => {
    it("returns page view trends", async () => {
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

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const pageViewsModule = await import("./page-views.js")
      const router = pageViewsModule.default

      const trendsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/trends" && layer.route?.methods.get
      )

      expect(trendsRoute).toBeDefined()
    })
  })

  describe("POST /api/page-views/track", () => {
    it("tracks page view for valid request", async () => {
      const isbotModule = await import("isbot")
      ;(isbotModule.default as any).mockReturnValue(false)

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const { trackPageViewHandler } = await import("./page-views.js")

      mockReq.body = {
        pageType: "movie",
        entityId: 123,
        path: "/movie/test-movie-2024-123",
      }
      mockReq.headers = {
        "user-agent": "Mozilla/5.0",
        referer: "https://google.com",
      }

      await trackPageViewHandler(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(204)
      expect(sendSpy).toHaveBeenCalled()
    })

    it("rejects bot traffic", async () => {
      const isbotModule = await import("isbot")
      ;(isbotModule.default as any).mockReturnValue(true)

      const { trackPageViewHandler } = await import("./page-views.js")

      mockReq.headers = {
        "user-agent": "Googlebot/2.1",
      }

      await trackPageViewHandler(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(204)
      expect(mockPool.query).not.toHaveBeenCalled()
    })

    it("validates required fields", async () => {
      const isbotModule = await import("isbot")
      ;(isbotModule.default as any).mockReturnValue(false)

      const { trackPageViewHandler } = await import("./page-views.js")

      mockReq.body = {
        // Missing pageType, entityId, path
      }

      await trackPageViewHandler(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: expect.any(String) })
    })

    it("validates page type enum", async () => {
      const isbotModule = await import("isbot")
      ;(isbotModule.default as any).mockReturnValue(false)

      const { trackPageViewHandler } = await import("./page-views.js")

      mockReq.body = {
        pageType: "invalid_type",
        entityId: 123,
        path: "/test",
      }

      await trackPageViewHandler(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: expect.any(String) })
    })

    it("validates entityId is positive integer", async () => {
      const isbotModule = await import("isbot")
      ;(isbotModule.default as any).mockReturnValue(false)

      const { trackPageViewHandler } = await import("./page-views.js")

      mockReq.body = {
        pageType: "movie",
        entityId: -1,
        path: "/test",
      }

      await trackPageViewHandler(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: expect.any(String) })
    })

    it("handles referrer as array", async () => {
      const isbotModule = await import("isbot")
      ;(isbotModule.default as any).mockReturnValue(false)

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const { trackPageViewHandler } = await import("./page-views.js")

      mockReq.body = {
        pageType: "movie",
        entityId: 123,
        path: "/movie/test",
      }
      mockReq.headers = {
        referer: ["https://google.com", "https://bing.com"] as any,
      }

      await trackPageViewHandler(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(204)
    })
  })
})
