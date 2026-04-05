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

// Mock biography debriefer adapter
const mockEnrichActor = vi.fn()

vi.mock("../../biography-sources/debriefer/adapter.js", () => ({
  createBioEnrichmentPipeline: () => mockEnrichActor,
}))

// Mock biography db writer
const mockWriteToProduction = vi.fn().mockResolvedValue(undefined)
const mockWriteToStaging = vi.fn().mockResolvedValue(undefined)

vi.mock("../../biography-enrichment-db-writer.js", () => ({
  writeBiographyToProduction: (...args: unknown[]) => mockWriteToProduction(...args),
  writeBiographyToStaging: (...args: unknown[]) => mockWriteToStaging(...args),
}))

// Mock surprise discovery orchestrator
const mockRunSurpriseDiscovery = vi.fn()

vi.mock("../../biography-sources/surprise-discovery/orchestrator.js", () => ({
  runSurpriseDiscovery: (...args: unknown[]) => mockRunSurpriseDiscovery(...args),
}))

vi.mock("../../biography-sources/surprise-discovery/types.js", () => ({
  DEFAULT_DISCOVERY_CONFIG: {
    enabled: true,
    integrationStrategy: "append-only",
    incongruityThreshold: 7,
    maxCostPerActorUsd: 0.1,
  },
}))

// Mock newrelic
vi.mock("newrelic", () => ({
  default: {
    addCustomAttribute: vi.fn(),
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
      discoveryEnabled: false, // disabled by default; override in discovery-specific tests
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
      sourceCostUsd: 0.002,
      synthesisCostUsd: 0.003,
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
      sourceCostUsd: 0.001,
      synthesisCostUsd: 0,
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

    // Default: discovery returns no findings and no queries run (avoids extra DB write)
    mockRunSurpriseDiscovery.mockResolvedValue({
      hasFindings: false,
      updatedNarrative: null,
      newLesserKnownFacts: [],
      discoveryResults: {
        costUsd: 0,
        autocomplete: { queriesRun: 0, totalSuggestions: 0 },
        reddit: { queriesRun: 0, postsFound: 0 },
        verification: { factsChecked: 0, factsVerified: 0 },
      },
    })
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

      // Results may arrive in any order due to parallel processing
      const sortedResults = [...(result.data?.results ?? [])].sort((a, b) => a.actorId - b.actorId)
      expect(sortedResults[0]).toEqual({
        actorId: 100,
        actorName: "John Wayne",
        enriched: false,
        error: "API timeout",
        costUsd: 0,
      })
      expect(sortedResults[1]).toEqual({
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

      expect(result.data?.actorsProcessed).toBe(3)
      expect(result.data?.actorsEnriched).toBe(1)
      expect(result.data?.actorsFailed).toBe(1)
      expect(result.data?.totalCostUsd).toBeCloseTo(0.005 + 0.001) // success + no content costs

      // Results may arrive in any order due to parallel processing
      const sortedResults = [...(result.data?.results ?? [])].sort((a, b) => a.actorId - b.actorId)
      expect(sortedResults).toEqual([
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
      ])
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

    describe("surprise discovery", () => {
      it("should run discovery when discoveryEnabled is true", async () => {
        const actor1 = makeActorRow(100, "John Wayne")
        mockQuery.mockResolvedValueOnce({ rows: [actor1] })
        mockEnrichActor.mockResolvedValueOnce(makeSuccessfulResult(100))

        const job = createMockJob({ actorIds: [100], discoveryEnabled: true })
        await handler.process(job as any)

        expect(mockRunSurpriseDiscovery).toHaveBeenCalledOnce()
        expect(mockRunSurpriseDiscovery).toHaveBeenCalledWith(
          expect.anything(), // db pool
          { id: 100, name: "John Wayne", tmdb_id: 1000 },
          "A longer narrative about the actor's life.",
          [],
          expect.objectContaining({ enabled: true })
        )
      })

      it("should skip discovery when discoveryEnabled is false", async () => {
        const actor1 = makeActorRow(100, "John Wayne")
        mockQuery.mockResolvedValueOnce({ rows: [actor1] })
        mockEnrichActor.mockResolvedValueOnce(makeSuccessfulResult(100))

        const job = createMockJob({ actorIds: [100], discoveryEnabled: false })
        await handler.process(job as any)

        expect(mockRunSurpriseDiscovery).not.toHaveBeenCalled()
      })

      it("should skip discovery when enrichment produces no substantive content", async () => {
        const actor1 = makeActorRow(100, "John Wayne")
        mockQuery.mockResolvedValueOnce({ rows: [actor1] })
        mockEnrichActor.mockResolvedValueOnce(makeNoContentResult(100))

        const job = createMockJob({ actorIds: [100], discoveryEnabled: true })
        await handler.process(job as any)

        expect(mockRunSurpriseDiscovery).not.toHaveBeenCalled()
      })

      it("should write discovery results to DB when queriesRun > 0", async () => {
        const actor1 = makeActorRow(100, "John Wayne")
        mockQuery.mockResolvedValueOnce({ rows: [actor1] })
        mockEnrichActor.mockResolvedValueOnce(makeSuccessfulResult(100))

        mockRunSurpriseDiscovery.mockResolvedValueOnce({
          hasFindings: false,
          updatedNarrative: null,
          newLesserKnownFacts: [],
          discoveryResults: {
            costUsd: 0.002,
            autocomplete: { queriesRun: 3, totalSuggestions: 10 },
            reddit: { queriesRun: 0, postsFound: 0 },
            verification: { factsChecked: 0, factsVerified: 0 },
          },
        })
        // Allow the DB write to succeed
        mockQuery.mockResolvedValueOnce({ rows: [] })

        const job = createMockJob({ actorIds: [100], discoveryEnabled: true })
        await handler.process(job as any)

        // Should write discovery_results even with no new facts
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("UPDATE actor_biography_details SET"),
          expect.arrayContaining([100])
        )
      })

      it("should prepend new facts and update narrative when discovery has findings", async () => {
        const actor1 = makeActorRow(100, "John Wayne")
        mockQuery.mockResolvedValueOnce({ rows: [actor1] })
        mockEnrichActor.mockResolvedValueOnce(makeSuccessfulResult(100))

        mockRunSurpriseDiscovery.mockResolvedValueOnce({
          hasFindings: true,
          updatedNarrative: "Updated narrative with new facts.",
          newLesserKnownFacts: [
            {
              text: "Surprising new fact",
              sourceUrl: "https://example.com",
              sourceName: "Example",
            },
          ],
          discoveryResults: {
            costUsd: 0.005,
            autocomplete: { queriesRun: 5, totalSuggestions: 20 },
            reddit: { queriesRun: 2, postsFound: 1 },
            verification: { factsChecked: 1, factsVerified: 1 },
          },
        })
        // Allow the DB write to succeed
        mockQuery.mockResolvedValueOnce({ rows: [] })

        const job = createMockJob({ actorIds: [100], discoveryEnabled: true })
        await handler.process(job as any)

        // Verify the UPDATE query contains lesser_known_facts and narrative
        const updateCall = mockQuery.mock.calls.find(
          (call) =>
            typeof call[0] === "string" &&
            call[0].includes("UPDATE actor_biography_details") &&
            call[0].includes("lesser_known_facts")
        )
        expect(updateCall).toBeDefined()
        expect(updateCall![0]).toContain("narrative =")
        expect(updateCall![1]).toContain(100)
      })

      it("should not fail enrichment when discovery throws an error", async () => {
        const actor1 = makeActorRow(100, "John Wayne")
        mockQuery.mockResolvedValueOnce({ rows: [actor1] })
        mockEnrichActor.mockResolvedValueOnce(makeSuccessfulResult(100))
        mockRunSurpriseDiscovery.mockRejectedValueOnce(new Error("Discovery API timeout"))

        const job = createMockJob({ actorIds: [100], discoveryEnabled: true })
        const result = await handler.process(job as any)

        // Enrichment still succeeds despite discovery failure
        expect(result.success).toBe(true)
        expect(result.data?.actorsEnriched).toBe(1)
        expect(result.data?.results[0].enriched).toBe(true)
      })

      it("should pass discovery config options to runSurpriseDiscovery", async () => {
        const actor1 = makeActorRow(100, "John Wayne")
        mockQuery.mockResolvedValueOnce({ rows: [actor1] })
        mockEnrichActor.mockResolvedValueOnce(makeSuccessfulResult(100))

        const job = createMockJob({
          actorIds: [100],
          discoveryEnabled: true,
          discoveryIntegrationStrategy: "re-synthesize",
          discoveryIncongruityThreshold: 9,
          discoveryMaxCostPerActor: 0.25,
        })
        await handler.process(job as any)

        expect(mockRunSurpriseDiscovery).toHaveBeenCalledWith(
          expect.anything(), // db pool
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            integrationStrategy: "re-synthesize",
            incongruityThreshold: 9,
            maxCostPerActorUsd: 0.25,
          })
        )
      })
    })
  })
})
