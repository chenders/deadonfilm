/**
 * Tests for SyncTMDBMoviesHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { SyncTMDBMoviesHandler } from "./sync-tmdb-movies.js"
import { JobType, QueueName } from "../types.js"
import * as db from "../../db.js"
import * as tmdb from "../../tmdb.js"
import * as mortalityStats from "../../mortality-stats.js"
import * as dateUtils from "../../date-utils.js"
import * as cache from "../../cache.js"
import * as redis from "../../redis.js"

// Mock external dependencies
vi.mock("../../db.js", () => ({
  getPool: vi.fn(),
  getAllMovieTmdbIds: vi.fn(),
  upsertMovie: vi.fn(),
}))

vi.mock("../../tmdb.js", () => ({
  getAllChangedMovieIds: vi.fn(),
  batchGetPersonDetails: vi.fn(),
  getMovieDetails: vi.fn(),
  getMovieCredits: vi.fn(),
}))

vi.mock("../../mortality-stats.js", () => ({
  calculateMovieMortality: vi.fn(),
}))

vi.mock("../../date-utils.js", () => ({
  getDateRanges: vi.fn(),
}))

vi.mock("../../cache.js", () => ({
  invalidateMovieCaches: vi.fn(),
}))

vi.mock("../../redis.js", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn(),
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

describe("SyncTMDBMoviesHandler", () => {
  let handler: SyncTMDBMoviesHandler
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handler = new SyncTMDBMoviesHandler()
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
      expect(handler.jobType).toBe(JobType.SYNC_TMDB_MOVIES)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.MAINTENANCE)
    })
  })

  describe("process - no relevant changes", () => {
    const mockJob = {
      id: "movies-job-123",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("returns success when no relevant movie changes found", async () => {
      // Mock: movies in our DB
      vi.mocked(db.getAllMovieTmdbIds).mockResolvedValue(new Set([100, 200, 300]))

      // Mock: TMDB returns changes for movies not in our DB
      vi.mocked(tmdb.getAllChangedMovieIds).mockResolvedValue([400, 500, 600])

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(0)
      expect(result.data?.updated).toBe(0)
      expect(result.data?.skipped).toBe(0)
    })
  })

  describe("process - updates movie", () => {
    const mockJob = {
      id: "movies-job-456",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("updates movie mortality stats when changes detected", async () => {
      const movieTmdbId = 12345

      // Mock: movie is in our DB
      vi.mocked(db.getAllMovieTmdbIds).mockResolvedValue(new Set([movieTmdbId]))

      // Mock: TMDB returns movie as changed
      vi.mocked(tmdb.getAllChangedMovieIds).mockResolvedValue([movieTmdbId])

      // Mock: existing movie in DB (with old data)
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ tmdb_id: movieTmdbId, title: "Test Movie" }],
        }) // movie titles lookup
        .mockResolvedValueOnce({
          rows: [
            {
              tmdb_id: movieTmdbId,
              title: "Test Movie",
              release_date: "2020-01-01",
              release_year: 2020,
              deceased_count: 1, // old value
              expected_deaths: 0.5,
            },
          ],
        }) // existing movie lookup

      // Mock: TMDB movie details
      vi.mocked(tmdb.getMovieDetails).mockResolvedValue({
        id: movieTmdbId,
        title: "Test Movie",
        release_date: "2020-01-01",
        poster_path: "/poster.jpg",
        genres: [{ id: 1, name: "Drama" }],
        original_language: "en",
        production_countries: [{ iso_3166_1: "US", name: "United States" }],
        popularity: 50.5,
        vote_average: 7.5,
      } as ReturnType<typeof tmdb.getMovieDetails> extends Promise<infer T> ? T : never)

      vi.mocked(tmdb.getMovieCredits).mockResolvedValue({
        cast: [
          { id: 111, name: "Actor One", order: 0 },
          { id: 222, name: "Actor Two", order: 1 },
        ],
      } as ReturnType<typeof tmdb.getMovieCredits> extends Promise<infer T> ? T : never)

      vi.mocked(tmdb.batchGetPersonDetails).mockResolvedValue(
        new Map([
          [111, { id: 111, name: "Actor One", birthday: "1960-01-01", deathday: "2025-06-15" }],
          [222, { id: 222, name: "Actor Two", birthday: "1970-05-05", deathday: null }],
        ]) as unknown as Map<number, tmdb.TMDBPerson>
      )

      vi.mocked(mortalityStats.calculateMovieMortality).mockResolvedValue({
        actualDeaths: 2, // changed from 1
        expectedDeaths: 0.8,
        mortalitySurpriseScore: 1.5,
        actorResults: [],
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.updated).toBe(1)
      expect(result.data?.skipped).toBe(0)

      // Verify upsertMovie was called
      expect(db.upsertMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdb_id: movieTmdbId,
          deceased_count: 2,
        })
      )

      // Verify cache invalidation
      expect(cache.invalidateMovieCaches).toHaveBeenCalled()
    })
  })

  describe("process - skips unchanged movie", () => {
    const mockJob = {
      id: "movies-job-789",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("skips movie when no changes detected", async () => {
      const movieTmdbId = 12345

      vi.mocked(db.getAllMovieTmdbIds).mockResolvedValue(new Set([movieTmdbId]))
      vi.mocked(tmdb.getAllChangedMovieIds).mockResolvedValue([movieTmdbId])

      // Mock: existing movie with same values as what TMDB will return
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ tmdb_id: movieTmdbId, title: "Unchanged Movie" }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              tmdb_id: movieTmdbId,
              title: "Unchanged Movie",
              release_date: "2020-01-01",
              release_year: 2020,
              poster_path: "/poster.jpg",
              genres: ["Drama"],
              original_language: "en",
              production_countries: ["US"],
              popularity: 50.5,
              vote_average: 7.5,
              cast_count: 2,
              deceased_count: 1,
              living_count: 1,
              expected_deaths: 0.5,
              mortality_surprise_score: 1.0,
            },
          ],
        })

      vi.mocked(tmdb.getMovieDetails).mockResolvedValue({
        id: movieTmdbId,
        title: "Unchanged Movie",
        release_date: "2020-01-01",
        poster_path: "/poster.jpg",
        genres: [{ id: 1, name: "Drama" }],
        original_language: "en",
        production_countries: [{ iso_3166_1: "US", name: "United States" }],
        popularity: 50.5,
        vote_average: 7.5,
      } as ReturnType<typeof tmdb.getMovieDetails> extends Promise<infer T> ? T : never)

      vi.mocked(tmdb.getMovieCredits).mockResolvedValue({
        cast: [
          { id: 111, name: "Actor One", order: 0 },
          { id: 222, name: "Actor Two", order: 1 },
        ],
      } as ReturnType<typeof tmdb.getMovieCredits> extends Promise<infer T> ? T : never)

      vi.mocked(tmdb.batchGetPersonDetails).mockResolvedValue(
        new Map([
          [111, { id: 111, name: "Actor One", birthday: "1960-01-01", deathday: "2025-06-15" }],
          [222, { id: 222, name: "Actor Two", birthday: "1970-05-05", deathday: null }],
        ]) as unknown as Map<number, tmdb.TMDBPerson>
      )

      vi.mocked(mortalityStats.calculateMovieMortality).mockResolvedValue({
        actualDeaths: 1,
        expectedDeaths: 0.5,
        mortalitySurpriseScore: 1.0,
        actorResults: [],
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.updated).toBe(0)
      expect(result.data?.skipped).toBe(1)

      // Should NOT invalidate cache when nothing updated
      expect(cache.invalidateMovieCaches).not.toHaveBeenCalled()
    })
  })

  describe("process - error handling", () => {
    const mockJob = {
      id: "movies-job-error",
      data: {
        startDate: "2026-01-20",
        endDate: "2026-01-25",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("continues processing after individual movie error", async () => {
      const movie1 = 111
      const movie2 = 222

      vi.mocked(db.getAllMovieTmdbIds).mockResolvedValue(new Set([movie1, movie2]))
      vi.mocked(tmdb.getAllChangedMovieIds).mockResolvedValue([movie1, movie2])

      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { tmdb_id: movie1, title: "Failing Movie" },
            { tmdb_id: movie2, title: "Success Movie" },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // movie1 existing lookup fails (empty)
        .mockResolvedValueOnce({
          rows: [
            {
              tmdb_id: movie2,
              title: "Success Movie",
              release_year: 2020,
              deceased_count: 0,
            },
          ],
        })

      // First movie fails
      vi.mocked(tmdb.getMovieDetails)
        .mockRejectedValueOnce(new Error("TMDB API error"))
        .mockResolvedValueOnce({
          id: movie2,
          title: "Success Movie",
          release_date: "2020-01-01",
          poster_path: "/poster.jpg",
          genres: [{ id: 1, name: "Drama" }],
          original_language: "en",
          production_countries: [{ iso_3166_1: "US", name: "United States" }],
          popularity: 30.0,
          vote_average: 6.5,
        } as ReturnType<typeof tmdb.getMovieDetails> extends Promise<infer T> ? T : never)

      vi.mocked(tmdb.getMovieCredits).mockResolvedValue({
        cast: [{ id: 333, name: "Actor", order: 0 }],
      } as ReturnType<typeof tmdb.getMovieCredits> extends Promise<infer T> ? T : never)

      vi.mocked(tmdb.batchGetPersonDetails).mockResolvedValue(
        new Map([
          [333, { id: 333, name: "Actor", birthday: "1980-01-01", deathday: "2025-12-01" }],
        ]) as unknown as Map<number, tmdb.TMDBPerson>
      )

      vi.mocked(mortalityStats.calculateMovieMortality).mockResolvedValue({
        actualDeaths: 1,
        expectedDeaths: 0.3,
        mortalitySurpriseScore: 2.3,
        actorResults: [],
      })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(2)
      expect(result.data?.updated).toBe(1) // Only second movie succeeded
      expect(result.data?.errors).toHaveLength(1)
      expect(result.data?.errors[0]).toContain("Error updating movie 111")
    })
  })

  describe("process - multiple date ranges", () => {
    const mockJob = {
      id: "movies-job-ranges",
      data: {
        startDate: "2026-01-01",
        endDate: "2026-01-30",
      },
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("queries multiple date ranges and deduplicates results", async () => {
      vi.mocked(dateUtils.getDateRanges).mockReturnValue([
        { start: "2026-01-01", end: "2026-01-14" },
        { start: "2026-01-15", end: "2026-01-30" },
      ])

      vi.mocked(db.getAllMovieTmdbIds).mockResolvedValue(new Set([100, 200]))

      // TMDB returns some duplicate IDs across ranges
      vi.mocked(tmdb.getAllChangedMovieIds)
        .mockResolvedValueOnce([100, 300])
        .mockResolvedValueOnce([100, 200, 400]) // 100 is duplicate

      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await handler.process(mockJob)

      // Should have called TMDB twice
      expect(tmdb.getAllChangedMovieIds).toHaveBeenCalledTimes(2)

      // Should have deduplicated: only 100, 200 are in our DB
      expect(result.data?.checked).toBe(2)
    })
  })
})
