/**
 * Tests for EnrichBiographiesBatchHandler
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { EnrichBiographiesBatchHandler } from "./enrich-biographies-batch.js"
import { JobType, QueueName } from "../types.js"

// ============================================================
// Mocks
// ============================================================

// Mock database pool
const mockQuery = vi.fn()

vi.mock("../../db.js", () => ({
  getPool: vi.fn(() => ({
    query: mockQuery,
  })),
}))

// Mock biography orchestrator
const mockEnrichActor = vi.fn()

vi.mock("../../biography-sources/orchestrator.js", () => ({
  BiographyEnrichmentOrchestrator: function MockOrchestrator() {
    return { enrichActor: mockEnrichActor }
  },
}))

// Mock biography db writer
const mockWriteToProduction = vi.fn().mockResolvedValue(undefined)
const mockWriteToStaging = vi.fn().mockResolvedValue(undefined)

vi.mock("../../biography-enrichment-db-writer.js", () => ({
  writeBiographyToProduction: (...args: unknown[]) => mockWriteToProduction(...args),
  writeBiographyToStaging: (...args: unknown[]) => mockWriteToStaging(...args),
}))

// Mock newrelic
vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
  },
}))

// Mock logger
vi.mock("../../logger.js", () => ({
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

// ============================================================
// Helpers
// ============================================================

function createMockJob(data: Record<string, unknown> = {}) {
  return {
    id: "job-123",
    data: {
      allowRegeneration: false,
      useStaging: false,
      ...data,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  }
}

function makeActorRow(id: number, name: string, tmdbPopularity = 10) {
  return {
    id,
    tmdb_id: id * 10,
    imdb_person_id: null,
    name,
    birthday: "1930-01-01",
    deathday: "2000-01-01",
    wikipedia_url: null,
    biography_raw_tmdb: null,
    biography: null,
    place_of_birth: null,
    tmdb_popularity: tmdbPopularity,
  }
}

function makeSuccessfulResult(actorId: number) {
  return {
    actorId,
    data: {
      narrativeTeaser: "A brief teaser about the actor.",
      narrative: "A longer narrative about the actor's life.",
      narrativeConfidence: "high" as const,
      lifeNotableFactors: ["military_service"],
      birthplaceDetails: "Born in Indiana",
      familyBackground: null,
      education: null,
      preFameLife: null,
      fameCatalyst: null,
      personalStruggles: null,
      relationships: null,
      lesserKnownFacts: [],
      hasSubstantiveContent: true,
    },
    sources: [
      {
        type: "wikipedia-bio",
        url: "https://en.wikipedia.org/wiki/Actor",
        retrievedAt: new Date(),
        confidence: 0.8,
      },
    ],
    stats: {
      sourcesAttempted: 3,
      sourcesSucceeded: 2,
      totalCostUsd: 0.005,
      processingTimeMs: 1500,
    },
  }
}

function makeNoContentResult(actorId: number) {
  return {
    actorId,
    data: null,
    sources: [],
    stats: {
      sourcesAttempted: 3,
      sourcesSucceeded: 0,
      totalCostUsd: 0.001,
      processingTimeMs: 800,
    },
    error: "No biographical data found from any source",
  }
}

// ============================================================
// Tests
// ============================================================

describe("EnrichBiographiesBatchHandler", () => {
  let handler: EnrichBiographiesBatchHandler

  beforeEach(() => {
    vi.clearAllMocks()
    handler = new EnrichBiographiesBatchHandler()
  })

  describe("configuration", () => {
    it("should have correct job type", () => {
      expect(handler.jobType).toBe(JobType.ENRICH_BIOGRAPHIES_BATCH)
    })

    it("should have correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.ENRICHMENT)
    })
  })

  describe("process", () => {
    it("should return empty results when no actors found", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const job = createMockJob({ actorIds: [1, 2, 3] })
      const result = await handler.process(job as any)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        actorsProcessed: 0,
        actorsEnriched: 0,
        actorsFailed: 0,
        totalCostUsd: 0,
        results: [],
      })
      expect(mockEnrichActor).not.toHaveBeenCalled()
    })

    it("should query actors by IDs when actorIds provided", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      const actor2 = makeActorRow(200, "Marlon Brando")
      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2] })

      mockEnrichActor
        .mockResolvedValueOnce(makeSuccessfulResult(100))
        .mockResolvedValueOnce(makeSuccessfulResult(200))

      const job = createMockJob({ actorIds: [100, 200] })
      await handler.process(job as any)

      // Verify the query used IN clause with actor IDs
      const queryCall = mockQuery.mock.calls[0]
      expect(queryCall[0]).toContain("WHERE id IN")
      expect(queryCall[1]).toEqual([100, 200])
    })

    it("should query actors by popularity when no IDs provided", async () => {
      const actor1 = makeActorRow(100, "Popular Actor", 50)
      mockQuery.mockResolvedValueOnce({ rows: [actor1] })

      mockEnrichActor.mockResolvedValueOnce(makeSuccessfulResult(100))

      const job = createMockJob({ minPopularity: 20, limit: 5 })
      await handler.process(job as any)

      const queryCall = mockQuery.mock.calls[0]
      expect(queryCall[0]).toContain("ORDER BY dof_popularity DESC NULLS LAST, id ASC")
      expect(queryCall[0]).toContain("COALESCE(dof_popularity, 0) >= $1")
      expect(queryCall[1]).toEqual([20, 5])
    })

    it("should skip actors with existing biographies when allowRegeneration is false", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const job = createMockJob({ actorIds: [100], allowRegeneration: false })
      await handler.process(job as any)

      const queryCall = mockQuery.mock.calls[0]
      expect(queryCall[0]).toContain("NOT IN (SELECT actor_id FROM actor_biography_details)")
    })

    it("should not filter existing biographies when allowRegeneration is true", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const job = createMockJob({ actorIds: [100], allowRegeneration: true })
      await handler.process(job as any)

      const queryCall = mockQuery.mock.calls[0]
      expect(queryCall[0]).not.toContain("NOT IN (SELECT actor_id FROM actor_biography_details)")
    })

    it("should call orchestrator.enrichActor for each actor", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      const actor2 = makeActorRow(200, "Marlon Brando")
      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2] })

      mockEnrichActor
        .mockResolvedValueOnce(makeSuccessfulResult(100))
        .mockResolvedValueOnce(makeSuccessfulResult(200))

      const job = createMockJob({ actorIds: [100, 200] })
      await handler.process(job as any)

      expect(mockEnrichActor).toHaveBeenCalledTimes(2)
      expect(mockEnrichActor).toHaveBeenCalledWith(actor1)
      expect(mockEnrichActor).toHaveBeenCalledWith(actor2)
    })

    it("should write to production when enrichment succeeds", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      mockQuery.mockResolvedValueOnce({ rows: [actor1] })

      const enrichResult = makeSuccessfulResult(100)
      mockEnrichActor.mockResolvedValueOnce(enrichResult)

      const job = createMockJob({ actorIds: [100], useStaging: false })
      const result = await handler.process(job as any)

      expect(mockWriteToProduction).toHaveBeenCalledOnce()
      expect(mockWriteToProduction).toHaveBeenCalledWith(
        expect.anything(), // db pool
        100,
        enrichResult.data,
        enrichResult.sources
      )
      expect(mockWriteToStaging).not.toHaveBeenCalled()
      expect(result.data?.actorsEnriched).toBe(1)
    })

    it("should write to staging when useStaging is true", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      mockQuery.mockResolvedValueOnce({ rows: [actor1] })

      const enrichResult = makeSuccessfulResult(100)
      mockEnrichActor.mockResolvedValueOnce(enrichResult)

      const job = createMockJob({ actorIds: [100], useStaging: true })
      await handler.process(job as any)

      expect(mockWriteToStaging).toHaveBeenCalledOnce()
      expect(mockWriteToStaging).toHaveBeenCalledWith(
        expect.anything(),
        100,
        enrichResult.data,
        enrichResult.sources
      )
      expect(mockWriteToProduction).not.toHaveBeenCalled()
    })

    it("should handle enrichment errors gracefully", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      const actor2 = makeActorRow(200, "Marlon Brando")
      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2] })

      mockEnrichActor
        .mockRejectedValueOnce(new Error("API timeout"))
        .mockResolvedValueOnce(makeSuccessfulResult(200))

      const job = createMockJob({ actorIds: [100, 200] })
      const result = await handler.process(job as any)

      expect(result.success).toBe(true)
      expect(result.data?.actorsProcessed).toBe(2)
      expect(result.data?.actorsEnriched).toBe(1)
      expect(result.data?.actorsFailed).toBe(1)
      expect(result.data?.results[0]).toEqual({
        actorId: 100,
        actorName: "John Wayne",
        enriched: false,
        error: "API timeout",
        costUsd: 0,
      })
      expect(result.data?.results[1]).toEqual({
        actorId: 200,
        actorName: "Marlon Brando",
        enriched: true,
        costUsd: 0.005,
      })
    })

    it("should return correct stats", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      const actor2 = makeActorRow(200, "Marlon Brando")
      const actor3 = makeActorRow(300, "James Dean")
      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2, actor3] })

      mockEnrichActor
        .mockResolvedValueOnce(makeSuccessfulResult(100))
        .mockResolvedValueOnce(makeNoContentResult(200))
        .mockRejectedValueOnce(new Error("Network error"))

      const job = createMockJob({ actorIds: [100, 200, 300] })
      const result = await handler.process(job as any)

      expect(result.data).toEqual({
        actorsProcessed: 3,
        actorsEnriched: 1,
        actorsFailed: 1,
        totalCostUsd: 0.005 + 0.001, // success + no content costs
        results: [
          { actorId: 100, actorName: "John Wayne", enriched: true, costUsd: 0.005 },
          {
            actorId: 200,
            actorName: "Marlon Brando",
            enriched: false,
            error: "No biographical data found from any source",
            costUsd: 0.001,
          },
          {
            actorId: 300,
            actorName: "James Dean",
            enriched: false,
            error: "Network error",
            costUsd: 0,
          },
        ],
      })
    })

    it("should update job progress", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      const actor2 = makeActorRow(200, "Marlon Brando")
      mockQuery.mockResolvedValueOnce({ rows: [actor1, actor2] })

      mockEnrichActor
        .mockResolvedValueOnce(makeSuccessfulResult(100))
        .mockResolvedValueOnce(makeSuccessfulResult(200))

      const job = createMockJob({ actorIds: [100, 200] })
      await handler.process(job as any)

      expect(job.updateProgress).toHaveBeenCalledTimes(2)
      expect(job.updateProgress).toHaveBeenNthCalledWith(1, 50) // 1/2 = 50%
      expect(job.updateProgress).toHaveBeenNthCalledWith(2, 100) // 2/2 = 100%
    })

    it("should use default limit of 10 when no limit specified", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      const job = createMockJob({}) // no actorIds, no limit
      await handler.process(job as any)

      const queryCall = mockQuery.mock.calls[0]
      expect(queryCall[0]).toContain("LIMIT $")
      // The last param should be the limit value of 10
      const params = queryCall[1] as unknown[]
      expect(params[params.length - 1]).toBe(10)
    })

    it("should not write when enrichment returns no substantive content", async () => {
      const actor1 = makeActorRow(100, "John Wayne")
      mockQuery.mockResolvedValueOnce({ rows: [actor1] })

      mockEnrichActor.mockResolvedValueOnce(makeNoContentResult(100))

      const job = createMockJob({ actorIds: [100] })
      const result = await handler.process(job as any)

      expect(mockWriteToProduction).not.toHaveBeenCalled()
      expect(mockWriteToStaging).not.toHaveBeenCalled()
      expect(result.data?.actorsEnriched).toBe(0)
      expect(result.data?.results[0].enriched).toBe(false)
    })
  })
})
