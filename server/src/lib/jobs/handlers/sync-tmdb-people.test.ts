/**
 * Tests for SyncTMDBPeopleHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { SyncTMDBPeopleHandler } from "./sync-tmdb-people.js"
import { JobType, QueueName } from "../types.js"
import * as db from "../../db.js"
import * as tmdb from "../../tmdb.js"
import type { TMDBPerson } from "../../tmdb.js"
import * as wikidata from "../../wikidata.js"
import * as mortalityStats from "../../mortality-stats.js"
import * as dateUtils from "../../date-utils.js"
import * as cache from "../../cache.js"

// Mock external dependencies
vi.mock("../../db.js", () => ({
  getPool: vi.fn(),
  getAllActorTmdbIds: vi.fn(),
  getDeceasedTmdbIds: vi.fn(),
  upsertActor: vi.fn(),
  upsertMovie: vi.fn(),
}))

vi.mock("../../tmdb.js", () => ({
  getAllChangedPersonIds: vi.fn(),
  batchGetPersonDetails: vi.fn(),
  getMovieDetails: vi.fn(),
  getMovieCredits: vi.fn(),
}))

vi.mock("../../wikidata.js", () => ({
  getCauseOfDeath: vi.fn(),
  verifyDeathDate: vi.fn(),
}))

vi.mock("../../mortality-stats.js", () => ({
  calculateYearsLost: vi.fn(),
  calculateMovieMortality: vi.fn(),
}))

vi.mock("../../date-utils.js", () => ({
  getDateRanges: vi.fn(),
}))

vi.mock("../../cache.js", () => ({
  invalidateDeathCaches: vi.fn(),
  invalidateActorCacheRequired: vi.fn(),
}))

vi.mock("../../redis.js", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn(),
}))

vi.mock("../../imdb.js", () => ({
  verifyDeathDateImdb: vi.fn().mockResolvedValue({
    found: false,
    hasDeathYear: false,
    imdbDeathYear: null,
    yearMatches: false,
  }),
  combineVerification: vi.fn((wikidata: { confidence: string }, _imdb: unknown) => ({
    confidence: wikidata.confidence,
    source: wikidata.confidence === "verified" ? "wikidata" : null,
  })),
}))

vi.mock("../queue-manager.js", () => ({
  queueManager: {
    addJob: vi.fn().mockResolvedValue("mock-job-id"),
  },
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
    recordCustomEvent: vi.fn(),
    noticeError: vi.fn(),
  },
}))

describe("SyncTMDBPeopleHandler", () => {
  let handler: SyncTMDBPeopleHandler
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handler = new SyncTMDBPeopleHandler()
    vi.clearAllMocks()

    // Setup mock pool
    mockPool = {
      query: vi.fn(),
    }
    vi.mocked(db.getPool).mockReturnValue(mockPool as unknown as ReturnType<typeof db.getPool>)

    // Default mock setup
    vi.mocked(dateUtils.getDateRanges).mockReturnValue([{ start: "2026-01-20", end: "2026-01-25" }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.SYNC_TMDB_PEOPLE)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.MAINTENANCE)
    })
  })

  describe("process - no relevant changes", () => {
    const mockJob = {
      id: "people-job-123",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("returns success when no relevant people changes found", async () => {
      // Mock: actors in our DB
      vi.mocked(db.getAllActorTmdbIds).mockResolvedValue(new Set([100, 200, 300]))
      vi.mocked(db.getDeceasedTmdbIds).mockResolvedValue(new Set([100]))

      // Mock: TMDB returns changes for people not in our DB
      vi.mocked(tmdb.getAllChangedPersonIds).mockResolvedValue([400, 500, 600])

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(0)
      expect(result.data?.newDeathsFound).toBe(0)
      expect(result.data?.newlyDeceasedActors).toEqual([])
    })
  })

  describe("process - detects new death", () => {
    const mockJob = {
      id: "people-job-456",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("detects and processes newly deceased actor", async () => {
      const actorTmdbId = 12345
      const actorInternalId = 9999

      // Mock: actors in our DB (actorTmdbId is in DB, not in deceased set)
      vi.mocked(db.getAllActorTmdbIds).mockResolvedValue(new Set([actorTmdbId]))
      vi.mocked(db.getDeceasedTmdbIds).mockResolvedValue(new Set())

      // Mock: TMDB returns the actor as changed
      vi.mocked(tmdb.getAllChangedPersonIds).mockResolvedValue([actorTmdbId])

      // Mock: TMDB person details shows death date
      vi.mocked(tmdb.batchGetPersonDetails).mockResolvedValue(
        new Map([
          [
            actorTmdbId,
            {
              id: actorTmdbId,
              name: "John Actor",
              birthday: "1950-06-15",
              deathday: "2026-01-22",
              profile_path: "/profile.jpg",
            },
          ],
        ]) as unknown as Map<number, TMDBPerson>
      )

      // Mock: Wikidata verification
      vi.mocked(wikidata.verifyDeathDate).mockResolvedValue({
        verified: true,
        confidence: "verified",
        wikidataDeathDate: "2026-01-22",
      })

      // Mock: Claude cause of death lookup
      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Heart attack",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: "Died of cardiac arrest",
        causeOfDeathDetailsSource: "claude",
        wikipediaUrl: "https://en.wikipedia.org/wiki/John_Actor",
      })

      // Mock: Mortality stats calculation
      vi.mocked(mortalityStats.calculateYearsLost).mockResolvedValue({
        ageAtDeath: 75,
        expectedLifespan: 82,
        yearsLost: 7,
      })

      // Mock: DB query for internal actor ID
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: actorInternalId }] }) // actor ID lookup
        .mockResolvedValueOnce({ rows: [{ id: actorInternalId, tmdb_id: actorTmdbId }] }) // actor mapping
        .mockResolvedValueOnce({ rows: [] }) // no affected movies

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.newDeathsFound).toBe(1)
      expect(result.data?.newlyDeceasedActors).toHaveLength(1)
      expect(result.data?.newlyDeceasedActors[0]).toEqual({
        id: actorInternalId,
        tmdbId: actorTmdbId,
        name: "John Actor",
        deathday: "2026-01-22",
      })

      // Verify upsertActor was called with correct data
      expect(db.upsertActor).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdb_id: actorTmdbId,
          name: "John Actor",
          deathday: "2026-01-22",
          cause_of_death: "Heart attack",
        })
      )

      // Verify cache invalidation for actor
      expect(cache.invalidateActorCacheRequired).toHaveBeenCalledWith(actorInternalId)

      // Verify obscurity calculation job was queued (which handles death cache rebuild)
      const { queueManager } = await import("../queue-manager.js")
      expect(queueManager.addJob).toHaveBeenCalledWith(
        JobType.CALCULATE_ACTOR_OBSCURITY,
        expect.objectContaining({
          actorIds: [actorInternalId],
          rebuildCachesOnComplete: true,
        }),
        expect.any(Object)
      )
    })
  })

  describe("process - skips already deceased", () => {
    const mockJob = {
      id: "people-job-789",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("does not process actors already marked as deceased", async () => {
      const actorTmdbId = 12345

      // Mock: actor is already in deceased set
      vi.mocked(db.getAllActorTmdbIds).mockResolvedValue(new Set([actorTmdbId]))
      vi.mocked(db.getDeceasedTmdbIds).mockResolvedValue(new Set([actorTmdbId]))

      // Mock: TMDB returns the actor as changed
      vi.mocked(tmdb.getAllChangedPersonIds).mockResolvedValue([actorTmdbId])

      // Mock: TMDB person details
      vi.mocked(tmdb.batchGetPersonDetails).mockResolvedValue(
        new Map([
          [
            actorTmdbId,
            {
              id: actorTmdbId,
              name: "Already Deceased Actor",
              birthday: "1950-06-15",
              deathday: "2025-12-01", // already deceased
              profile_path: "/profile.jpg",
            },
          ],
        ]) as unknown as Map<number, TMDBPerson>
      )

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.newDeathsFound).toBe(0)
      expect(result.data?.newlyDeceasedActors).toEqual([])

      // Should NOT process as new death
      expect(wikidata.verifyDeathDate).not.toHaveBeenCalled()
      expect(wikidata.getCauseOfDeath).not.toHaveBeenCalled()
      expect(db.upsertActor).not.toHaveBeenCalled()
    })
  })

  describe("process - error handling", () => {
    const mockJob = {
      id: "people-job-error",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("continues processing after individual actor error", async () => {
      const actor1TmdbId = 111
      const actor2TmdbId = 222
      const actor2InternalId = 8888

      vi.mocked(db.getAllActorTmdbIds).mockResolvedValue(new Set([actor1TmdbId, actor2TmdbId]))
      vi.mocked(db.getDeceasedTmdbIds).mockResolvedValue(new Set())

      vi.mocked(tmdb.getAllChangedPersonIds).mockResolvedValue([actor1TmdbId, actor2TmdbId])

      vi.mocked(tmdb.batchGetPersonDetails).mockResolvedValue(
        new Map([
          [
            actor1TmdbId,
            {
              id: actor1TmdbId,
              name: "Actor One (fails)",
              birthday: "1960-01-01",
              deathday: "2026-01-20",
              profile_path: null,
            },
          ],
          [
            actor2TmdbId,
            {
              id: actor2TmdbId,
              name: "Actor Two (succeeds)",
              birthday: "1965-05-05",
              deathday: "2026-01-21",
              profile_path: null,
            },
          ],
        ]) as unknown as Map<number, TMDBPerson>
      )

      // First actor fails
      vi.mocked(wikidata.verifyDeathDate)
        .mockRejectedValueOnce(new Error("Wikidata timeout"))
        .mockResolvedValueOnce({
          verified: true,
          confidence: "verified",
          wikidataDeathDate: "2026-01-21",
        })

      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Natural causes",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: null,
        causeOfDeathDetailsSource: null,
        wikipediaUrl: null,
      })

      vi.mocked(mortalityStats.calculateYearsLost).mockResolvedValue({
        ageAtDeath: 60,
        expectedLifespan: 80,
        yearsLost: 20,
      })

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: actor2InternalId }] })
        .mockResolvedValueOnce({ rows: [{ id: actor2InternalId, tmdb_id: actor2TmdbId }] })
        .mockResolvedValueOnce({ rows: [] })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(2)
      expect(result.data?.newDeathsFound).toBe(1) // Only second actor succeeded
      expect(result.data?.errors).toHaveLength(1)
      expect(result.data?.errors[0]).toContain("Actor One (fails)")
    })
  })

  describe("process - updates affected movies", () => {
    const mockJob = {
      id: "people-job-movies",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("updates mortality stats for movies featuring newly deceased actor", async () => {
      const actorTmdbId = 12345
      const actorInternalId = 9999
      const movieTmdbId = 55555

      vi.mocked(db.getAllActorTmdbIds).mockResolvedValue(new Set([actorTmdbId]))
      vi.mocked(db.getDeceasedTmdbIds).mockResolvedValue(new Set())
      vi.mocked(tmdb.getAllChangedPersonIds).mockResolvedValue([actorTmdbId])

      vi.mocked(tmdb.batchGetPersonDetails).mockResolvedValue(
        new Map([
          [
            actorTmdbId,
            {
              id: actorTmdbId,
              name: "Movie Star",
              birthday: "1950-01-01",
              deathday: "2026-01-20",
              profile_path: null,
            },
          ],
        ]) as unknown as Map<number, TMDBPerson>
      )

      vi.mocked(wikidata.verifyDeathDate).mockResolvedValue({
        verified: true,
        confidence: "verified",
        wikidataDeathDate: "2026-01-20",
      })
      vi.mocked(wikidata.getCauseOfDeath).mockResolvedValue({
        causeOfDeath: "Cancer",
        causeOfDeathSource: "claude",
        causeOfDeathDetails: null,
        causeOfDeathDetailsSource: null,
        wikipediaUrl: null,
      })
      vi.mocked(mortalityStats.calculateYearsLost).mockResolvedValue({
        ageAtDeath: 76,
        expectedLifespan: 80,
        yearsLost: 4,
      })

      // Mock: movie details and credits for mortality recalculation
      vi.mocked(tmdb.getMovieDetails).mockResolvedValue({
        id: movieTmdbId,
        title: "Famous Movie",
        release_date: "2000-06-15",
        poster_path: "/poster.jpg",
        genres: [{ id: 1, name: "Drama" }],
        original_language: "en",
        production_countries: [{ iso_3166_1: "US", name: "United States" }],
        popularity: 50.5,
        vote_average: 7.5,
      } as ReturnType<typeof tmdb.getMovieDetails> extends Promise<infer T> ? T : never)

      vi.mocked(tmdb.getMovieCredits).mockResolvedValue({
        cast: [
          { id: actorTmdbId, name: "Movie Star", order: 0 },
          { id: 99999, name: "Living Actor", order: 1 },
        ],
      } as ReturnType<typeof tmdb.getMovieCredits> extends Promise<infer T> ? T : never)

      vi.mocked(mortalityStats.calculateMovieMortality).mockResolvedValue({
        actualDeaths: 1,
        expectedDeaths: 0.5,
        mortalitySurpriseScore: 1.0,
        actorResults: [],
      })

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: actorInternalId }] }) // actor ID lookup
        .mockResolvedValueOnce({ rows: [{ id: actorInternalId, tmdb_id: actorTmdbId }] }) // actor mapping
        .mockResolvedValueOnce({ rows: [{ movie_tmdb_id: movieTmdbId }] }) // affected movies

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.moviesUpdated).toBe(1)

      // Verify movie was updated
      expect(db.upsertMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdb_id: movieTmdbId,
          deceased_count: 1,
        })
      )
    })
  })
})
