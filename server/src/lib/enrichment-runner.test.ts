/**
 * Tests for EnrichmentRunner
 *
 * Tests the core enrichment logic extracted from the CLI script.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { EnrichmentRunner, EnrichmentRunnerConfig } from "./enrichment-runner.js"

// Mock database pool
const mockQuery = vi.fn()
vi.mock("./db.js", () => ({
  getPool: vi.fn(() => ({
    query: mockQuery,
  })),
}))

// Default enrichment result (enriched path: has circumstances)
const defaultEnrichResult = {
  date: "2020-01-15",
  location: "Los Angeles, California, USA",
  causeOfDeath: "heart attack",
  circumstances: "Died peacefully at home",
  confidence: 0.9,
  sources: ["wikipedia", "imdb"],
  cost: 0.1,
}

// Module-level variable tests can override to control enrichActor return value
let mockEnrichResult: Record<string, unknown> = { ...defaultEnrichResult }

// Mock orchestrator as a proper class
vi.mock("./death-sources/orchestrator.js", () => {
  return {
    DeathEnrichmentOrchestrator: class MockOrchestrator {
      private actorsProcessed = 0
      private actorsEnriched = 0
      private totalCost = 0

      enrichActor = vi.fn().mockImplementation(async () => {
        this.actorsProcessed++
        const hasSubstantiveEnrichment =
          mockEnrichResult != null &&
          Object.values(mockEnrichResult).some((value) => value !== null && value !== undefined)
        if (hasSubstantiveEnrichment) {
          this.actorsEnriched++
        }
        this.totalCost += 0.1
        return mockEnrichResult
      })

      getStats = vi.fn().mockImplementation(() => ({
        actorsProcessed: this.actorsProcessed,
        actorsEnriched: this.actorsEnriched,
        fillRate: this.actorsProcessed > 0 ? (this.actorsEnriched / this.actorsProcessed) * 100 : 0,
        totalCostUsd: this.totalCost,
        totalTimeMs: 1000,
        sourceHitRates: {},
        costBySource: {},
        errors: [],
      }))
    },
    CostExceededError: class CostExceededError extends Error {},
  }
})

// Mock cache
vi.mock("./cache.js", () => ({
  invalidateActorCache: vi.fn().mockResolvedValue(undefined),
  rebuildDeathCaches: vi.fn().mockResolvedValue(undefined),
}))

// Mock logger with child method
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}))

// Mock newrelic
vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
  },
}))

describe("EnrichmentRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock query to return empty by default
    mockQuery.mockResolvedValue({ rows: [] })
    // Reset enrichment result to default (enriched path)
    mockEnrichResult = { ...defaultEnrichResult }
  })

  describe("constructor", () => {
    it("should accept configuration with all options", () => {
      const config: EnrichmentRunnerConfig = {
        limit: 100,
        minPopularity: 5,
        recentOnly: true,
        actorIds: [1, 2, 3],
        free: true,
        paid: true,
        ai: false,
        confidence: 0.7,
        maxCostPerActor: 1.0,
        maxTotalCost: 10,
        claudeCleanup: true,
        gatherAllSources: true,
        followLinks: true,
        aiLinkSelection: true,
        aiContentExtraction: true,
        staging: false,
      }

      const runner = new EnrichmentRunner(config)
      expect(runner).toBeDefined()
    })

    it("should accept minimal configuration with defaults", () => {
      const runner = new EnrichmentRunner({})
      expect(runner).toBeDefined()
    })

    it("should accept progress callback", () => {
      const onProgress = vi.fn()
      const runner = new EnrichmentRunner({}, onProgress)
      expect(runner).toBeDefined()
    })

    it("should accept abort signal", () => {
      const controller = new AbortController()
      const runner = new EnrichmentRunner({}, undefined, controller.signal)
      expect(runner).toBeDefined()
    })
  })

  describe("run with actorIds", () => {
    it("should process specific actors by ID", async () => {
      // Mock query to return actors
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 },
            { id: 2, name: "Actor Two", tmdb_id: 1002, tmdb_popularity: 40 },
          ],
        })
        .mockResolvedValue({ rows: [] })

      const runner = new EnrichmentRunner({
        actorIds: [1, 2],
        free: true,
        paid: false,
        ai: false,
        staging: false,
      })

      const stats = await runner.run()

      expect(stats.actorsProcessed).toBe(2)
      expect(mockQuery).toHaveBeenCalled()
    })

    it("should handle empty actorIds array", async () => {
      mockQuery.mockResolvedValue({ rows: [] })

      const runner = new EnrichmentRunner({
        actorIds: [],
        staging: false,
      })

      const stats = await runner.run()

      expect(stats.actorsProcessed).toBe(0)
      expect(stats.exitReason).toBe("completed")
    })
  })

  describe("progress callback", () => {
    it("should call progress callback during processing", async () => {
      const progressCallback = vi.fn().mockResolvedValue(undefined)

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 }],
        })
        .mockResolvedValue({ rows: [] })

      const runner = new EnrichmentRunner(
        {
          actorIds: [1],
          free: true,
          paid: false,
          ai: false,
          staging: false,
        },
        progressCallback
      )

      await runner.run()

      expect(progressCallback).toHaveBeenCalled()
      const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1][0]
      expect(lastCall).toHaveProperty("actorsQueried")
      expect(lastCall).toHaveProperty("actorsProcessed")
    })
  })

  describe("abort signal", () => {
    it("should stop processing when aborted", async () => {
      const controller = new AbortController()

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 },
            { id: 2, name: "Actor Two", tmdb_id: 1002, tmdb_popularity: 40 },
          ],
        })
        .mockResolvedValue({ rows: [] })

      const runner = new EnrichmentRunner(
        {
          actorIds: [1, 2],
          free: true,
          paid: false,
          ai: false,
          staging: false,
        },
        undefined,
        controller.signal
      )

      // Abort immediately
      controller.abort()

      const stats = await runner.run()

      expect(stats.exitReason).toBe("interrupted")
    })
  })

  describe("cost limits", () => {
    it("should pass maxTotalCost to orchestrator config", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 }],
        })
        .mockResolvedValue({ rows: [] })

      const runner = new EnrichmentRunner({
        limit: 100,
        maxTotalCost: 0.5, // Very low limit
        free: true,
        paid: true,
        ai: true,
        staging: false,
      })

      const stats = await runner.run()

      // The runner should complete and return stats
      // (actual cost limiting is handled by the orchestrator, which is mocked)
      expect(stats.exitReason).toBe("completed")
      expect(stats).toHaveProperty("totalCostUsd")
    })
  })

  describe("return stats", () => {
    it("should return complete EnrichmentStats", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 }],
        })
        .mockResolvedValue({ rows: [] })

      const runner = new EnrichmentRunner({
        actorIds: [1],
        free: true,
        paid: false,
        ai: false,
        staging: false,
      })

      const stats = await runner.run()

      expect(stats).toHaveProperty("actorsProcessed")
      expect(stats).toHaveProperty("actorsEnriched")
      expect(stats).toHaveProperty("totalCostUsd")
      expect(stats).toHaveProperty("exitReason")
      expect(stats).toHaveProperty("fillRate")
      expect(stats).toHaveProperty("totalTimeMs")
      expect(stats).toHaveProperty("costBySource")
      expect(stats).toHaveProperty("updatedActors")
      expect(typeof stats.actorsProcessed).toBe("number")
      expect(typeof stats.actorsEnriched).toBe("number")
      expect(typeof stats.totalCostUsd).toBe("number")
      expect(typeof stats.exitReason).toBe("string")
    })
  })

  describe("run with runId (non-staging)", () => {
    it("should use ON CONFLICT upsert for enriched actor INSERT to handle retries", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 }],
        })
        .mockResolvedValue({ rows: [{ id: 123 }] })

      const runner = new EnrichmentRunner({
        actorIds: [1],
        runId: 42,
        staging: false,
        free: true,
        paid: false,
        ai: false,
      })

      await runner.run()

      const insertCalls = mockQuery.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO enrichment_run_actors")
      )
      expect(insertCalls.length).toBeGreaterThan(0)
      for (const call of insertCalls) {
        expect(call[0]).toContain("ON CONFLICT (run_id, actor_id) DO UPDATE SET")
      }
    })

    it("should use ON CONFLICT upsert for non-enriched actor INSERT to handle retries", async () => {
      // Clear the fields that actually drive hasEnrichmentData to ensure
      // we hit the non-enriched INSERT path regardless of future logic changes
      mockEnrichResult = {
        ...defaultEnrichResult,
        date: null,
        location: null,
        causeOfDeath: null,
        circumstances: null,
        notableFactors: null,
        cleanedDeathInfo: null,
      }

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 }],
        })
        .mockResolvedValue({ rows: [] })

      const runner = new EnrichmentRunner({
        actorIds: [1],
        runId: 42,
        staging: false,
        free: true,
        paid: false,
        ai: false,
      })

      await runner.run()

      const insertCalls = mockQuery.mock.calls.filter(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO enrichment_run_actors")
      )
      expect(insertCalls.length).toBeGreaterThan(0)
      for (const call of insertCalls) {
        expect(call[0]).toContain("ON CONFLICT (run_id, actor_id) DO UPDATE SET")
      }
      // Non-enriched path sets was_enriched = false (param index 2, 0-based)
      expect(insertCalls[0][1][2]).toBe(false)
    })

    it("should insert into enrichment_run_actors and write to production when runId is provided with staging: false", async () => {
      // Mock: first call returns actors, subsequent calls return empty or INSERT result
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: "Actor One", tmdb_id: 1001, tmdb_popularity: 50 }],
        })
        .mockResolvedValue({ rows: [{ id: 123 }] }) // For INSERT RETURNING id

      const runner = new EnrichmentRunner({
        actorIds: [1],
        runId: 42,
        staging: false,
        free: true,
        paid: false,
        ai: false,
      })

      const stats = await runner.run()

      expect(stats.actorsProcessed).toBe(1)
      expect(stats.exitReason).toBe("completed")

      // Verify INSERT INTO enrichment_run_actors was called
      const insertCall = mockQuery.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO enrichment_run_actors")
      )
      expect(insertCall).toBeDefined()
      expect(insertCall![1]).toContain(42) // runId should be in params

      // Verify production write was called (INSERT INTO actor_death_circumstances)
      const productionWriteCall = mockQuery.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT INTO actor_death_circumstances")
      )
      expect(productionWriteCall).toBeDefined()
    })
  })
})
