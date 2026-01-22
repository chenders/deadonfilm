import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import router from "./enrichment.js"
import * as queries from "../../lib/db/admin-enrichment-queries.js"
import { logAdminAction } from "../../lib/admin-auth.js"

// Mock dependencies
vi.mock("../../lib/db/pool.js", () => ({
  getPool: vi.fn().mockReturnValue({}),
}))

vi.mock("../../lib/admin-auth.js", () => ({
  logAdminAction: vi.fn(),
}))

vi.mock("../../lib/db/admin-enrichment-queries.js", () => ({
  getEnrichmentRuns: vi.fn(),
  getEnrichmentRunDetails: vi.fn(),
  getEnrichmentRunActors: vi.fn(),
  getSourcePerformanceStats: vi.fn(),
  getRunSourcePerformanceStats: vi.fn(),
}))

describe("admin enrichment routes", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: any
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    mockNext = vi.fn()

    mockReq = {
      query: {},
      params: {},
      body: {},
      ip: "127.0.0.1",
      get: vi.fn(),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }
  })

  describe("GET /runs", () => {
    const mockRunsResult = {
      items: [
        {
          id: 1,
          started_at: "2024-01-01T00:00:00Z",
          completed_at: "2024-01-01T01:00:00Z",
          duration_ms: 3600000,
          actors_queried: 100,
          actors_processed: 95,
          actors_enriched: 80,
          actors_with_death_page: 75,
          fill_rate: "84.21",
          total_cost_usd: "1.50",
          exit_reason: "completed",
          error_count: 0,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    }

    it("returns paginated runs with default parameters", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith({}, 1, 20, {})
      expect(jsonSpy).toHaveBeenCalledWith(mockRunsResult)
    })

    it("validates and clamps pagination parameters", async () => {
      mockReq.query = { page: "-5", pageSize: "1000" }
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      // Negative page should default to 1, pageSize should clamp to 100
      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith({}, 1, 100, {})
    })

    it("applies date filters", async () => {
      mockReq.query = { startDate: "2024-01-01", endDate: "2024-12-31" }
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith({}, 1, 20, {
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      })
    })

    it("returns 400 for invalid minCost", async () => {
      mockReq.query = { minCost: "invalid" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Invalid minCost: must be a finite number" },
      })
    })

    it("returns 400 for invalid maxCost", async () => {
      mockReq.query = { maxCost: "NaN" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Invalid maxCost: must be a finite number" },
      })
    })

    it("applies cost and error filters", async () => {
      mockReq.query = {
        minCost: "1.00",
        maxCost: "10.00",
        exitReason: "completed",
        hasErrors: "true",
      }
      vi.mocked(queries.getEnrichmentRuns).mockResolvedValue(mockRunsResult)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getEnrichmentRuns).toHaveBeenCalledWith({}, 1, 20, {
        minCost: 1.0,
        maxCost: 10.0,
        exitReason: "completed",
        hasErrors: true,
      })
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getEnrichmentRuns).mockRejectedValue(new Error("DB error"))

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch enrichment runs" },
      })
    })
  })

  describe("GET /runs/:id", () => {
    const mockRunDetails = {
      id: 1,
      started_at: "2024-01-01T00:00:00Z",
      completed_at: "2024-01-01T01:00:00Z",
      duration_ms: 3600000,
      actors_queried: 100,
      actors_processed: 95,
      actors_enriched: 80,
      actors_with_death_page: 75,
      fill_rate: "84.21",
      total_cost_usd: "1.50",
      exit_reason: "completed",
      error_count: 0,
      cost_by_source: { wikidata: 0.5, wikipedia: 1.0 },
      source_hit_rates: { wikidata: 0.8, wikipedia: 0.6 },
      sources_attempted: ["wikidata", "wikipedia"],
      config: { maxCostPerActor: 0.05 },
      links_followed: 150,
      pages_fetched: 200,
      ai_link_selections: 50,
      ai_content_extractions: 80,
      errors: [],
      script_name: "enrich-actors",
      script_version: "1.0.0",
      hostname: "localhost",
    }

    it("returns run details for valid ID", async () => {
      mockReq.params = { id: "1" }
      vi.mocked(queries.getEnrichmentRunDetails).mockResolvedValue(mockRunDetails)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getEnrichmentRunDetails).toHaveBeenCalledWith({}, 1)
      expect(jsonSpy).toHaveBeenCalledWith(mockRunDetails)
    })

    it("returns 400 for invalid run ID", async () => {
      mockReq.params = { id: "invalid" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid run ID" } })
    })

    it("returns 404 when run not found", async () => {
      mockReq.params = { id: "999" }
      vi.mocked(queries.getEnrichmentRunDetails).mockResolvedValue(null)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(404)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Enrichment run not found" },
      })
    })

    it("returns 500 on database error", async () => {
      mockReq.params = { id: "1" }
      vi.mocked(queries.getEnrichmentRunDetails).mockRejectedValue(new Error("DB error"))

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch enrichment run details" },
      })
    })
  })

  describe("GET /runs/:id/actors", () => {
    const mockActorsResult = {
      items: [
        {
          actor_id: 1,
          actor_name: "John Doe",
          actor_tmdb_id: 12345,
          was_enriched: true,
          created_death_page: true,
          confidence: "0.95",
          sources_attempted: ["wikidata", "wikipedia"],
          winning_source: "wikidata",
          processing_time_ms: 1500,
          cost_usd: "0.025",
          links_followed: 3,
          pages_fetched: 5,
          error: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    }

    it("returns paginated actor results", async () => {
      mockReq.params = { id: "1" }
      vi.mocked(queries.getEnrichmentRunActors).mockResolvedValue(mockActorsResult)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/actors")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getEnrichmentRunActors).toHaveBeenCalledWith({}, 1, 1, 50)
      expect(jsonSpy).toHaveBeenCalledWith(mockActorsResult)
    })

    it("validates and clamps pagination parameters", async () => {
      mockReq.params = { id: "1" }
      mockReq.query = { page: "-1", pageSize: "500" }
      vi.mocked(queries.getEnrichmentRunActors).mockResolvedValue(mockActorsResult)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/actors")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      // Negative page should default to 1, pageSize should clamp to 200
      expect(queries.getEnrichmentRunActors).toHaveBeenCalledWith({}, 1, 1, 200)
    })

    it("returns 400 for invalid run ID", async () => {
      mockReq.params = { id: "abc" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/actors")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid run ID" } })
    })

    it("returns 500 on database error", async () => {
      mockReq.params = { id: "1" }
      vi.mocked(queries.getEnrichmentRunActors).mockRejectedValue(new Error("DB error"))

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/actors")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch enrichment run actors" },
      })
    })
  })

  describe("GET /sources/stats", () => {
    const mockSourceStats = [
      {
        source: "wikidata",
        total_attempts: 100,
        successful_attempts: 80,
        success_rate: 80.0,
        total_cost_usd: 2.0,
        average_cost_usd: 0.02,
        total_processing_time_ms: 150000,
        average_processing_time_ms: 1500,
      },
    ]

    it("returns source performance stats", async () => {
      vi.mocked(queries.getSourcePerformanceStats).mockResolvedValue(mockSourceStats)

      const handlers = router.stack.find((layer) => layer.route?.path === "/sources/stats")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getSourcePerformanceStats).toHaveBeenCalledWith({}, undefined, undefined)
      expect(jsonSpy).toHaveBeenCalledWith(mockSourceStats)
    })

    it("applies date filters", async () => {
      mockReq.query = { startDate: "2024-01-01", endDate: "2024-12-31" }
      vi.mocked(queries.getSourcePerformanceStats).mockResolvedValue(mockSourceStats)

      const handlers = router.stack.find((layer) => layer.route?.path === "/sources/stats")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getSourcePerformanceStats).toHaveBeenCalledWith({}, "2024-01-01", "2024-12-31")
    })

    it("returns 500 on database error", async () => {
      vi.mocked(queries.getSourcePerformanceStats).mockRejectedValue(new Error("DB error"))

      const handlers = router.stack.find((layer) => layer.route?.path === "/sources/stats")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch source performance stats" },
      })
    })
  })

  describe("GET /runs/:id/sources/stats", () => {
    const mockRunSourceStats = [
      {
        source: "wikidata",
        total_attempts: 50,
        successful_attempts: 40,
        success_rate: 80.0,
        total_cost_usd: 1.0,
        average_cost_usd: 0.02,
        total_processing_time_ms: 75000,
        average_processing_time_ms: 1500,
      },
    ]

    it("returns source stats for specific run", async () => {
      mockReq.params = { id: "1" }
      vi.mocked(queries.getRunSourcePerformanceStats).mockResolvedValue(mockRunSourceStats)

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/sources/stats")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(queries.getRunSourcePerformanceStats).toHaveBeenCalledWith({}, 1)
      expect(jsonSpy).toHaveBeenCalledWith(mockRunSourceStats)
    })

    it("returns 400 for invalid run ID", async () => {
      mockReq.params = { id: "invalid" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/sources/stats")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid run ID" } })
    })

    it("returns 500 on database error", async () => {
      mockReq.params = { id: "1" }
      vi.mocked(queries.getRunSourcePerformanceStats).mockRejectedValue(new Error("DB error"))

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/sources/stats")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(500)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Failed to fetch run source performance stats" },
      })
    })
  })

  describe("POST /start", () => {
    it("returns 400 for invalid limit", async () => {
      mockReq.body = { limit: 0 }

      const handlers = router.stack.find((layer) => layer.route?.path === "/start")
      const handler = handlers?.route?.stack[handlers.route.stack.length - 1].handle
      if (!handler) throw new Error("Handler not found")
      await handler(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Limit must be between 1 and 1000" },
      })
    })

    it("returns 400 for limit exceeding maximum", async () => {
      mockReq.body = { limit: 2000 }

      const handlers = router.stack.find((layer) => layer.route?.path === "/start")
      const handler = handlers?.route?.stack[handlers.route.stack.length - 1].handle
      if (!handler) throw new Error("Handler not found")
      await handler(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Limit must be between 1 and 1000" },
      })
    })

    it("returns 400 for invalid maxTotalCost", async () => {
      mockReq.body = { maxTotalCost: -1 }

      const handlers = router.stack.find((layer) => layer.route?.path === "/start")
      const handler = handlers?.route?.stack[handlers.route.stack.length - 1].handle
      if (!handler) throw new Error("Handler not found")
      await handler(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Max total cost must be positive" },
      })
    })

    it("returns 400 for invalid maxCostPerActor", async () => {
      mockReq.body = { maxCostPerActor: 0 }

      const handlers = router.stack.find((layer) => layer.route?.path === "/start")
      const handler = handlers?.route?.stack[handlers.route.stack.length - 1].handle
      if (!handler) throw new Error("Handler not found")
      await handler(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: { message: "Max cost per actor must be positive" },
      })
    })

    it("logs admin action and returns 501 (not implemented)", async () => {
      mockReq.body = { limit: 10, maxTotalCost: 5.0 }

      const handlers = router.stack.find((layer) => layer.route?.path === "/start")
      const handler = handlers?.route?.stack[handlers.route.stack.length - 1].handle
      if (!handler) throw new Error("Handler not found")
      await handler(mockReq as Request, mockRes as Response, mockNext)

      expect(logAdminAction).toHaveBeenCalledWith({
        action: "start_enrichment",
        resourceType: "enrichment_run",
        details: { limit: 10, maxTotalCost: 5.0 },
        ipAddress: "127.0.0.1",
        userAgent: undefined,
      })

      expect(statusSpy).toHaveBeenCalledWith(501)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          message: "Enrichment run triggering not yet implemented. Use CLI script for now.",
        },
      })
    })
  })

  describe("POST /runs/:id/stop", () => {
    it("returns 400 for invalid run ID", async () => {
      mockReq.params = { id: "invalid" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/stop")
      const handler = handlers?.route?.stack[handlers.route.stack.length - 1].handle
      if (!handler) throw new Error("Handler not found")
      await handler(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid run ID" } })
    })

    it("logs admin action and returns 501 (not implemented)", async () => {
      mockReq.params = { id: "1" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/stop")
      const handler = handlers?.route?.stack[handlers.route.stack.length - 1].handle
      if (!handler) throw new Error("Handler not found")
      await handler(mockReq as Request, mockRes as Response, mockNext)

      expect(logAdminAction).toHaveBeenCalledWith({
        action: "stop_enrichment",
        resourceType: "enrichment_run",
        resourceId: 1,
        ipAddress: "127.0.0.1",
        userAgent: undefined,
      })

      expect(statusSpy).toHaveBeenCalledWith(501)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          message: "Enrichment run stopping not yet implemented",
        },
      })
    })
  })

  describe("GET /runs/:id/progress", () => {
    it("returns 400 for invalid run ID", async () => {
      mockReq.params = { id: "abc" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/progress")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid run ID" } })
    })

    it("returns 501 (not implemented)", async () => {
      mockReq.params = { id: "1" }

      const handlers = router.stack.find((layer) => layer.route?.path === "/runs/:id/progress")
      await handlers?.route?.stack[0].handle(mockReq as Request, mockRes as Response, mockNext)

      expect(statusSpy).toHaveBeenCalledWith(501)
      expect(jsonSpy).toHaveBeenCalledWith({
        error: {
          message: "Progress tracking not yet implemented",
        },
      })
    })
  })
})
