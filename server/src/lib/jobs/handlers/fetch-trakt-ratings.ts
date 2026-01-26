/**
 * Trakt Ratings Fetch Handler
 *
 * Fetches user ratings, watch counts, and play statistics from Trakt.tv API
 * and saves them to the movies or shows table.
 *
 * Features:
 * - Rate limiting (200ms delay between requests)
 * - New Relic transaction tracking with segments
 * - Custom metrics for success/error/rate limit violations
 * - Distinguishes permanent vs transient errors
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type FetchTraktRatingsPayload } from "../types.js"
import { getTraktStats } from "../../trakt.js"
import { getMovie, upsertMovie } from "../../db/movies.js"
import { getShow, upsertShow } from "../../db/shows.js"

/**
 * Trakt API rate limit: minimum 200ms between requests
 */
const RATE_LIMIT_DELAY_MS = 200

/**
 * HTTP status codes that indicate permanent failures
 * (don't retry these)
 */
const PERMANENT_ERROR_CODES = new Set([400, 401, 403, 404, 422])

/**
 * Handler for fetching Trakt ratings
 */
export class FetchTraktRatingsHandler extends BaseJobHandler<FetchTraktRatingsPayload, unknown> {
  readonly jobType = JobType.FETCH_TRAKT_RATINGS
  readonly queueName = QueueName.RATINGS

  /**
   * Rate limit configuration for Trakt API
   * Enforces minimum 200ms delay between requests
   */
  readonly rateLimit = {
    max: 1,
    duration: RATE_LIMIT_DELAY_MS,
  }

  /**
   * Process the job: fetch ratings from Trakt and save to database
   * Note: Base class already wraps this in a New Relic transaction, so we don't nest another one
   */
  async process(job: Job<FetchTraktRatingsPayload>): Promise<JobResult> {
    const jobLogger = this.createLogger(job)

    // Add custom attributes to New Relic transaction (managed by base class)
    newrelic.addCustomAttribute("entityType", job.data.entityType)
    newrelic.addCustomAttribute("entityId", job.data.entityId)
    newrelic.addCustomAttribute("imdbId", job.data.imdbId)

    jobLogger.info(
      {
        entityType: job.data.entityType,
        entityId: job.data.entityId,
        imdbId: job.data.imdbId,
      },
      "Fetching Trakt ratings"
    )

    try {
      // Note: Rate limiting is handled by BullMQ (rateLimit config), no need to delay here

      // Fetch ratings from Trakt API (with New Relic segment)
      const stats = await newrelic.startSegment("Trakt API Call", true, async () => {
        return await getTraktStats(job.data.entityType, job.data.imdbId)
      })

      // Check if stats were found
      if (!stats) {
        jobLogger.warn({ imdbId: job.data.imdbId }, "No stats found for IMDb ID")

        newrelic.recordMetric("Custom/JobHandler/Trakt/NoStatsFound", 1)

        // This is a permanent failure - ID doesn't exist or has no stats
        return {
          success: false,
          error: "No stats found",
          metadata: {
            imdbId: job.data.imdbId,
            entityType: job.data.entityType,
            entityId: job.data.entityId,
          },
        }
      }

      // Update database with stats (with New Relic segment)
      await newrelic.startSegment("Database Update", true, async () => {
        return await this.saveStatsToDatabase(job.data, stats)
      })

      jobLogger.info(
        {
          entityType: job.data.entityType,
          entityId: job.data.entityId,
          stats,
        },
        "Successfully saved Trakt stats"
      )

      // Record success metric
      newrelic.recordMetric("Custom/JobHandler/Trakt/Success", 1)

      return {
        success: true,
        data: stats,
        metadata: {
          imdbId: job.data.imdbId,
          entityType: job.data.entityType,
          entityId: job.data.entityId,
        },
      }
    } catch (error) {
      // Record error metric
      newrelic.recordMetric("Custom/JobHandler/Trakt/Error", 1)

      // Check if error is from rate limiting
      const errorMessage = (error as Error).message || String(error)
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate limit")) {
        newrelic.recordMetric("Custom/JobHandler/Trakt/RateLimitExceeded", 1)
        jobLogger.error({ error: errorMessage }, "Trakt API rate limit exceeded")
      }

      // Check if this is a permanent error
      const isPermanent = this.isPermanentError(error)
      if (isPermanent) {
        jobLogger.error(
          { error: errorMessage, isPermanent: true },
          "Permanent error - will not retry"
        )

        return {
          success: false,
          error: errorMessage,
          metadata: {
            isPermanent: true,
            imdbId: job.data.imdbId,
            entityType: job.data.entityType,
            entityId: job.data.entityId,
          },
        }
      }

      // Transient error - let BullMQ retry
      jobLogger.warn(
        {
          error: errorMessage,
          attemptNumber: job.attemptsMade + 1,
          maxAttempts: job.opts.attempts ?? 3,
        },
        "Transient error - will retry"
      )

      throw error
    }
  }

  /**
   * Save stats to the appropriate database table
   */
  private async saveStatsToDatabase(
    payload: FetchTraktRatingsPayload,
    stats: {
      watchers: number
      plays: number
      collectors: number
      votes: number
      comments: number
      lists: number
      rating: number
    }
  ): Promise<void> {
    if (payload.entityType === "movie") {
      // Fetch existing movie data
      const movie = await getMovie(payload.entityId)

      if (!movie) {
        throw new Error(`Movie with TMDB ID ${payload.entityId} not found`)
      }

      // Update with Trakt stats
      await upsertMovie({
        ...movie,
        trakt_rating: stats.rating,
        trakt_votes: stats.votes,
        trakt_watchers: stats.watchers,
        trakt_plays: stats.plays,
        trakt_updated_at: new Date(),
      })
    } else {
      // Fetch existing show data
      const show = await getShow(payload.entityId)

      if (!show) {
        throw new Error(`Show with TMDB ID ${payload.entityId} not found`)
      }

      // Update with Trakt stats
      await upsertShow({
        ...show,
        trakt_rating: stats.rating,
        trakt_votes: stats.votes,
        trakt_watchers: stats.watchers,
        trakt_plays: stats.plays,
        trakt_updated_at: new Date(),
      })
    }
  }

  /**
   * Check if an error is permanent (don't retry) or transient (retry)
   */
  private isPermanentError(error: unknown): boolean {
    const errorMessage = (error as Error).message || String(error)

    // Check for permanent HTTP status codes
    for (const code of PERMANENT_ERROR_CODES) {
      if (errorMessage.includes(String(code))) {
        return true
      }
    }

    // Check for specific permanent error messages
    if (
      errorMessage.includes("invalid api key") ||
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("not found") ||
      errorMessage.includes("invalid id")
    ) {
      return true
    }

    // Default to transient (will retry)
    return false
  }

  /**
   * Hook called after successful job completion
   */
  async onCompleted(job: Job<FetchTraktRatingsPayload>, result: JobResult): Promise<void> {
    await super.onCompleted(job, result)

    const jobLogger = this.createLogger(job)

    jobLogger.info(
      {
        entityType: job.data.entityType,
        entityId: job.data.entityId,
        imdbId: job.data.imdbId,
        success: result.success,
      },
      "Trakt ratings job completed"
    )
  }

  /**
   * Hook called after job failure
   */
  async onFailed(job: Job<FetchTraktRatingsPayload>, error: Error): Promise<void> {
    await super.onFailed(job, error)

    const jobLogger = this.createLogger(job)
    const isPermanent = this.isPermanentError(error)

    jobLogger.error(
      {
        entityType: job.data.entityType,
        entityId: job.data.entityId,
        imdbId: job.data.imdbId,
        error: error.message,
        isPermanent,
      },
      "Trakt ratings job failed"
    )
  }
}
