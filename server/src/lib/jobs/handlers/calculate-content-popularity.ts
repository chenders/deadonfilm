/**
 * CALCULATE_CONTENT_POPULARITY Handler
 *
 * Calculates DOF popularity and weight scores for movies and TV shows
 * using multiple engagement signals (box office, Trakt, IMDb, TMDB).
 *
 * Can be run for specific entity IDs or in batch mode for all content.
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import {
  JobType,
  QueueName,
  type JobResult,
  type CalculateContentPopularityPayload,
} from "../types.js"
import { getPool } from "../../db.js"
import {
  calculateMoviePopularity,
  calculateShowPopularity,
  isUSUKProduction,
  type ContentPopularityInput,
  type ShowPopularityInput,
  type EraReferenceStats,
} from "../../popularity-score.js"

// Batch size for processing
const DEFAULT_BATCH_SIZE = 100

/**
 * Result from content popularity calculation
 */
export interface CalculateContentPopularityResult {
  processed: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * Handler for calculating content popularity
 */
export class CalculateContentPopularityHandler extends BaseJobHandler<
  CalculateContentPopularityPayload,
  CalculateContentPopularityResult
> {
  readonly jobType = JobType.CALCULATE_CONTENT_POPULARITY
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the content popularity calculation job
   */
  async process(
    job: Job<CalculateContentPopularityPayload>
  ): Promise<JobResult<CalculateContentPopularityResult>> {
    const log = this.createLogger(job)
    const { entityType, entityIds, batchSize = DEFAULT_BATCH_SIZE, recalculateAll } = job.data

    log.info(
      { entityType, entityIdsCount: entityIds?.length, batchSize, recalculateAll },
      "Starting content popularity calculation"
    )

    const errors: string[] = []
    const pool = getPool()
    let processed = 0
    let updated = 0
    let skipped = 0

    try {
      // Load era reference stats for box office normalization
      const eraStatsMap = await this.loadEraStats(pool)

      // Get content to process
      const table = entityType === "movie" ? "movies" : "shows"
      const idColumn = "tmdb_id"

      let query: string
      const params: (number | number[])[] = []

      if (entityIds && entityIds.length > 0) {
        // Process specific IDs
        query = `
          SELECT * FROM ${table}
          WHERE ${idColumn} = ANY($1)
          ${!recalculateAll ? "AND dof_popularity IS NULL" : ""}
        `
        params.push(entityIds)
      } else {
        // Batch processing - get content without scores
        query = `
          SELECT * FROM ${table}
          ${!recalculateAll ? "WHERE dof_popularity IS NULL" : ""}
          ORDER BY tmdb_id
          LIMIT $1
        `
        params.push(batchSize)
      }

      const result = await pool.query(query, params)
      const rows = result.rows

      log.info({ rowCount: rows.length }, "Retrieved content for processing")

      // Process each row
      for (const row of rows) {
        try {
          processed++

          // Get era stats for this content's release year
          const releaseYear =
            entityType === "movie"
              ? row.release_year
              : row.first_air_date
                ? new Date(row.first_air_date).getFullYear()
                : null
          const eraStats = releaseYear ? (eraStatsMap.get(releaseYear) ?? null) : null

          // Build input for calculation
          let popResult

          if (entityType === "movie") {
            const input: ContentPopularityInput = {
              releaseYear,
              boxOfficeCents: row.omdb_box_office_cents ?? null,
              traktWatchers: row.trakt_watchers ?? null,
              traktPlays: row.trakt_plays ?? null,
              imdbVotes: row.omdb_imdb_votes ?? null,
              tmdbPopularity: row.tmdb_popularity ?? null,
              isUSUKProduction: isUSUKProduction(row.production_countries),
              originalLanguage: row.original_language ?? null,
              awardsWins: row.omdb_awards_wins ?? null,
              awardsNominations: row.omdb_awards_nominations ?? null,
              aggregateScore: row.aggregate_score ?? null, // Optional - uses if available
              eraStats,
            }
            popResult = calculateMoviePopularity(input)
          } else {
            const input: ShowPopularityInput = {
              releaseYear,
              boxOfficeCents: null, // Shows don't have box office
              traktWatchers: row.trakt_watchers ?? null,
              traktPlays: row.trakt_plays ?? null,
              imdbVotes: row.omdb_imdb_votes ?? null,
              tmdbPopularity: row.tmdb_popularity ?? null,
              isUSUKProduction: isUSUKProduction(row.origin_country),
              originalLanguage: row.original_language ?? null,
              awardsWins: row.omdb_awards_wins ?? null,
              awardsNominations: row.omdb_awards_nominations ?? null,
              aggregateScore: row.aggregate_score ?? null, // Optional - uses if available
              eraStats,
              numberOfSeasons: row.number_of_seasons ?? null,
              numberOfEpisodes: row.number_of_episodes ?? null,
            }
            popResult = calculateShowPopularity(input)
          }

          // Skip if no score could be calculated
          if (popResult.dofPopularity === null) {
            skipped++
            continue
          }

          // Update the database
          await pool.query(
            `
            UPDATE ${table}
            SET
              dof_popularity = $1,
              dof_weight = $2,
              dof_popularity_confidence = $3,
              dof_popularity_updated_at = NOW()
            WHERE ${idColumn} = $4
            `,
            [popResult.dofPopularity, popResult.dofWeight, popResult.confidence, row.tmdb_id]
          )

          updated++
        } catch (error) {
          const errorMsg = `Failed to process ${entityType} ${row.tmdb_id}: ${error instanceof Error ? error.message : String(error)}`
          log.error({ entityId: row.tmdb_id, error: errorMsg }, "Error processing content")
          errors.push(errorMsg)
        }
      }

      // Record metrics
      newrelic.recordMetric("Custom/JobHandler/ContentPopularity/Processed", processed)
      newrelic.recordMetric("Custom/JobHandler/ContentPopularity/Updated", updated)
      newrelic.recordMetric("Custom/JobHandler/ContentPopularity/Skipped", skipped)

      log.info(
        { processed, updated, skipped, errorsCount: errors.length },
        "Content popularity calculation completed"
      )

      return {
        success: true,
        data: { processed, updated, skipped, errors },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.error({ error: errorMsg }, "Error in content popularity calculation")
      errors.push(errorMsg)

      newrelic.recordMetric("Custom/JobHandler/ContentPopularity/Error", 1)

      return {
        success: false,
        error: errorMsg,
        data: { processed, updated, skipped, errors },
      }
    }
  }

  /**
   * Load era reference stats from database
   */
  private async loadEraStats(
    pool: ReturnType<typeof getPool>
  ): Promise<Map<number, EraReferenceStats>> {
    const result = await pool.query<EraReferenceStats>(`
      SELECT * FROM era_reference_stats
    `)

    const map = new Map<number, EraReferenceStats>()
    for (const row of result.rows) {
      map.set(row.year, row)
    }
    return map
  }
}
