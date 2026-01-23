/**
 * Tests for admin analytics routes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Request, Response, NextFunction } from "express"
import router from "./analytics.js"

// Mock dependencies
vi.mock("../../lib/db/pool.js")
vi.mock("../../lib/logger.js")
vi.mock("../../lib/db/admin-analytics-queries.js")
vi.mock("../../lib/db/admin-page-visit-queries.js")

import { getPool } from "../../lib/db/pool.js"
import { getCostBySource } from "../../lib/db/admin-analytics-queries.js"
import {
  getInternalReferralsOverTime,
  getTopNavigationPaths,
  getMostPopularPagesByInternalReferrals,
  getNavigationByHourOfDay,
  getEntryExitPages,
  getPageVisitStats,
} from "../../lib/db/admin-page-visit-queries.js"

describe("admin analytics routes", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    mockNext = vi.fn()

    mockReq = {
      query: {},
    }
    mockRes = {
      json: jsonSpy,
      status: statusSpy,
    } as any

    vi.clearAllMocks()
    vi.mocked(getPool).mockReturnValue({} as any)
  })

  describe("GET /costs/by-source", () => {
    const handler = router.stack.find((layer) => layer.route?.path === "/costs/by-source")?.route
      ?.stack[0].handle

    it("returns cost data without date filtering", async () => {
      const mockData = {
        sources: [
          {
            source: "wikidata",
            total_cost: 10,
            queries_count: 5,
            avg_cost_per_query: 2,
            last_used: "2024-01-01",
          },
        ],
        totalCost: 10,
        totalQueries: 5,
      }
      vi.mocked(getCostBySource).mockResolvedValue(mockData)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getCostBySource).toHaveBeenCalledWith({}, undefined, undefined)
      expect(jsonSpy).toHaveBeenCalledWith(mockData)
    })

    it("applies date filtering when provided", async () => {
      mockReq.query = { startDate: "2024-01-01", endDate: "2024-01-31" }
      vi.mocked(getCostBySource).mockResolvedValue({ sources: [], totalCost: 0, totalQueries: 0 })

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getCostBySource).toHaveBeenCalledWith({}, "2024-01-01", "2024-01-31")
    })

    it("handles errors gracefully", async () => {
      vi.mocked(getCostBySource).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch cost by source analytics" },
      })
    })
  })

  describe("GET /page-visits/stats", () => {
    const handler = router.stack.find((layer) => layer.route?.path === "/page-visits/stats")?.route
      ?.stack[0].handle

    it("returns page visit stats", async () => {
      const mockData = { totalVisits: 1000, internalReferrals: 500 }
      vi.mocked(getPageVisitStats).mockResolvedValue(mockData as any)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getPageVisitStats).toHaveBeenCalledWith({}, undefined, undefined)
      expect(jsonSpy).toHaveBeenCalledWith(mockData)
    })

    it("applies date filtering", async () => {
      mockReq.query = { startDate: "2024-01-01", endDate: "2024-01-31" }
      vi.mocked(getPageVisitStats).mockResolvedValue({} as any)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getPageVisitStats).toHaveBeenCalledWith({}, "2024-01-01", "2024-01-31")
    })

    it("handles errors", async () => {
      vi.mocked(getPageVisitStats).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch page visit stats" },
      })
    })
  })

  describe("GET /page-visits/internal-referrals-over-time", () => {
    const handler = router.stack.find(
      (layer) => layer.route?.path === "/page-visits/internal-referrals-over-time"
    )?.route?.stack[0].handle

    it("returns time series data with default granularity", async () => {
      const mockData = [{ timestamp: "2024-01-01", count: 100 }]
      vi.mocked(getInternalReferralsOverTime).mockResolvedValue(mockData)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getInternalReferralsOverTime).toHaveBeenCalledWith({}, undefined, undefined, "day")
      expect(jsonSpy).toHaveBeenCalledWith(mockData)
    })

    it("accepts hour granularity", async () => {
      mockReq.query = { granularity: "hour" }
      vi.mocked(getInternalReferralsOverTime).mockResolvedValue([])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getInternalReferralsOverTime).toHaveBeenCalledWith({}, undefined, undefined, "hour")
    })

    it("accepts week granularity", async () => {
      mockReq.query = { granularity: "week" }
      vi.mocked(getInternalReferralsOverTime).mockResolvedValue([])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getInternalReferralsOverTime).toHaveBeenCalledWith({}, undefined, undefined, "week")
    })

    it("validates granularity parameter", async () => {
      mockReq.query = { granularity: "invalid" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Invalid granularity. Must be 'hour', 'day', or 'week'" },
      })
      expect(getInternalReferralsOverTime).not.toHaveBeenCalled()
    })

    it("handles errors", async () => {
      vi.mocked(getInternalReferralsOverTime).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe("GET /page-visits/navigation-paths", () => {
    const handler = router.stack.find((layer) => layer.route?.path === "/page-visits/navigation-paths")
      ?.route?.stack[0].handle

    it("returns navigation paths with default limit", async () => {
      const mockData = [{ from: "/", to: "/deaths", count: 100 }]
      vi.mocked(getTopNavigationPaths).mockResolvedValue(mockData as any)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getTopNavigationPaths).toHaveBeenCalledWith({}, undefined, undefined, 20)
      expect(jsonSpy).toHaveBeenCalledWith(mockData)
    })

    it("accepts custom limit parameter", async () => {
      mockReq.query = { limit: "10" }
      vi.mocked(getTopNavigationPaths).mockResolvedValue([])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getTopNavigationPaths).toHaveBeenCalledWith({}, undefined, undefined, 10)
    })

    it("validates limit is a positive integer", async () => {
      mockReq.query = { limit: "0" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Invalid limit. Must be between 1 and 100" },
      })
    })

    it("validates limit is not too large", async () => {
      mockReq.query = { limit: "101" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
    })

    it("validates limit is a number", async () => {
      mockReq.query = { limit: "abc" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
    })

    it("handles errors", async () => {
      vi.mocked(getTopNavigationPaths).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe("GET /page-visits/popular-pages", () => {
    const handler = router.stack.find((layer) => layer.route?.path === "/page-visits/popular-pages")
      ?.route?.stack[0].handle

    it("returns popular pages with default limit", async () => {
      const mockData = [{ path: "/", visits: 1000 }]
      vi.mocked(getMostPopularPagesByInternalReferrals).mockResolvedValue(mockData as any)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getMostPopularPagesByInternalReferrals).toHaveBeenCalledWith({}, undefined, undefined, 20)
      expect(jsonSpy).toHaveBeenCalledWith(mockData)
    })

    it("accepts custom limit parameter", async () => {
      mockReq.query = { limit: "15" }
      vi.mocked(getMostPopularPagesByInternalReferrals).mockResolvedValue([])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getMostPopularPagesByInternalReferrals).toHaveBeenCalledWith({}, undefined, undefined, 15)
    })

    it("validates limit parameter", async () => {
      mockReq.query = { limit: "0" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Invalid limit. Must be between 1 and 100" },
      })
    })

    it("handles errors", async () => {
      vi.mocked(getMostPopularPagesByInternalReferrals).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe("GET /page-visits/hourly-patterns", () => {
    const handler = router.stack.find((layer) => layer.route?.path === "/page-visits/hourly-patterns")
      ?.route?.stack[0].handle

    it("returns hourly patterns", async () => {
      const mockData = [{ hour: 12, count: 100 }]
      vi.mocked(getNavigationByHourOfDay).mockResolvedValue(mockData)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getNavigationByHourOfDay).toHaveBeenCalledWith({}, undefined, undefined)
      expect(jsonSpy).toHaveBeenCalledWith(mockData)
    })

    it("applies date filtering", async () => {
      mockReq.query = { startDate: "2024-01-01", endDate: "2024-01-31" }
      vi.mocked(getNavigationByHourOfDay).mockResolvedValue([])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getNavigationByHourOfDay).toHaveBeenCalledWith({}, "2024-01-01", "2024-01-31")
    })

    it("handles errors", async () => {
      vi.mocked(getNavigationByHourOfDay).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe("GET /page-visits/entry-exit", () => {
    const handler = router.stack.find((layer) => layer.route?.path === "/page-visits/entry-exit")
      ?.route?.stack[0].handle

    it("returns entry and exit pages with default limit", async () => {
      const mockData = { entryPages: [], exitPages: [] }
      vi.mocked(getEntryExitPages).mockResolvedValue(mockData as any)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getEntryExitPages).toHaveBeenCalledWith({}, undefined, undefined, 20)
      expect(jsonSpy).toHaveBeenCalledWith(mockData)
    })

    it("accepts custom limit parameter", async () => {
      mockReq.query = { limit: "25" }
      vi.mocked(getEntryExitPages).mockResolvedValue({ entryPages: [], exitPages: [] } as any)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getEntryExitPages).toHaveBeenCalledWith({}, undefined, undefined, 25)
    })

    it("validates limit parameter", async () => {
      mockReq.query = { limit: "-1" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Invalid limit. Must be between 1 and 100" },
      })
    })

    it("handles errors", async () => {
      vi.mocked(getEntryExitPages).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })
})
