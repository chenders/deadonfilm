/**
 * Tests for EnrichCauseOfDeathHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { EnrichCauseOfDeathHandler } from "./enrich-cause-of-death.js"
import { JobType, QueueName } from "../types.js"
import * as db from "../../db.js"
import * as cache from "../../cache.js"
import * as wikidata from "../../wikidata.js"
import * as actorsDb from "../../db/actors.js"

// Mock external dependencies
vi.mock("../../db.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../../cache.js", () => ({
  invalidateActorCache: vi.fn(),
}))

vi.mock("../../wikidata.js", () => ({
  getCauseOfDeath: vi.fn(),
}))

vi.mock("../../db/actors.js", () => ({
  updateDeathInfoByActorId: vi.fn(),
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

describe("EnrichCauseOfDeathHandler", () => {
  let handler: EnrichCauseOfDeathHandler
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handler = new EnrichCauseOfDeathHandler()
    vi.clearAllMocks()

    // Setup mock pool
    mockPool = {
      query: vi.fn(),
    }
    vi.mocked(db.getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof db.getPool>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.ENRICH_CAUSE_OF_DEATH)
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
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("returns failure when actor is not deceased", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 12345,
            name: "Living Actor",
            birthday: "1980-01-01",
            deathday: null,
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor Living Actor (ID: 12345) is not deceased")
      expect(result.metadata?.isPermanent).toBe(true)
      expect(wikidata.getCauseOfDeath).not.toHaveBeenCalled()
    })
  })

  describe("process - actor already has cause of death", () => {
    const mockJob = {
      id: "test-job-789",
      data: {
        actorId: 2157,
        actorName: "John Wayne",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("skips enrichment when actor already has cause of death", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 2157,
            name: "John Wayne",
            birthday: "1907-05-26",
            deathday: "1979-06-11",
            cause_of_death: "Stomach cancer",
            cause_of_death_source: "claude",
            cause_of_death_details: "Died from stomach cancer complications",
          },
        ],
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(false)
      expect(result.data?.causeOfDeath).toBe("Stomach cancer")
      expect(result.metadata?.skipped).toBe(true)
      expect(result.metadata?.reason).toBe("already_has_cause_of_death")
      expect(wikidata.getCauseOfDeath).not.toHaveBeenCalled()
      expect(actorsDb.updateDeathInfoByActorId).not.toHaveBeenCalled()
    })
  })

  describe("process - successful enrichment", () => {
    const mockJob = {
      id: "test-job-enrichment",
      data: {
        actorId: 3084,
        actorName: "Marlon Brando",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("successfully enriches actor with cause of death", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 3084,
            name: "Marlon Brando",
            birthday: "1924-04-03",
            deathday: "2004-07-01",
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Respiratory failure",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: "Died of respiratory failure from pulmonary fibrosis",
        causeOfDeathDetailsSource: "wikipedia",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Marlon_Brando",
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(true)
      expect(result.data?.causeOfDeath).toBe("Respiratory failure")
      expect(result.data?.causeOfDeathSource).toBe("claude")
      expect(result.data?.causeOfDeathDetails).toBe(
        "Died of respiratory failure from pulmonary fibrosis"
      )
      expect(result.data?.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Marlon_Brando")

      expect(wikidata.getCauseOfDeath).toHaveBeenCalledWith(
        "Marlon Brando",
        "1924-04-03",
        "2004-07-01",
        "sonnet"
      )

      expect(actorsDb.updateDeathInfoByActorId).toHaveBeenCalledWith(
        3084,
        "Respiratory failure",
        "claude",
        "Died of respiratory failure from pulmonary fibrosis",
        "wikipedia",
        "https://en.wikipedia.org/wiki/Marlon_Brando"
      )

      expect(cache.invalidateActorCache).toHaveBeenCalledWith(3084)
    })

    it("uses deathDate from payload if provided", async () => {
      const jobWithDeathDate = {
        ...mockJob,
        data: {
          actorId: 3084,
          actorName: "Marlon Brando",
          deathDate: "2004-07-01",
        },
      } as Job

      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 3084,
            name: "Marlon Brando",
            birthday: "1924-04-03",
            deathday: null, // No deathday in DB
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Respiratory failure",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: null,
        causeOfDeathDetailsSource: null,
        wikipediaUrl: null,
      })

      const result = await handler.process(jobWithDeathDate)

      expect(result.success).toBe(true)
      expect(wikidata.getCauseOfDeath).toHaveBeenCalledWith(
        "Marlon Brando",
        "1924-04-03",
        "2004-07-01",
        "sonnet"
      )
    })
  })

  describe("process - no cause of death found", () => {
    const mockJob = {
      id: "test-job-no-data",
      data: {
        actorId: 5555,
        actorName: "Obscure Actor",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("returns success with enriched=false when no data found", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 5555,
            name: "Obscure Actor",
            birthday: "1920-01-01",
            deathday: "1980-01-01",
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: null,
        causeOfDeathSource: null,
        causeOfDeathDetails: null,
        causeOfDeathDetailsSource: null,
        wikipediaUrl: null,
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.enriched).toBe(false)
      expect(result.metadata?.noDataFound).toBe(true)
      expect(actorsDb.updateDeathInfoByActorId).not.toHaveBeenCalled()
      expect(cache.invalidateActorCache).not.toHaveBeenCalled()
    })
  })

  describe("process - API error", () => {
    const mockJob = {
      id: "test-job-error",
      data: {
        actorId: 6666,
        actorName: "Error Actor",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("throws error for retry on API failure", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 6666,
            name: "Error Actor",
            birthday: "1930-01-01",
            deathday: "1990-01-01",
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      const apiError = new Error("API rate limit exceeded")
      vi.mocked(wikidata.getCauseOfDeath).mockRejectedValue(apiError)

      await expect(handler.process(mockJob)).rejects.toThrow("API rate limit exceeded")
      expect(actorsDb.updateDeathInfoByActorId).not.toHaveBeenCalled()
      expect(cache.invalidateActorCache).not.toHaveBeenCalled()
    })
  })

  describe("date normalization", () => {
    const mockJob = {
      id: "test-job-dates",
      data: {
        actorId: 7777,
        actorName: "Date Test Actor",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
    } as Job

    it("handles Date objects from database", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 7777,
            name: "Date Test Actor",
            birthday: new Date("1940-06-15T00:00:00Z"),
            deathday: new Date("2000-12-25T00:00:00Z"),
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Heart attack",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: null,
        causeOfDeathDetailsSource: null,
        wikipediaUrl: null,
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(wikidata.getCauseOfDeath).toHaveBeenCalledWith(
        "Date Test Actor",
        "1940-06-15",
        "2000-12-25",
        "sonnet"
      )
    })

    it("handles ISO string dates from database", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 7777,
            name: "Date Test Actor",
            birthday: "1940-06-15T00:00:00.000Z",
            deathday: "2000-12-25T00:00:00.000Z",
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Heart attack",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: null,
        causeOfDeathDetailsSource: null,
        wikipediaUrl: null,
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(wikidata.getCauseOfDeath).toHaveBeenCalledWith(
        "Date Test Actor",
        "1940-06-15",
        "2000-12-25",
        "sonnet"
      )
    })

    it("handles null birthday", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 7777,
            name: "Date Test Actor",
            birthday: null,
            deathday: "2000-12-25",
            cause_of_death: null,
            cause_of_death_source: null,
            cause_of_death_details: null,
          },
        ],
      })

      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Heart attack",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: null,
        causeOfDeathDetailsSource: null,
        wikipediaUrl: null,
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(wikidata.getCauseOfDeath).toHaveBeenCalledWith(
        "Date Test Actor",
        null,
        "2000-12-25",
        "sonnet"
      )
    })
  })
})
