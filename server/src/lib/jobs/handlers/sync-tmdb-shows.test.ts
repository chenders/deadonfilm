/**
 * Tests for SyncTMDBShowsHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { SyncTMDBShowsHandler } from "./sync-tmdb-shows.js"
import { JobType, QueueName } from "../types.js"
import * as db from "../../db.js"
import * as tmdb from "../../tmdb.js"
import type { TMDBTVShowDetails, TMDBSeasonDetails } from "../../tmdb.js"

// Mock external dependencies
vi.mock("../../db.js", () => ({
  getPool: vi.fn(),
  upsertSeason: vi.fn(),
  upsertEpisode: vi.fn(),
}))

vi.mock("../../tmdb.js", () => ({
  getTVShowDetails: vi.fn(),
  getSeasonDetails: vi.fn(),
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

describe("SyncTMDBShowsHandler", () => {
  let handler: SyncTMDBShowsHandler
  let mockPool: { query: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    handler = new SyncTMDBShowsHandler()
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
      expect(handler.jobType).toBe(JobType.SYNC_TMDB_SHOWS)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.MAINTENANCE)
    })
  })

  describe("process - no active shows", () => {
    const mockJob = {
      id: "shows-job-123",
      data: {},
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("returns success when no active shows found", async () => {
      // Mock: no active shows in DB
      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(0)
      expect(result.data?.newEpisodesFound).toBe(0)
    })
  })

  describe("process - finds new episodes", () => {
    const mockJob = {
      id: "shows-job-456",
      data: {},
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("detects and inserts new episodes", async () => {
      const showTmdbId = 12345

      // Mock: active show in DB
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ tmdb_id: showTmdbId, name: "Active Show", number_of_seasons: 2 }],
        }) // active shows query
        .mockResolvedValueOnce({
          rows: [
            { season_number: 1, episode_number: 1 },
            { season_number: 1, episode_number: 2 },
            // Season 2 Episode 1 missing - should be detected as new
          ],
        }) // existing episodes query

      // Mock: TMDB show details
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: showTmdbId,
        name: "Active Show",
        seasons: [
          {
            season_number: 0,
            name: "Specials",
            episode_count: 5,
            air_date: "2020-01-01",
            poster_path: null,
          },
          {
            season_number: 1,
            name: "Season 1",
            episode_count: 2,
            air_date: "2024-01-01",
            poster_path: "/s1.jpg",
          },
          {
            season_number: 2,
            name: "Season 2",
            episode_count: 1,
            air_date: "2026-01-15",
            poster_path: "/s2.jpg",
          },
        ],
      } as ReturnType<typeof tmdb.getTVShowDetails> extends Promise<infer T> ? T : never)

      // Mock: TMDB season details
      vi.mocked(tmdb.getSeasonDetails)
        .mockResolvedValueOnce({
          episodes: [
            {
              season_number: 1,
              episode_number: 1,
              name: "Pilot",
              air_date: "2024-01-01",
              runtime: 45,
              guest_stars: [],
            },
            {
              season_number: 1,
              episode_number: 2,
              name: "Episode 2",
              air_date: "2024-01-08",
              runtime: 45,
              guest_stars: [],
            },
          ],
        } as unknown as TMDBSeasonDetails)
        .mockResolvedValueOnce({
          episodes: [
            {
              season_number: 2,
              episode_number: 1,
              name: "Season Premiere",
              air_date: "2026-01-15",
              runtime: 50,
              guest_stars: [{ id: 1, name: "Guest" }],
            },
          ],
        } as unknown as TMDBSeasonDetails)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.newEpisodesFound).toBe(1)

      // Verify season upsert was called
      expect(db.upsertSeason).toHaveBeenCalledWith(
        expect.objectContaining({
          show_tmdb_id: showTmdbId,
          season_number: 2,
          name: "Season 2",
        })
      )

      // Verify episode upsert was called
      expect(db.upsertEpisode).toHaveBeenCalledWith(
        expect.objectContaining({
          show_tmdb_id: showTmdbId,
          season_number: 2,
          episode_number: 1,
          name: "Season Premiere",
          guest_star_count: 1,
        })
      )
    })
  })

  describe("process - skips specials season", () => {
    const mockJob = {
      id: "shows-job-specials",
      data: {},
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("skips season 0 (specials)", async () => {
      const showTmdbId = 99999

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ tmdb_id: showTmdbId, name: "Show With Specials", number_of_seasons: 1 }],
        })
        .mockResolvedValueOnce({ rows: [] }) // no existing episodes

      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: showTmdbId,
        name: "Show With Specials",
        seasons: [
          {
            season_number: 0,
            name: "Specials",
            episode_count: 10,
            air_date: "2020-01-01",
            poster_path: null,
          },
        ],
      } as unknown as TMDBTVShowDetails)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.newEpisodesFound).toBe(0)

      // Should NOT call getSeasonDetails for season 0
      expect(tmdb.getSeasonDetails).not.toHaveBeenCalled()
    })
  })

  describe("process - no new episodes", () => {
    const mockJob = {
      id: "shows-job-no-new",
      data: {},
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("reports 0 new episodes when all episodes exist", async () => {
      const showTmdbId = 11111

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ tmdb_id: showTmdbId, name: "Caught Up Show", number_of_seasons: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [
            { season_number: 1, episode_number: 1 },
            { season_number: 1, episode_number: 2 },
          ],
        })

      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: showTmdbId,
        name: "Caught Up Show",
        seasons: [
          {
            season_number: 1,
            name: "Season 1",
            episode_count: 2,
            air_date: "2025-01-01",
            poster_path: "/s1.jpg",
          },
        ],
      } as unknown as TMDBTVShowDetails)

      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        episodes: [
          {
            season_number: 1,
            episode_number: 1,
            name: "Episode 1",
            air_date: "2025-01-01",
            runtime: 45,
            guest_stars: [],
          },
          {
            season_number: 1,
            episode_number: 2,
            name: "Episode 2",
            air_date: "2025-01-08",
            runtime: 45,
            guest_stars: [],
          },
        ],
      } as unknown as TMDBSeasonDetails)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.newEpisodesFound).toBe(0)

      // Should NOT upsert anything
      expect(db.upsertSeason).not.toHaveBeenCalled()
      expect(db.upsertEpisode).not.toHaveBeenCalled()
    })
  })

  describe("process - error handling", () => {
    const mockJob = {
      id: "shows-job-error",
      data: {},
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("continues processing after individual show error", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { tmdb_id: 111, name: "Failing Show", number_of_seasons: 1 },
            { tmdb_id: 222, name: "Success Show", number_of_seasons: 1 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // episodes for show 222

      // First show fails
      vi.mocked(tmdb.getTVShowDetails)
        .mockRejectedValueOnce(new Error("TMDB API error"))
        .mockResolvedValueOnce({
          id: 222,
          name: "Success Show",
          seasons: [],
        } as unknown as TMDBTVShowDetails)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1) // Only success show counted
      expect(result.data?.errors).toHaveLength(1)
      expect(result.data?.errors[0]).toContain("Failing Show")
    })

    it("continues processing after individual season error", async () => {
      const showTmdbId = 33333

      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ tmdb_id: showTmdbId, name: "Multi-Season Show", number_of_seasons: 2 }],
        })
        .mockResolvedValueOnce({ rows: [] })

      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: showTmdbId,
        name: "Multi-Season Show",
        seasons: [
          {
            season_number: 1,
            name: "Season 1",
            episode_count: 1,
            air_date: "2025-01-01",
            poster_path: null,
          },
          {
            season_number: 2,
            name: "Season 2",
            episode_count: 1,
            air_date: "2026-01-01",
            poster_path: null,
          },
        ],
      } as unknown as TMDBTVShowDetails)

      // First season fails, second succeeds
      vi.mocked(tmdb.getSeasonDetails)
        .mockRejectedValueOnce(new Error("Season fetch error"))
        .mockResolvedValueOnce({
          episodes: [
            {
              season_number: 2,
              episode_number: 1,
              name: "S2E1",
              air_date: "2026-01-01",
              runtime: 45,
              guest_stars: [],
            },
          ],
        } as unknown as TMDBSeasonDetails)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(1)
      expect(result.data?.newEpisodesFound).toBe(1) // Season 2 episode found
      expect(result.data?.errors).toHaveLength(1)
      expect(result.data?.errors[0]).toContain("season 1")
    })
  })

  describe("process - multiple shows", () => {
    const mockJob = {
      id: "shows-job-multi",
      data: {},
      attemptsMade: 0,
      opts: { priority: 10, attempts: 3 },
      updateProgress: vi.fn(),
    } as unknown as Job

    it("processes multiple active shows", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { tmdb_id: 111, name: "Show A", number_of_seasons: 1 },
            { tmdb_id: 222, name: "Show B", number_of_seasons: 1 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // episodes for show 111
        .mockResolvedValueOnce({ rows: [] }) // episodes for show 222

      vi.mocked(tmdb.getTVShowDetails)
        .mockResolvedValueOnce({
          id: 111,
          name: "Show A",
          seasons: [
            {
              season_number: 1,
              name: "S1",
              episode_count: 1,
              air_date: "2026-01-01",
              poster_path: null,
            },
          ],
        } as unknown as TMDBTVShowDetails)
        .mockResolvedValueOnce({
          id: 222,
          name: "Show B",
          seasons: [
            {
              season_number: 1,
              name: "S1",
              episode_count: 1,
              air_date: "2026-01-01",
              poster_path: null,
            },
          ],
        } as unknown as TMDBTVShowDetails)

      vi.mocked(tmdb.getSeasonDetails)
        .mockResolvedValueOnce({
          episodes: [
            {
              season_number: 1,
              episode_number: 1,
              name: "A Pilot",
              air_date: "2026-01-01",
              runtime: 30,
              guest_stars: [],
            },
          ],
        } as unknown as TMDBSeasonDetails)
        .mockResolvedValueOnce({
          episodes: [
            {
              season_number: 1,
              episode_number: 1,
              name: "B Pilot",
              air_date: "2026-01-01",
              runtime: 30,
              guest_stars: [],
            },
          ],
        } as unknown as TMDBSeasonDetails)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data?.checked).toBe(2)
      expect(result.data?.newEpisodesFound).toBe(2)

      // Both shows should have their episodes upserted
      expect(db.upsertEpisode).toHaveBeenCalledTimes(2)
    })
  })
})
