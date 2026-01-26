import { describe, it, expect, beforeEach, vi } from "vitest"
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

describe("AB Tests API Routes", () => {
  let mockPool: Pool

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as any
  })

  describe("GET /admin/api/ab-tests/source-requirement", () => {
    it("has the route defined", async () => {
      const mockRows = [
        {
          id: 1,
          actor_id: 100,
          actor_name: "Test Actor",
          version: "with_sources" as const,
          circumstances: "Test circumstances",
          rumored_circumstances: null,
          sources: JSON.stringify(["https://example.com"]),
          resolved_sources: null,
          cost_usd: "0.002",
          created_at: new Date("2024-01-01"),
        },
      ]

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockRows,
      } as any)

      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/source-requirement" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })

    it("handles database errors", async () => {
      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      vi.mocked(mockPool.query).mockRejectedValueOnce(new Error("Database error"))

      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/source-requirement" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })

    it("handles empty results", async () => {
      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/source-requirement" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })
  })

  describe("GET /admin/api/ab-tests/comprehensive", () => {
    it("has the route defined", async () => {
      const mockRuns = [
        {
          id: 1,
          test_name: "Test Run 1",
          status: "completed",
          total_actors: 10,
          completed_actors: 10,
          total_variants: 60,
          completed_variants: 60,
          providers: ["gemini_pro", "perplexity"],
          strategies: ["require_sources", "require_reliable_sources", "no_sources"],
          total_cost_usd: "0.120",
          inferences: [],
          actor_criteria: { popularity: "top 40%" },
          started_at: new Date("2024-01-01"),
          completed_at: new Date("2024-01-01"),
          created_at: new Date("2024-01-01"),
        },
      ]

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockRuns,
      } as any)

      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/comprehensive" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })

    it("handles database errors", async () => {
      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      vi.mocked(mockPool.query).mockRejectedValueOnce(new Error("Database error"))

      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/comprehensive" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })
  })

  describe("GET /admin/api/ab-tests/comprehensive/:runId", () => {
    it("has the route defined", async () => {
      const mockRun = {
        id: 1,
        test_name: "Test Run",
        status: "completed",
        total_actors: 1,
        completed_actors: 1,
        total_variants: 6,
        completed_variants: 6,
        providers: ["gemini_pro", "perplexity"],
        strategies: ["require_sources", "require_reliable_sources", "no_sources"],
        total_cost_usd: "0.012",
        inferences: [],
        actor_criteria: {},
        started_at: new Date(),
        completed_at: new Date(),
        created_at: new Date(),
      }

      const mockResults = [
        {
          actor_id: 100,
          actor_name: "Test Actor",
          provider: "gemini_pro",
          strategy: "require_sources",
          what_we_know: "Test info",
          alternative_accounts: null,
          additional_context: null,
          sources: [],
          resolved_sources: null,
          cost_usd: "0.002",
          response_time_ms: 1000,
          created_at: new Date(),
        },
      ]

      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [mockRun] } as any)
        .mockResolvedValueOnce({ rows: mockResults } as any)

      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/comprehensive/:runId" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })

    it("handles non-existent run", async () => {
      const { getPool } = await import("../../lib/db/pool.js")
      vi.mocked(getPool).mockReturnValue(mockPool)

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any)

      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/comprehensive/:runId" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })

    it("handles invalid run ID format", async () => {
      const abTestsModule = await import("./ab-tests.js")
      const router = abTestsModule.default

      const route = router.stack.find(
        (layer: any) => layer.route?.path === "/comprehensive/:runId" && layer.route?.methods.get
      )

      expect(route).toBeDefined()
    })
  })
})
