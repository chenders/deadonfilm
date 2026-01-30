/**
 * OMDb Ratings Fetch Handler
 *
 * Fetches IMDb ratings, Rotten Tomatoes scores, and Metacritic scores from OMDb API
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
import { JobType, QueueName, type JobResult, type FetchOMDbRatingsPayload } from "../types.js"
import { getOMDbRatings, type OMDbExtendedMetrics } from "../../omdb.js"
import { getMovie, upsertMovie } from "../../db/movies.js"
import { getShow, upsertShow } from "../../db/shows.js"

/**
 * OMDb API rate limit: minimum 200ms between requests (~5 requests/second)
 * Note: Enforced by getOMDbRatings(), not by this handler
 */
const RATE_LIMIT_DELAY_MS = 200

/**
 * HTTP status codes that indicate permanent failures
 * (don't retry these)
 */
const PERMANENT_ERROR_CODES = new Set([400, 401, 403, 404, 422])

/**
 * Handler for fetching OMDb ratings
 */
export class FetchOMDbRatingsHandler extends BaseJobHandler<FetchOMDbRatingsPayload, unknown> {
  readonly jobType = JobType.FETCH_OMDB_RATINGS
  readonly queueName = QueueName.RATINGS

  /**
   * Rate limit configuration for OMDb API (documentation only)
   * Actual rate limiting is handled by getOMDbRatings() internally.
   * This property informs the worker's queue-level rate limiting strategy.
   */
  readonly rateLimit = {
    max: 1,
    duration: RATE_LIMIT_DELAY_MS,
  }

  /**
   * Process the job: fetch ratings from OMDb and save to database
   * Note: Base class already wraps this in a New Relic transaction
   */
  async process(job: Job<FetchOMDbRatingsPayload>): Promise<JobResult> {
    const jobLogger = this.createLogger(job)

    // Add custom attributes to New Relic transaction
    newrelic.addCustomAttribute("entityType", job.data.entityType)
    newrelic.addCustomAttribute("entityId", job.data.entityId)
    newrelic.addCustomAttribute("imdbId", job.data.imdbId)

    jobLogger.info(
      {
        entityType: job.data.entityType,
        entityId: job.data.entityId,
        imdbId: job.data.imdbId,
      },
      "Fetching OMDb ratings"
    )

    try {
      // Fetch ratings from OMDb API (with New Relic segment)
      // Note: getOMDbRatings() handles rate limiting internally
      const ratings = await newrelic.startSegment("OMDb API Call", true, async () => {
        return await getOMDbRatings(job.data.imdbId)
      })

      // Check if ratings were found
      if (!ratings) {
        jobLogger.warn({ imdbId: job.data.imdbId }, "No ratings found for IMDb ID")

        newrelic.recordMetric("Custom/JobHandler/OMDb/NoRatingsFound", 1)

        // This is a permanent failure - IMDb ID doesn't exist or has no ratings
        return {
          success: false,
          error: "No ratings found",
          metadata: {
            imdbId: job.data.imdbId,
            entityType: job.data.entityType,
            entityId: job.data.entityId,
          },
        }
      }

      // Update database with ratings (with New Relic segment)
      await newrelic.startSegment("Database Update", true, async () => {
        return await this.saveRatingsToDatabase(job.data, ratings)
      })

      jobLogger.info(
        {
          entityType: job.data.entityType,
          entityId: job.data.entityId,
          ratings,
        },
        "Successfully saved OMDb ratings"
      )

      // Record success metric
      newrelic.recordMetric("Custom/JobHandler/OMDb/Success", 1)

      return {
        success: true,
        data: ratings,
        metadata: {
          imdbId: job.data.imdbId,
          entityType: job.data.entityType,
          entityId: job.data.entityId,
        },
      }
    } catch (error) {
      // Record error metric
      newrelic.recordMetric("Custom/JobHandler/OMDb/Error", 1)

      // NOTE: getOMDbRatings() catches all API errors and returns null.
      // Errors that reach here are from saveRatingsToDatabase() (database errors).
      // API-specific error classification below is currently unreachable for OMDb errors.
      const errorMessage = (error as Error).message || String(error)

      // Check if error is from rate limiting (currently unreachable for OMDb API errors)
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate limit")) {
        newrelic.recordMetric("Custom/JobHandler/OMDb/RateLimitExceeded", 1)
        jobLogger.error({ error: errorMessage }, "OMDb API rate limit exceeded")
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
   * Save ratings to the appropriate database table
   */
  private async saveRatingsToDatabase(
    payload: FetchOMDbRatingsPayload,
    ratings: OMDbExtendedMetrics
  ): Promise<void> {
    if (payload.entityType === "movie") {
      // Fetch existing movie data
      const movie = await getMovie(payload.entityId)

      if (!movie) {
        throw new Error(`Movie with TMDB ID ${payload.entityId} not found`)
      }

      // Update with OMDb ratings (including extended fields)
      await upsertMovie({
        ...movie,
        omdb_imdb_rating: ratings.imdbRating,
        omdb_imdb_votes: ratings.imdbVotes,
        omdb_rotten_tomatoes_score: ratings.rottenTomatoesScore,
        omdb_rotten_tomatoes_audience: ratings.rottenTomatoesAudience,
        omdb_metacritic_score: ratings.metacriticScore,
        omdb_box_office_cents: ratings.boxOfficeCents,
        omdb_awards_wins: ratings.awardsWins,
        omdb_awards_nominations: ratings.awardsNominations,
        omdb_updated_at: new Date(),
      })
    } else {
      // Fetch existing show data
      const show = await getShow(payload.entityId)

      if (!show) {
        throw new Error(`Show with TMDB ID ${payload.entityId} not found`)
      }

      // Update with OMDb ratings (including extended fields)
      await upsertShow({
        ...show,
        omdb_imdb_rating: ratings.imdbRating,
        omdb_imdb_votes: ratings.imdbVotes,
        omdb_rotten_tomatoes_score: ratings.rottenTomatoesScore,
        omdb_rotten_tomatoes_audience: ratings.rottenTomatoesAudience,
        omdb_metacritic_score: ratings.metacriticScore,
        omdb_total_seasons: ratings.totalSeasons,
        omdb_awards_wins: ratings.awardsWins,
        omdb_awards_nominations: ratings.awardsNominations,
        omdb_updated_at: new Date(),
      })
    }
  }

  /**
   * Check if an error is permanent (don't retry) or transient (retry)
   */
  private isPermanentError(error: unknown): boolean {
    const errorMessage = (error as Error).message || String(error)
    const lowerMessage = errorMessage.toLowerCase()

    // Check for permanent HTTP status codes
    for (const code of PERMANENT_ERROR_CODES) {
      if (errorMessage.includes(String(code))) {
        return true
      }
    }

    // Check for specific permanent error messages (case-insensitive)
    if (
      lowerMessage.includes("invalid api key") ||
      lowerMessage.includes("unauthorized") ||
      lowerMessage.includes("not found") ||
      lowerMessage.includes("invalid imdb id")
    ) {
      return true
    }

    // Default to transient (will retry)
    return false
  }

  /**
   * Hook called after successful job completion
   */
  async onCompleted(job: Job<FetchOMDbRatingsPayload>, result: JobResult): Promise<void> {
    await super.onCompleted(job, result)

    const jobLogger = this.createLogger(job)

    jobLogger.info(
      {
        entityType: job.data.entityType,
        entityId: job.data.entityId,
        imdbId: job.data.imdbId,
        success: result.success,
      },
      "OMDb ratings job completed"
    )
  }

  /**
   * Hook called after job failure
   */
  async onFailed(job: Job<FetchOMDbRatingsPayload>, error: Error): Promise<void> {
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
      "OMDb ratings job failed"
    )
  }
}
