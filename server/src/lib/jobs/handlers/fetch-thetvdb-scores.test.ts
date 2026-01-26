/**
 * Tests for FetchTheTVDBScoresHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Job } from "bullmq"
import { FetchTheTVDBScoresHandler } from "./fetch-thetvdb-scores.js"
import { JobType, QueueName } from "../types.js"
import * as thetvdb from "../../thetvdb.js"
import * as shows from "../../db/shows.js"
import type { ShowRecord } from "../../db/types.js"

// Mock external dependencies
vi.mock("../../thetvdb.js")
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

describe("FetchTheTVDBScoresHandler", () => {
  let handler: FetchTheTVDBScoresHandler

  beforeEach(() => {
    handler = new FetchTheTVDBScoresHandler()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("handler configuration", () => {
    it("has correct job type", () => {
      expect(handler.jobType).toBe(JobType.FETCH_THETVDB_SCORES)
    })

    it("has correct queue name", () => {
      expect(handler.queueName).toBe(QueueName.RATINGS)
    })

    it("has rate limit configured", () => {
      expect(handler.rateLimit).toEqual({
        max: 1,
        duration: 100,
      })
    })
  })

  describe("process - show scores", () => {
    const mockJob = {
      id: "test-job-123",
      data: {
        entityType: "show" as const,
        entityId: 1396,
        thetvdbId: 81189,
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
      thetvdb_id: 81189,
    }

    const mockSeries = {
      id: 81189,
      name: "Breaking Bad",
      slug: "breaking-bad",
      image: null,
      firstAired: "2008-01-20",
      lastAired: "2013-09-29",
      nextAired: null,
      score: 9.5,
      status: {
        id: 2,
        name: "Ended",
        recordType: "series",
        keepUpdated: false,
      },
      originalCountry: "usa",
      originalLanguage: "eng",
      defaultSeasonType: 1,
      isOrderRandomized: false,
      lastUpdated: "2024-01-01T00:00:00Z",
      averageRuntime: 47,
      episodes: null,
      overview: "A high school chemistry teacher...",
      year: "2008",
    }

    it("successfully fetches and saves scores for a show", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockResolvedValue(mockSeries)
      vi.mocked(shows.getShow).mockResolvedValue(mockShow as ShowRecord)
      vi.mocked(shows.upsertShow).mockResolvedValue()

      const result = await handler.process(mockJob)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({ score: 9.5 })
      expect(thetvdb.getSeriesExtended).toHaveBeenCalledWith(81189)
      expect(shows.getShow).toHaveBeenCalledWith(1396)
      expect(shows.upsertShow).toHaveBeenCalledWith(
        expect.objectContaining({
          tmdb_id: 1396,
          thetvdb_score: 9.5,
          thetvdb_updated_at: expect.any(Date),
        })
      )
    })

    it("handles no series found (returns success=false)", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockResolvedValue(null)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No series found")
      expect(result.metadata).toEqual({
        thetvdbId: 81189,
        entityType: "show",
        entityId: 1396,
      })
      expect(shows.upsertShow).not.toHaveBeenCalled()
    })

    it("handles show not found in database as permanent error", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockResolvedValue(mockSeries)
      vi.mocked(shows.getShow).mockResolvedValue(null)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Show with TMDB ID 1396 not found")
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("handles transient errors by throwing (for retry)", async () => {
      const transientError = new Error("API timeout")
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(transientError)

      await expect(handler.process(mockJob)).rejects.toThrow("API timeout")
    })

    it("handles permanent errors without throwing", async () => {
      const permanentError = new Error("404 Not Found")
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(permanentError)

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.error).toBe("404 Not Found")
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("detects rate limit errors", async () => {
      const rateLimitError = new Error("429 Too Many Requests")
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(rateLimitError)

      await expect(handler.process(mockJob)).rejects.toThrow("429 Too Many Requests")
    })
  })

  describe("error classification", () => {
    const mockJob = {
      id: "test-job-error",
      data: {
        entityType: "show" as const,
        entityId: 1396,
        thetvdbId: 81189,
      },
      attemptsMade: 0,
      opts: {
        priority: 10,
        attempts: 3,
      },
    } as Job

    it("classifies 400 errors as permanent", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("400 Bad Request"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies 401 errors as permanent", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("401 Unauthorized"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies 404 errors as permanent", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("404 Not Found"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies invalid API key errors as permanent", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("invalid api key"))

      const result = await handler.process(mockJob)

      expect(result.success).toBe(false)
      expect(result.metadata?.isPermanent).toBe(true)
    })

    it("classifies 500 errors as transient", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("500 Internal Server Error"))

      await expect(handler.process(mockJob)).rejects.toThrow("500 Internal Server Error")
    })

    it("classifies network errors as transient", async () => {
      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("Network timeout"))

      await expect(handler.process(mockJob)).rejects.toThrow("Network timeout")
    })
  })

  describe("rate limiting", () => {
    it("enforces 100ms delay before API call", async () => {
      const mockJob = {
        id: "test-job-rate-limit",
        data: {
          entityType: "show" as const,
          entityId: 1396,
          thetvdbId: 81189,
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
      }

      const mockSeries = {
        id: 81189,
        name: "Breaking Bad",
        slug: "breaking-bad",
        image: null,
        firstAired: "2008-01-20",
        lastAired: "2013-09-29",
        nextAired: null,
        score: 9.5,
        status: {
          id: 2,
          name: "Ended",
          recordType: "series",
          keepUpdated: false,
        },
        originalCountry: "usa",
        originalLanguage: "eng",
        defaultSeasonType: 1,
        isOrderRandomized: false,
        lastUpdated: "2024-01-01T00:00:00Z",
        averageRuntime: 47,
        episodes: null,
        overview: "A high school chemistry teacher...",
        year: "2008",
      }

      vi.mocked(thetvdb.getSeriesExtended).mockResolvedValue(mockSeries)
      vi.mocked(shows.getShow).mockResolvedValue(mockShow as ShowRecord)
      vi.mocked(shows.upsertShow).mockResolvedValue()

      const startTime = Date.now()
      await handler.process(mockJob)
      const elapsed = Date.now() - startTime

      // Should have delayed at least 100ms
      expect(elapsed).toBeGreaterThanOrEqual(100)
    })
  })

  describe("New Relic integration", () => {
    it("records success metric on successful fetch", async () => {
      const mockJob = {
        id: "test-job-newrelic",
        data: {
          entityType: "show" as const,
          entityId: 1396,
          thetvdbId: 81189,
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
      }

      const mockSeries = {
        id: 81189,
        name: "Breaking Bad",
        slug: "breaking-bad",
        image: null,
        firstAired: "2008-01-20",
        lastAired: "2013-09-29",
        nextAired: null,
        score: 9.5,
        status: {
          id: 2,
          name: "Ended",
          recordType: "series",
          keepUpdated: false,
        },
        originalCountry: "usa",
        originalLanguage: "eng",
        defaultSeasonType: 1,
        isOrderRandomized: false,
        lastUpdated: "2024-01-01T00:00:00Z",
        averageRuntime: 47,
        episodes: null,
        overview: "A high school chemistry teacher...",
        year: "2008",
      }

      vi.mocked(thetvdb.getSeriesExtended).mockResolvedValue(mockSeries)
      vi.mocked(shows.getShow).mockResolvedValue(mockShow as ShowRecord)
      vi.mocked(shows.upsertShow).mockResolvedValue()

      const newrelic = await import("newrelic")

      await handler.process(mockJob)

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/TheTVDB/Success",
        1
      )
    })

    it("records NoSeriesFound metric when series is null", async () => {
      const mockJob = {
        id: "test-job-newrelic-null",
        data: {
          entityType: "show" as const,
          entityId: 1396,
          thetvdbId: 81189,
        },
        attemptsMade: 0,
        opts: {
          priority: 10,
          attempts: 3,
        },
      } as Job

      vi.mocked(thetvdb.getSeriesExtended).mockResolvedValue(null)

      const newrelic = await import("newrelic")

      await handler.process(mockJob)

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/TheTVDB/NoSeriesFound",
        1
      )
    })

    it("records Error metric on failure", async () => {
      const mockJob = {
        id: "test-job-newrelic-error",
        data: {
          entityType: "show" as const,
          entityId: 1396,
          thetvdbId: 81189,
        },
        attemptsMade: 0,
        opts: {
          priority: 10,
          attempts: 3,
        },
      } as Job

      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("API Error"))

      const newrelic = await import("newrelic")

      await expect(handler.process(mockJob)).rejects.toThrow("API Error")

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/TheTVDB/Error",
        1
      )
    })

    it("records RateLimitExceeded metric on 429 errors", async () => {
      const mockJob = {
        id: "test-job-newrelic-rate-limit",
        data: {
          entityType: "show" as const,
          entityId: 1396,
          thetvdbId: 81189,
        },
        attemptsMade: 0,
        opts: {
          priority: 10,
          attempts: 3,
        },
      } as Job

      vi.mocked(thetvdb.getSeriesExtended).mockRejectedValue(new Error("429 Too Many Requests"))

      const newrelic = await import("newrelic")

      await expect(handler.process(mockJob)).rejects.toThrow("429 Too Many Requests")

      expect(newrelic.default.recordMetric).toHaveBeenCalledWith(
        "Custom/JobHandler/TheTVDB/RateLimitExceeded",
        1
      )
    })
  })
})
