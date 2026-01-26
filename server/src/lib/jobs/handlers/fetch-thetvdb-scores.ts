/**
 * TheTVDB Scores Fetch Handler
 *
 * Fetches community scores from TheTVDB API and saves them to the shows table.
 * TheTVDB is TV shows only.
 *
 * Features:
 * - Rate limiting (100ms delay between requests)
 * - New Relic transaction tracking with segments
 * - Custom metrics for success/error/rate limit violations
 * - Distinguishes permanent vs transient errors
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type FetchTheTVDBScoresPayload } from "../types.js"
import { getSeriesExtended } from "../../thetvdb.js"
import { getShow, upsertShow } from "../../db/shows.js"

/**
 * TheTVDB API rate limit: ~100 requests per minute = ~600ms between requests
 * Being conservative with 100ms delay
 */
const RATE_LIMIT_DELAY_MS = 100

/**
 * HTTP status codes that indicate permanent failures
 * (don't retry these)
 */
const PERMANENT_ERROR_CODES = new Set([400, 401, 403, 404, 422])

/**
 * Handler for fetching TheTVDB scores
 */
export class FetchTheTVDBScoresHandler extends BaseJobHandler<
  FetchTheTVDBScoresPayload,
  unknown
> {
  readonly jobType = JobType.FETCH_THETVDB_SCORES
  readonly queueName = QueueName.RATINGS

  /**
   * Rate limit configuration for TheTVDB API
   * Enforces minimum 100ms delay between requests
   */
  readonly rateLimit = {
    max: 1,
    duration: RATE_LIMIT_DELAY_MS,
  }

  /**
   * Process the job: fetch scores from TheTVDB and save to database
   */
  async process(job: Job<FetchTheTVDBScoresPayload>): Promise<JobResult> {
    return newrelic.startBackgroundTransaction(`JobHandler/${this.jobType}`, async () => {
      const jobLogger = this.createLogger(job)

      // Add custom attributes to New Relic transaction
      newrelic.addCustomAttribute("jobId", job.id ?? "unknown")
      newrelic.addCustomAttribute("jobType", this.jobType)
      newrelic.addCustomAttribute("entityType", job.data.entityType)
      newrelic.addCustomAttribute("entityId", job.data.entityId)
      newrelic.addCustomAttribute("thetvdbId", job.data.thetvdbId)
      newrelic.addCustomAttribute("attemptNumber", job.attemptsMade + 1)
      newrelic.addCustomAttribute("priority", job.opts.priority ?? 0)

      jobLogger.info(
        {
          entityType: job.data.entityType,
          entityId: job.data.entityId,
          thetvdbId: job.data.thetvdbId,
        },
        "Fetching TheTVDB scores"
      )

      try {
        // Enforce rate limiting (delay before making API call)
        await this.delay(RATE_LIMIT_DELAY_MS)

        // Fetch series data from TheTVDB API (with New Relic segment)
        const series = await newrelic.startSegment("TheTVDB API Call", true, async () => {
          return await getSeriesExtended(job.data.thetvdbId)
        })

        // Check if series was found
        if (!series) {
          jobLogger.warn({ thetvdbId: job.data.thetvdbId }, "No series found for TheTVDB ID")

          newrelic.recordMetric("Custom/JobHandler/TheTVDB/NoSeriesFound", 1)

          // This is a permanent failure - ID doesn't exist
          return {
            success: false,
            error: "No series found",
            metadata: {
              thetvdbId: job.data.thetvdbId,
              entityType: job.data.entityType,
              entityId: job.data.entityId,
            },
          }
        }

        // Update database with score (with New Relic segment)
        await newrelic.startSegment("Database Update", true, async () => {
          return await this.saveScoreToDatabase(job.data, series.score)
        })

        jobLogger.info(
          {
            entityType: job.data.entityType,
            entityId: job.data.entityId,
            score: series.score,
          },
          "Successfully saved TheTVDB score"
        )

        // Record success metric
        newrelic.recordMetric("Custom/JobHandler/TheTVDB/Success", 1)

        return {
          success: true,
          data: { score: series.score },
          metadata: {
            thetvdbId: job.data.thetvdbId,
            entityType: job.data.entityType,
            entityId: job.data.entityId,
          },
        }
      } catch (error) {
        // Record error metric
        newrelic.recordMetric("Custom/JobHandler/TheTVDB/Error", 1)

        // Check if error is from rate limiting
        const errorMessage = (error as Error).message || String(error)
        if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("rate limit")) {
          newrelic.recordMetric("Custom/JobHandler/TheTVDB/RateLimitExceeded", 1)
          jobLogger.error({ error: errorMessage }, "TheTVDB API rate limit exceeded")
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
              thetvdbId: job.data.thetvdbId,
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
    })
  }

  /**
   * Save score to the shows table
   */
  private async saveScoreToDatabase(
    payload: FetchTheTVDBScoresPayload,
    score: number
  ): Promise<void> {
    // Fetch existing show data
    const show = await getShow(payload.entityId)

    if (!show) {
      throw new Error(`Show with TMDB ID ${payload.entityId} not found`)
    }

    // Update with TheTVDB score
    await upsertShow({
      ...show,
      thetvdb_score: score,
      thetvdb_updated_at: new Date(),
    })
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
  async onCompleted(job: Job<FetchTheTVDBScoresPayload>, result: JobResult): Promise<void> {
    await super.onCompleted(job, result)

    const jobLogger = this.createLogger(job)

    jobLogger.info(
      {
        entityType: job.data.entityType,
        entityId: job.data.entityId,
        thetvdbId: job.data.thetvdbId,
        success: result.success,
      },
      "TheTVDB scores job completed"
    )
  }

  /**
   * Hook called after job failure
   */
  async onFailed(job: Job<FetchTheTVDBScoresPayload>, error: Error): Promise<void> {
    await super.onFailed(job, error)

    const jobLogger = this.createLogger(job)
    const isPermanent = this.isPermanentError(error)

    jobLogger.error(
      {
        entityType: job.data.entityType,
        entityId: job.data.entityId,
        thetvdbId: job.data.thetvdbId,
        error: error.message,
        isPermanent,
      },
      "TheTVDB scores job failed"
    )
  }
}
