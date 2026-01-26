/**
 * Tests for FetchTraktRatingsHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { FetchTraktRatingsHandler } from "./fetch-trakt-ratings.js"
import { JobType, QueueName } from "../types.js"
import * as trakt from "../../trakt.js"
import * as movies from "../../db/movies.js"
import * as shows from "../../db/shows.js"
import type { MovieRecord, ShowRecord } from "../../db/types.js"

// Mock external dependencies
vi.mock("../../trakt.js")
vi.mock("../../db/movies.js")
vi.mock("../../db/shows.js")
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

// Mock New Relic
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

describe("FetchTraktRatingsHandler", () => {
  let handler: FetchTraktRatingsHandler

  beforeEach(() => {
    handler = new FetchTraktRatingsHandler()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.FETCH_TRAKT_RATINGS)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.RATINGS)
    })

    it("has rate limit configured", () => {
      expect(handler.rateLimit).toEqual({
        max: 1,
        duration: 200,
      })
    })
  })

  describe("process - movie stats", () => {
    const mockJob = {
      id: "test-job-123",
      data: {
        entityType: "movie" as const,
        entityId: 550,
        imdbId: "tt0137523",
      },
      attemptsMade: 0,
      opts: {
        priority: 10,
        attempts: 3,
      },
    } as Job

    const mockMovie: Partial<MovieRecord> = {
      tmdb_id: 550,
      title: "Fight Club",
      release_year: 1999,
      imdb_id: "tt0137523",
    }

    const mockStats = {
      watchers: 50000,
      plays: 120000,
      collectors: 30000,
      votes: 25000,
      comments: 500,
      lists: 800,
      rating: 8.5,
    }

    it("successfully fetches and saves stats for a movie", async () => {
      vi.mocked(trakt.getTraktStats).mockResolvedValue(mockStats)
      vi.mocked(movies.getMovie).mockResolvedValue(mockMovie as MovieRecord)
      vi.mocked(movies.upsertMovie).mockResolvedValue()

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockStats)
      expect(trakt.getTraktStats).toHaveBeenCalledWith("movie", "tt0137523")
      expect(movies.getMovie).toHaveBeenCalledWith(550)
      expect(movies.upsertMovie).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdb_id: 550,
          trakt_rating: 8.5,
          trakt_votes: 25000,
          trakt_watchers: 50000,
          trakt_plays: 120000,
          trakt_updated_at: expect.any(Date),
        })
      )
    })

    it("handles no stats found (returns success=false)", async () => {
      vi.mocked(trakt.getTraktStats).mockResolvedValue(null)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No stats found")
      expect(result.metadata).toEqual({
        imdbId: "tt0137523",
        entityType: "movie",
        entityId: 550,
      })
      expect(movies.upsertMovie).not.toHaveBeenCalled()
    })

    it("handles movie not found in database as permanent error", async () => {
      vi.mocked(trakt.getTraktStats).mockResolvedValue(mockStats)
      vi.mocked(movies.getMovie).mockResolvedValue(null)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Movie with TMDB ID 550 not found")
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("handles transient errors by throwing (for retry)", async () => {
      const transientError = new Error("API timeout")
      vi.mocked(trakt.getTraktStats).mockRejectedValue(transientError)

      await expect(handler.process(mockJob)).rejects.toThrow("API timeout")
    })

    it("handles permanent errors without throwing", async () => {
      const permanentError = new Error("404 Not Found")
      vi.mocked(trakt.getTraktStats).mockRejectedValue(permanentError)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("404 Not Found")
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("detects rate limit errors", async () => {
      const rateLimitError = new Error("429 Too Many Requests")
      vi.mocked(trakt.getTraktStats).mockRejectedValue(rateLimitError)

      await expect(handler.process(mockJob)).rejects.toThrow("429 Too Many Requests")
    })
  })

  describe("process - show stats", () => {
    const mockJob = {
      id: "test-job-456",
      data: {
        entityType: "show" as const,
        entityId: 1396,
        imdbId: "tt0903747",
      },
      attemptsMade: 0,
      opts: {
        priority: 10,
        attempts: 3,
      },
    } as Job

    const mockShow: Partial<ShowRecord> = {
      tmdb_id: 1396,
      name: "Breaking Bad",
      first_air_date: "2008-01-20",
      imdb_id: "tt0903747",
    }

    const mockStats = {
      watchers: 80000,
      plays: 200000,
      collectors: 50000,
      votes: 40000,
      comments: 1000,
      lists: 1200,
      rating: 9.3,
    }

    it("successfully fetches and saves stats for a show", async () => {
      vi.mocked(trakt.getTraktStats).mockResolvedValue(mockStats)
      vi.mocked(shows.getShow).mockResolvedValue(mockShow as ShowRecord)
      vi.mocked(shows.upsertShow).mockResolvedValue()

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockStats)
      expect(trakt.getTraktStats).toHaveBeenCalledWith("show", "tt0903747")
      expect(shows.getShow).toHaveBeenCalledWith(1396)
      expect(shows.upsertShow).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdb_id: 1396,
          trakt_rating: 9.3,
          trakt_votes: 40000,
          trakt_watchers: 80000,
          trakt_plays: 200000,
          trakt_updated_at: expect.any(Date),
        })
      )
    })

    it("handles show not found in database as permanent error", async () => {
      vi.mocked(trakt.getTraktStats).mockResolvedValue(mockStats)
      vi.mocked(shows.getShow).mockResolvedValue(null)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Show with TMDB ID 1396 not found")
      expect(result.metadata?.isPermanent).toBe(true)
    })
  })

  describe("error classification", () => {
    const mockJob = {
      id: "test-job-error",
      data: {
        entityType: "movie" as const,
        entityId: 550,
        imdbId: "tt0137523",
      },
      attemptsMade: 0,
      opts: {
        priority: 10,
        attempts: 3,
      },
    } as Job

    it("classifies 400 errors as permanent", async () => {
      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("400 Bad Request"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies 401 errors as permanent", async () => {
      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("401 Unauthorized"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies 404 errors as permanent", async () => {
      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("404 Not Found"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies invalid API key errors as permanent", async () => {
      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("invalid api key"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies 500 errors as transient", async () => {
      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("500 Internal Server Error"))

      await expect(handler.process(mockJob)).rejects.toThrow("500 Internal Server Error")
    })

    it("classifies network errors as transient", async () => {
      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("Network timeout"))

      await expect(handler.process(mockJob)).rejects.toThrow("Network timeout")
    })
  })

  describe("rate limiting", () => {
    it("has correct rate limit configuration for BullMQ", () => {
      // Rate limiting is handled by BullMQ using the rateLimit config
      // (see handler.ts:44-47). BullMQ enforces the delay between jobs,
      // not within the handler's process() method.
      expect(handler.rateLimit).toBeDefined()
      expect(handler.rateLimit?.max).toBe(1)
      expect(handler.rateLimit?.duration).toBe(200)
    })
  })

  describe("New Relic integration", () => {
    it("records success metric on successful fetch", async () => {
      const mockJob = {
        id: "test-job-newrelic",
        data: {
          entityType: "movie" as const,
          entityId: 550,
          imdbId: "tt0137523",
        },
        attemptsMade: 0,
        opts: {
          priority: 10,
          attempts: 3,
        },
      } as Job

      const mockMovie: Partial<MovieRecord> = {
        tmdb_id: 550,
        title: "Fight Club",
      }

      const mockStats = {
        watchers: 50000,
        plays: 120000,
        collectors: 30000,
        votes: 25000,
        comments: 500,
        lists: 800,
        rating: 8.5,
      }

      vi.mocked(trakt.getTraktStats).mockResolvedValue(mockStats)
      vi.mocked(movies.getMovie).mockResolvedValue(mockMovie as MovieRecord)
      vi.mocked(movies.upsertMovie).mockResolvedValue()

      const newrelic = await import("newrelic")

      await handler.process(mockJob)

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/Trakt/Success",
        1
      )
    })

    it("records NoStatsFound metric when stats are null", async () => {
      const mockJob = {
        id: "test-job-newrelic-null",
        data: {
          entityType: "movie" as const,
          entityId: 550,
          imdbId: "tt0137523",
        },
        attemptsMade: 0,
        opts: {
          priority: 10,
          attempts: 3,
        },
      } as Job

      vi.mocked(trakt.getTraktStats).mockResolvedValue(null)

      const newrelic = await import("newrelic")

      await handler.process(mockJob)

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/Trakt/NoStatsFound",
        1
      )
    })

    it("records Error metric on failure", async () => {
      const mockJob = {
        id: "test-job-newrelic-error",
        data: {
          entityType: "movie" as const,
          entityId: 550,
          imdbId: "tt0137523",
        },
        attemptsMade: 0,
        opts: {
          priority: 10,
          attempts: 3,
        },
      } as Job

      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("API Error"))

      const newrelic = await import("newrelic")

      await expect(handler.process(mockJob)).rejects.toThrow("API Error")

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith("Custom/JobHandler/Trakt/Error", 1)
    })

    it("records RateLimitExceeded metric on 429 errors", async () => {
      const mockJob = {
        id: "test-job-newrelic-rate-limit",
        data: {
          entityType: "movie" as const,
          entityId: 550,
          imdbId: "tt0137523",
        },
        attemptsMade: 0,
        opts: {
          priority: 10,
          attempts: 3,
        },
      } as Job

      vi.mocked(trakt.getTraktStats).mockRejectedValue(new Error("429 Too Many Requests"))

      const newrelic = await import("newrelic")

      await expect(handler.process(mockJob)).rejects.toThrow("429 Too Many Requests")

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/Trakt/RateLimitExceeded",
        1
      )
    })
  })
})
