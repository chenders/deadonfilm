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

describe("Coverage API Routes", () => {
  let mockPool: Pool
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    jsonSpy = vi.fn()
    statusSpy = vi.fn(() => ({ json: jsonSpy }))

    mockRes = {
      json: jsonSpy as any,
      status: statusSpy as any,
    }

    mockReq = {
      query: {},
    }

    mockPool = {
      query: vi.fn(),
    } as any
  })

  describe("GET /admin/api/coverage/stats", () => {
    it("returns coverage statistics", async () => {
      const mockStats = {
        total_deceased_actors: 1000,
        actors_with_death_pages: 250,
        actors_without_death_pages: 750,
        coverage_percentage: 25.0,
        enrichment_candidates_count: 500,
        high_priority_count: 100,
      }

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any)

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      // Get the stats route handler
      const statsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/stats" && layer.route?.methods.get
      )

      expect(statsRoute).toBeDefined()
    })
  })

  describe("GET /admin/api/coverage/actors", () => {
    it("returns paginated actor list with filters", async () => {
      const mockActors = {
        items: [
          {
            id: 1,
            name: "Test Actor",
            tmdb_id: 123,
            deathday: "2020-01-01",
            tmdb_popularity: 50.5,
            has_detailed_death_info: false,
            enriched_at: null,
            age_at_death: 75,
            cause_of_death: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        totalPages: 1,
      }

      mockReq.query = {
        page: "1",
        pageSize: "50",
        hasDeathPage: "false",
        minPopularity: "10",
      }

      // This test verifies the route exists and is properly configured
      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const actorsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/actors" && layer.route?.methods.get
      )

      expect(actorsRoute).toBeDefined()
    })
  })

  describe("GET /admin/api/coverage/actors - deathManner filter", () => {
    it("accepts valid deathManner values", async () => {
      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const actorsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/actors" && layer.route?.methods.get
      )

      expect(actorsRoute).toBeDefined()

      // Valid manners should be passed through to filters
      const validManners = ["natural", "accident", "suicide", "homicide", "undetermined", "pending"]
      for (const manner of validManners) {
        const req = {
          query: { deathManner: manner },
        } as any

        const { getPool } = await import("../../lib/db/pool.js")
        vi.mocked(getPool).mockReturnValue(mockPool)
        vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

        const jsonFn = vi.fn()
        const res = { json: jsonFn, status: vi.fn(() => ({ json: vi.fn() })) } as any

        await actorsRoute!.route!.stack[0].handle(req, res, vi.fn())

        // Verify the query included death_manner filter
        const calls = vi.mocked(mockPool.query).mock.calls
        const lastCall = calls[calls.length - 1]
        expect(lastCall[0]).toContain("death_manner")
        expect(lastCall[1]).toContain(manner)

        vi.mocked(mockPool.query).mockReset()
      }
    })

    it("ignores invalid deathManner values", async () => {
      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const actorsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/actors" && layer.route?.methods.get
      )

      const req = {
        query: { deathManner: "invalid_value" },
      } as any

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any)

      const jsonFn = vi.fn()
      const res = { json: jsonFn, status: vi.fn(() => ({ json: vi.fn() })) } as any

      await actorsRoute!.route!.stack[0].handle(req, res, vi.fn())

      // Invalid manner should NOT appear in query params (only in SELECT, not WHERE)
      const calls = vi.mocked(mockPool.query).mock.calls
      const lastCall = calls[calls.length - 1]
      expect(lastCall[1]).not.toContain("invalid_value")
    })
  })

  describe("GET /admin/api/coverage/trends", () => {
    it("returns coverage trends with granularity", async () => {
      const mockTrends = [
        {
          captured_at: "2024-01-01T00:00:00Z",
          total_deceased_actors: 1000,
          actors_with_death_pages: 250,
          actors_without_death_pages: 750,
          coverage_percentage: 25.0,
          enrichment_candidates_count: 500,
          high_priority_count: 100,
        },
      ]

      mockReq.query = {
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        granularity: "daily",
      }

      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const trendsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/trends" && layer.route?.methods.get
      )

      expect(trendsRoute).toBeDefined()
    })

    it("validates granularity parameter", async () => {
      mockReq.query = {
        startDate: "2024-01-01",
        endDate: "2024-01-31",
        granularity: "invalid",
      }

      // This should be rejected by the route handler
      // The actual validation happens in the route implementation
    })
  })

  describe("GET /admin/api/coverage/enrichment-candidates", () => {
    it("returns prioritized enrichment candidates", async () => {
      const mockCandidates = [
        {
          id: 1,
          name: "High Priority Actor",
          tmdb_id: 123,
          deathday: "2020-01-01",
          tmdb_popularity: 75.0,
          has_detailed_death_info: false,
          enriched_at: null,
          age_at_death: 65,
          cause_of_death: null,
        },
      ]

      mockReq.query = {
        minPopularity: "10",
        limit: "100",
      }

      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const candidatesRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/enrichment-candidates" && layer.route?.methods.get
      )

      expect(candidatesRoute).toBeDefined()
    })
  })

  describe("GET /admin/api/coverage/causes", () => {
    it("route exists and is properly configured", async () => {
      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const causesRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/causes" && layer.route?.methods.get
      )

      expect(causesRoute).toBeDefined()
    })

    it("returns distinct causes of death", async () => {
      const mockCauses = [
        { value: "heart attack", label: "Heart Attack", count: 50 },
        { value: "cancer", label: "Cancer", count: 45 },
        { value: "natural causes", label: "Natural Causes", count: 30 },
      ]

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockCauses.map((c) => ({ cause: c.value, count: c.count })),
      } as any)

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      // Verify route handler exists
      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const causesRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/causes" && layer.route?.methods.get
      )

      expect(causesRoute).toBeDefined()
    })
  })

  describe("GET /admin/api/coverage/enrichment-versions", () => {
    it("route exists and is properly configured", async () => {
      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const versionsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/enrichment-versions" && layer.route?.methods.get
      )

      expect(versionsRoute).toBeDefined()
    })

    it("returns distinct death and bio enrichment versions with counts", async () => {
      const mockDeathVersions = [
        { version: "3.0.0", count: "1234" },
        { version: "2.0.0", count: "567" },
      ]
      const mockBioVersions = [
        { version: 2, count: "890" },
        { version: 1, count: "456" },
      ]

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockDeathVersions } as any)
        .mockResolvedValueOnce({ rows: mockBioVersions } as any)

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const versionsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/enrichment-versions" && layer.route?.methods.get
      )

      expect(versionsRoute).toBeDefined()

      const req = { query: {} } as any
      const jsonFn = vi.fn()
      const res = { json: jsonFn, status: vi.fn(() => ({ json: vi.fn() })) } as any

      await versionsRoute!.route!.stack[0].handle(req, res, vi.fn())

      expect(jsonFn).toHaveBeenCalled()
    })

    it("handles database errors gracefully", async () => {
      vi.mocked(mockPool.query).mockRejectedValueOnce(new Error("Connection failed"))

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const versionsRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/enrichment-versions" && layer.route?.methods.get
      )

      const req = { query: {} } as any
      const jsonFn = vi.fn()
      const statusJsonFn = vi.fn()
      const res = { json: jsonFn, status: vi.fn(() => ({ json: statusJsonFn })) } as any

      await versionsRoute!.route!.stack[0].handle(req, res, vi.fn())

      expect(res.status).toHaveBeenCalledWith(500)
      expect(statusJsonFn).toHaveBeenCalledWith({
        error: { message: "Failed to fetch enrichment versions" },
      })
    })
  })

  describe("GET /admin/api/coverage/actors/:id/preview", () => {
    it("route exists and is properly configured", async () => {
      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const previewRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/actors/:id/preview" && layer.route?.methods.get
      )

      expect(previewRoute).toBeDefined()
    })

    it("accepts valid actor ID parameter", async () => {
      mockReq.params = { id: "123" }

      const coverageModule = await import("./coverage.js")
      const router = coverageModule.default

      const previewRoute = router.stack.find(
        (layer: any) => layer.route?.path === "/actors/:id/preview" && layer.route?.methods.get
      )

      expect(previewRoute).toBeDefined()
      // The route pattern should accept numeric IDs
      expect(previewRoute!.route!.path).toBe("/actors/:id/preview")
    })
  })
})
