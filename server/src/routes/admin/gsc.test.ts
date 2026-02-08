/**
 * Tests for admin GSC routes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { Request, Response, NextFunction } from "express"
import router from "./gsc.js"

// Mock dependencies
vi.mock("../../lib/db/pool.js")
vi.mock("../../lib/logger.js")
vi.mock("../../lib/gsc-client.js")
vi.mock("../../lib/db/admin-gsc-queries.js")

import { getPool } from "../../lib/db/pool.js"
import {
  isGscConfigured,
  getSearchPerformanceOverTime,
  getTopQueries,
  getTopPages,
  getPerformanceByPageType,
  getSitemaps,
  inspectUrl,
} from "../../lib/gsc-client.js"
import {
  getSearchPerformanceHistory,
  getTopQueriesHistory,
  getTopPagesHistory,
  getPageTypePerformanceHistory,
  getIndexingStatusHistory,
  getGscAlerts,
  acknowledgeGscAlert,
} from "../../lib/db/admin-gsc-queries.js"

function findHandler(path: string) {
  return router.stack.find((l) => l.route?.path === path)?.route?.stack[0].handle
}

describe("admin GSC routes", () => {
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
      body: {},
      params: {},
    }
    mockRes = {
      json: jsonSpy,
      status: statusSpy,
    } as any

    vi.clearAllMocks()
    vi.mocked(getPool).mockReturnValue({} as any)
  })

  describe("GET /status", () => {
    const handler = findHandler("/status")

    it("returns configured status when GSC is set up", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      process.env.GSC_SITE_URL = "sc-domain:example.com"

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith({
        configured: true,
        siteUrl: "sc-domain:example.com",
      })

      delete process.env.GSC_SITE_URL
    })

    it("returns not configured when GSC is not set up", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith({
        configured: false,
        siteUrl: null,
      })
    })
  })

  describe("GET /performance", () => {
    const handler = findHandler("/performance")

    it("returns data from GSC API when configured", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      mockReq.query = { days: "7" }

      const mockResult = {
        rows: [
          { keys: ["2024-01-01"], clicks: 10, impressions: 100, ctr: 0.1, position: 5.5 },
          { keys: ["2024-01-02"], clicks: 15, impressions: 120, ctr: 0.125, position: 4.8 },
        ],
        totals: { clicks: 25, impressions: 220, ctr: 0.114, position: 5.1 },
      }
      vi.mocked(getSearchPerformanceOverTime).mockResolvedValue(mockResult)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "api",
          data: [
            { date: "2024-01-01", clicks: 10, impressions: 100, ctr: 0.1, position: 5.5 },
            { date: "2024-01-02", clicks: 15, impressions: 120, ctr: 0.125, position: 4.8 },
          ],
          totals: mockResult.totals,
        })
      )
    })

    it("falls back to DB when GSC API is not configured", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)
      mockReq.query = { days: "7" }

      const dbData = [{ date: "2024-01-01", clicks: 10, impressions: 100, ctr: 0.1, position: 5 }]
      vi.mocked(getSearchPerformanceHistory).mockResolvedValue(dbData)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(getSearchPerformanceHistory).toHaveBeenCalled()
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "db",
          data: dbData,
        })
      )
    })

    it("falls back to DB when GSC API fails", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      vi.mocked(getSearchPerformanceOverTime).mockRejectedValue(new Error("API error"))
      mockReq.query = { days: "7" }

      const dbData: any[] = []
      vi.mocked(getSearchPerformanceHistory).mockResolvedValue(dbData)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ source: "db" }))
    })

    it("returns 500 on complete failure", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)
      vi.mocked(getSearchPerformanceHistory).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch search performance data" },
      })
    })
  })

  describe("GET /top-queries", () => {
    const handler = findHandler("/top-queries")

    it("returns queries from GSC API", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      const mockResult = {
        rows: [{ keys: ["dead on film"], clicks: 50, impressions: 200, ctr: 0.25, position: 2.1 }],
        totals: { clicks: 50, impressions: 200, ctr: 0.25, position: 2.1 },
      }
      vi.mocked(getTopQueries).mockResolvedValue(mockResult)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "api",
          data: [{ query: "dead on film", clicks: 50, impressions: 200, ctr: 0.25, position: 2.1 }],
        })
      )
    })

    it("falls back to DB", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)
      vi.mocked(getTopQueriesHistory).mockResolvedValue([])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ source: "db", data: [] }))
    })
  })

  describe("GET /top-pages", () => {
    const handler = findHandler("/top-pages")

    it("returns pages from GSC API", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      const mockResult = {
        rows: [
          {
            keys: ["https://example.com/actor/test-1"],
            clicks: 30,
            impressions: 150,
            ctr: 0.2,
            position: 3.2,
          },
        ],
        totals: { clicks: 30, impressions: 150, ctr: 0.2, position: 3.2 },
      }
      vi.mocked(getTopPages).mockResolvedValue(mockResult)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "api",
          data: [
            {
              page_url: "https://example.com/actor/test-1",
              clicks: 30,
              impressions: 150,
              ctr: 0.2,
              position: 3.2,
            },
          ],
        })
      )
    })

    it("falls back to DB", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)
      vi.mocked(getTopPagesHistory).mockResolvedValue([])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ source: "db", data: [] }))
    })
  })

  describe("GET /page-types", () => {
    const handler = findHandler("/page-types")

    it("returns page type data from API", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      const mockResult = {
        actor: { clicks: 100, impressions: 500, ctr: 0.2, position: 4 },
        movie: { clicks: 50, impressions: 300, ctr: 0.17, position: 5 },
      }
      vi.mocked(getPerformanceByPageType).mockResolvedValue(mockResult)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ source: "api", data: mockResult })
      )
    })

    it("falls back to DB", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)
      vi.mocked(getPageTypePerformanceHistory).mockResolvedValue([
        {
          date: "2024-01-01",
          page_type: "actor",
          clicks: 10,
          impressions: 50,
          ctr: 0.2,
          position: 4,
        },
      ])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "db",
          data: { actor: { clicks: 10, impressions: 50, ctr: 0.2, position: 4 } },
        })
      )
    })
  })

  describe("GET /sitemaps", () => {
    const handler = findHandler("/sitemaps")

    it("returns sitemaps when configured", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      vi.mocked(getSitemaps).mockResolvedValue([
        {
          path: "https://example.com/sitemap.xml",
          lastSubmitted: "2024-01-01",
          lastDownloaded: "2024-01-01",
          isPending: false,
          isIndex: true,
          warnings: 0,
          errors: 0,
          contents: [{ type: "web", submitted: 100, indexed: 90 }],
        },
      ])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({ configured: true, data: expect.any(Array) })
      )
    })

    it("returns empty when not configured", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith({ configured: false, data: [] })
    })
  })

  describe("POST /inspect-url", () => {
    const handler = findHandler("/inspect-url")

    it("inspects a URL", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      mockReq.body = { url: "https://example.com/actor/test-1" }
      vi.mocked(inspectUrl).mockResolvedValue({
        url: "https://example.com/actor/test-1",
        indexingState: "Submitted and indexed",
        pageFetchState: "Successful",
        robotsTxtState: "ALLOWED",
        lastCrawlTime: "2024-01-01T00:00:00Z",
        crawledAs: "DESKTOP",
        verdict: "PASS",
      })

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(inspectUrl).toHaveBeenCalledWith("https://example.com/actor/test-1")
      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ verdict: "PASS" }))
    })

    it("returns 400 when not configured", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(false)
      mockReq.body = { url: "https://example.com" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
    })

    it("returns 400 when URL is missing", async () => {
      vi.mocked(isGscConfigured).mockReturnValue(true)
      mockReq.body = {}

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
    })
  })

  describe("GET /indexing", () => {
    const handler = findHandler("/indexing")

    it("returns indexing history", async () => {
      const mockData = [
        {
          date: "2024-01-01",
          total_submitted: 100,
          total_indexed: 90,
          index_details: { web: { submitted: 100, indexed: 90 } },
        },
      ]
      vi.mocked(getIndexingStatusHistory).mockResolvedValue(mockData)

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ data: mockData }))
    })

    it("handles errors", async () => {
      vi.mocked(getIndexingStatusHistory).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe("GET /alerts", () => {
    const handler = findHandler("/alerts")

    it("returns unacknowledged alerts by default", async () => {
      vi.mocked(getGscAlerts).mockResolvedValue([
        {
          id: 1,
          alert_type: "indexing_drop",
          severity: "warning",
          message: "Indexed pages dropped 15%",
          details: {},
          acknowledged: false,
          acknowledged_at: null,
          created_at: "2024-01-01",
        },
      ])

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(jsonSpy).toHaveBeenCalledWith({
        data: expect.arrayContaining([expect.objectContaining({ id: 1 })]),
      })
    })

    it("handles errors", async () => {
      vi.mocked(getGscAlerts).mockRejectedValue(new Error("DB error"))

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe("POST /alerts/:id/acknowledge", () => {
    const handler = findHandler("/alerts/:id/acknowledge")

    it("acknowledges an alert", async () => {
      mockReq.params = { id: "1" }
      vi.mocked(acknowledgeGscAlert).mockResolvedValue()

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(acknowledgeGscAlert).toHaveBeenCalledWith({}, 1)
      expect(jsonSpy).toHaveBeenCalledWith({ success: true })
    })

    it("returns 400 for invalid ID", async () => {
      mockReq.params = { id: "abc" }

      await handler!(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
    })
  })
})
