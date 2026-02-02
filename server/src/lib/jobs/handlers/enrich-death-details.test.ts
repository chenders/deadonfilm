/**
 * Tests for EnrichDeathDetailsHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { EnrichDeathDetailsHandler } from "./enrich-death-details.js"
import { JobType, QueueName } from "../types.js"
import * as db from "../../db.js"
import * as cache from "../../cache.js"
import * as enrichmentDbWriter from "../../enrichment-db-writer.js"

// Use vi.hoisted to create mock that can be referenced in vi.mock
const { mockOrchestratorInstance, MockDeathEnrichmentOrchestrator } = vi.hoisted(() => {
  const instance = {
    enrichActor: vi.fn(),
    getStats: vi.fn().mockReturnValue({ totalCostUsd: 0.05 }),
  }
  return {
    mockOrchestratorInstance: instance,
    MockDeathEnrichmentOrchestrator: function () {
      return instance
    },
  }
})

// Mock external dependencies
vi.mock("../../db.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../cache.js", () => ({
  invalidateActorCache: vi.fn(),
}))

vi.mock("../../enrichment-db-writer.js", () => ({
  writeToProduction: vi.fn(),
}))

vi.mock("../../death-sources/index.js", () => ({
  DeathEnrichmentOrchestrator: MockDeathEnrichmentOrchestrator,
}))

vi.mock("../../claude-batch/index.js", () => ({
  MIN_CIRCUMSTANCES_LENGTH: 200,
  MIN_RUMORED_CIRCUMSTANCES_LENGTH: 100,
}))

vi.mock("../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}))

vi.mock("newrelic", () => ({
  default: {
    startBackgroundTransaction: vi.fn((name, fn) => fn()),
    addCustomAttribute: vi.fn(),
    startSegment: vi.fn((name, record, fn) => fn()),
    recordMetric: vi.fn(),
    recordCustomEvent: vi.fn(),
    noticeError: vi.fn(),
  },
}))

describe("EnrichDeathDetailsHandler", () => {
  let handler: EnrichDeathDetailsHandler
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handler = new EnrichDeathDetailsHandler()
    vi.clearAllMocks()

    // Setup mock pool
    mockPool = {
      query: vi.fn(),
    }
    vi.mocked(db.getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof db.getPool>)

    // Reset mock orchestrator instance methods
    mockOrchestratorInstance.enrichActor.mockReset()
    mockOrchestratorInstance.getStats.mockReset().mockReturnValue({ totalCostUsd: 0.05 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.ENRICH_DEATH_DETAILS)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.ENRICHMENT)
    })
  })

  describe("process - actor not found", () => {
    const mockJob = {
      id: "test-job-123",
      data: {
        actorId: 999999,
        actorName: "Unknown Actor",
        forceRefresh: false,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("returns failure when actor not found in database", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor with ID 999999 not found")
      expect(result.metadata?.isPermanent).toBe(true)
      expect(cache.invalidateActorCache).not.toHaveBeenCalled()
    })
  })

  describe("process - actor not deceased", () => {
    const mockJob = {
      id: "test-job-456",
      data: {
        actorId: 12345,
        actorName: "Living Actor",
        forceRefresh: false,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("returns failure when actor is not deceased", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 12345,
            tmdb_id: 500,
            name: "Living Actor",
            birthday: "1980-05-15",
            deathday: null, // Not deceased
            cause_of_death: null,
            cause_of_death_details: null,
            popularity: 50,
            circumstances: null,
            notable_factors: null,
          },
        ],
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor Living Actor (ID: 12345) is not deceased")
      expect(result.metadata?.isPermanent).toBe(true)
      expect(mockOrchestratorInstance.enrichActor).not.toHaveBeenCalled()
    })
  })

  describe("process - already enriched (skipped)", () => {
    const mockJob = {
      id: "test-job-789",
      data: {
        actorId: 2157,
        actorName: "John Wayne",
        forceRefresh: false,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("skips enrichment when actor already has data", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            tmdb_id: 4724,
            name: "John Wayne",
            birthday: "1907-05-26",
            deathday: "1979-06-11",
            cause_of_death: "Stomach cancer",
            cause_of_death_details: null,
            popularity: 25.5,
            circumstances: "John Wayne died of stomach cancer at UCLA Medical Center.",
            notable_factors: ["cancer"],
          },
        ],
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(false)
      expect(result.data?.circumstances).toBe(
        "John Wayne died of stomach cancer at UCLA Medical Center."
      )
      expect(result.metadata?.skipped).toBe(true)
      expect(result.metadata?.reason).toBe("already_enriched")
      expect(mockOrchestratorInstance.enrichActor).not.toHaveBeenCalled()
    })
  })

  describe("process - forceRefresh flag", () => {
    const mockJob = {
      id: "test-job-force",
      data: {
        actorId: 2157,
        actorName: "John Wayne",
        forceRefresh: true,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("re-enriches when forceRefresh is true even with existing data", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          // First call: fetch actor
          rows: [
            {
              id: 2157,
              tmdb_id: 4724,
              name: "John Wayne",
              birthday: "1907-05-26",
              deathday: "1979-06-11",
              cause_of_death: "Stomach cancer",
              cause_of_death_details: null,
              popularity: 25.5,
              circumstances: "Old data",
              notable_factors: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          // Second call: related celebrities lookup
          rows: [],
        })

      mockOrchestratorInstance.enrichActor.mockResolvedValue({
        circumstances: "Updated circumstances with more detail.",
        cleanedDeathInfo: {
          circumstances: "Updated circumstances with more detail.",
          circumstancesConfidence: "high",
        },
        circumstancesSource: { confidence: 0.8, type: "wikipedia" },
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(true)
      expect(mockOrchestratorInstance.enrichActor).toHaveBeenCalled()
      expect(enrichmentDbWriter.writeToProduction).toHaveBeenCalled()
      expect(cache.invalidateActorCache).toHaveBeenCalledWith(2157)
    })
  })

  describe("process - successful enrichment", () => {
    const mockJob = {
      id: "test-job-success",
      data: {
        actorId: 2157,
        actorName: "John Wayne",
        forceRefresh: false,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("successfully enriches actor with circumstances", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          // First call: fetch actor (no existing circumstances)
          rows: [
            {
              id: 2157,
              tmdb_id: 4724,
              name: "John Wayne",
              birthday: "1907-05-26",
              deathday: "1979-06-11",
              cause_of_death: "Stomach cancer",
              cause_of_death_details: null,
              popularity: 25.5,
              circumstances: null,
              notable_factors: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          // Second call: related celebrities lookup
          rows: [],
        })

      const enrichedCircumstances =
        "John Wayne died on June 11, 1979, from stomach cancer at UCLA Medical Center in Los Angeles. He had been battling cancer since 1964 when he was diagnosed with lung cancer and had a lung removed. His death was mourned worldwide as he was one of Hollywood's greatest icons."

      mockOrchestratorInstance.enrichActor.mockResolvedValue({
        circumstances: enrichedCircumstances,
        cleanedDeathInfo: {
          circumstances: enrichedCircumstances,
          circumstancesConfidence: "high",
          locationOfDeath: "UCLA Medical Center, Los Angeles",
          notableFactors: ["cancer", "lung removal"],
          hasSubstantiveContent: true,
        },
        circumstancesSource: {
          confidence: 0.85,
          type: "wikipedia",
          url: "https://en.wikipedia.org/wiki/John_Wayne",
        },
      })

      mockOrchestratorInstance.getStats.mockReturnValue({ totalCostUsd: 0.03 })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        actorId: 2157,
        actorName: "John Wayne",
        enriched: true,
        circumstances: enrichedCircumstances,
        notableFactors: ["cancer", "lung removal"],
        sources: expect.objectContaining({
          circumstances: expect.objectContaining({ type: "wikipedia" }),
        }),
        costUsd: 0.03,
      })

      expect(enrichmentDbWriter.writeToProduction).toHaveBeenCalledWith(
        mockPool,
        expect.objectContaining({
          actorId: 2157,
          hasDetailedDeathInfo: true,
        }),
        expect.objectContaining({
          actorId: 2157,
          circumstances: enrichedCircumstances,
          circumstancesConfidence: "high",
        })
      )

      expect(cache.invalidateActorCache).toHaveBeenCalledWith(2157)
    })

    it("returns success with no enrichment when no data found", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 2157,
            tmdb_id: 4724,
            name: "John Wayne",
            birthday: "1907-05-26",
            deathday: "1979-06-11",
            cause_of_death: null,
            cause_of_death_details: null,
            popularity: 25.5,
            circumstances: null,
            notable_factors: null,
          },
        ],
      })

      mockOrchestratorInstance.enrichActor.mockResolvedValue({
        // No data returned
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(false)
      expect(result.metadata?.noDataFound).toBe(true)
      expect(enrichmentDbWriter.writeToProduction).not.toHaveBeenCalled()
      expect(cache.invalidateActorCache).not.toHaveBeenCalled()
    })
  })

  describe("process - error handling", () => {
    const mockJob = {
      id: "test-job-error",
      data: {
        actorId: 2157,
        actorName: "John Wayne",
        forceRefresh: false,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("throws transient errors for retry", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 2157,
            tmdb_id: 4724,
            name: "John Wayne",
            birthday: "1907-05-26",
            deathday: "1979-06-11",
            cause_of_death: null,
            cause_of_death_details: null,
            popularity: 25.5,
            circumstances: null,
            notable_factors: null,
          },
        ],
      })

      mockOrchestratorInstance.enrichActor.mockRejectedValue(new Error("Network timeout"))

      await expect(handler.process(mockJob)).rejects.toThrow("Network timeout")
    })

    it("throws API errors for retry", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 2157,
            tmdb_id: 4724,
            name: "John Wayne",
            birthday: "1907-05-26",
            deathday: "1979-06-11",
            cause_of_death: null,
            cause_of_death_details: null,
            popularity: 25.5,
            circumstances: null,
            notable_factors: null,
          },
        ],
      })

      mockOrchestratorInstance.enrichActor.mockRejectedValue(
        new Error("Claude API rate limit exceeded")
      )

      await expect(handler.process(mockJob)).rejects.toThrow("Claude API rate limit exceeded")
    })
  })

  describe("date normalization", () => {
    const mockJob = {
      id: "test-job-dates",
      data: {
        actorId: 2157,
        actorName: "John Wayne",
        forceRefresh: false,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("handles Date objects from database", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2157,
              tmdb_id: 4724,
              name: "John Wayne",
              birthday: new Date("1907-05-26"),
              deathday: new Date("1979-06-11"),
              cause_of_death: null,
              cause_of_death_details: null,
              popularity: 25.5,
              circumstances: null,
              notable_factors: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      mockOrchestratorInstance.enrichActor.mockResolvedValue({
        circumstances: "Test circumstances.",
        circumstancesSource: { confidence: 0.7 },
      })

      await handler.process(mockJob)

      expect(mockOrchestratorInstance.enrichActor).toHaveBeenCalledWith(
        expect.objectContaining({
          birthday: "1907-05-26",
          deathday: "1979-06-11",
        })
      )
    })

    it("handles ISO string dates from database", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2157,
              tmdb_id: 4724,
              name: "John Wayne",
              birthday: "1907-05-26T00:00:00.000Z",
              deathday: "1979-06-11T00:00:00.000Z",
              cause_of_death: null,
              cause_of_death_details: null,
              popularity: 25.5,
              circumstances: null,
              notable_factors: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })

      mockOrchestratorInstance.enrichActor.mockResolvedValue({
        circumstances: "Test circumstances.",
        circumstancesSource: { confidence: 0.7 },
      })

      await handler.process(mockJob)

      expect(mockOrchestratorInstance.enrichActor).toHaveBeenCalledWith(
        expect.objectContaining({
          birthday: "1907-05-26",
          deathday: "1979-06-11",
        })
      )
    })
  })

  describe("related celebrities lookup", () => {
    const mockJob = {
      id: "test-job-related",
      data: {
        actorId: 2157,
        actorName: "John Wayne",
        forceRefresh: false,
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("looks up related celebrity IDs from actors table", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 2157,
              tmdb_id: 4724,
              name: "John Wayne",
              birthday: "1907-05-26",
              deathday: "1979-06-11",
              cause_of_death: null,
              cause_of_death_details: null,
              popularity: 25.5,
              circumstances: null,
              notable_factors: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          // Related celebrities lookup
          rows: [{ id: 1234 }, { id: 5678 }],
        })

      mockOrchestratorInstance.enrichActor.mockResolvedValue({
        circumstances: "Test circumstances.",
        cleanedDeathInfo: {
          circumstances: "Test circumstances.",
          relatedCelebrities: [
            { name: "Maureen O'Hara", relationship: "frequent co-star" },
            { name: "Ward Bond", relationship: "close friend" },
          ],
        },
        circumstancesSource: { confidence: 0.7 },
      })

      await handler.process(mockJob)

      expect(mockPool.query).toHaveBeenCalledWith(`SELECT id FROM actors WHERE name = ANY($1)`, [
        ["Maureen O'Hara", "Ward Bond"],
      ])

      expect(enrichmentDbWriter.writeToProduction).toHaveBeenCalledWith(
        mockPool,
        expect.anything(),
        expect.objectContaining({
          relatedCelebrityIds: [1234, 5678],
        })
      )
    })
  })
})
