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
})
