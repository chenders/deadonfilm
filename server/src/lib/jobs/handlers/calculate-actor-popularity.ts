/**
 * CALCULATE_ACTOR_POPULARITY Handler
 *
 * Calculates DOF popularity scores for actors based on their filmography.
 * An actor's score is derived from:
 * - Their content's dof_popularity and dof_weight scores
 * - Their billing order (lead roles weighted higher)
 * - Episode count for TV appearances
 * - Their TMDB popularity for recency signal
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import {
  JobType,
  QueueName,
  type JobResult,
  type CalculateActorPopularityPayload,
} from "../types.js"
import { getPool } from "../../db.js"
import {
  calculateActorPopularity,
  type ActorPopularityInput,
  type ActorAppearance,
} from "../../popularity-score.js"
import { calculateActorAwardsScore, type ActorAwardsData } from "../../wikidata-awards.js"

// Batch size for processing
const DEFAULT_BATCH_SIZE = 100

/**
 * Result from actor popularity calculation
 */
export interface CalculateActorPopularityResult {
  processed: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * Handler for calculating actor popularity
 */
export class CalculateActorPopularityHandler extends BaseJobHandler<
  CalculateActorPopularityPayload,
  CalculateActorPopularityResult
> {
  readonly jobType = JobType.CALCULATE_ACTOR_POPULARITY
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the actor popularity calculation job
   */
  async process(
    job: Job<CalculateActorPopularityPayload>
  ): Promise<JobResult<CalculateActorPopularityResult>> {
    const log = this.createLogger(job)
    const { actorIds, batchSize = DEFAULT_BATCH_SIZE, recalculateAll } = job.data

    log.info(
      { actorIdsCount: actorIds?.length, batchSize, recalculateAll },
      "Starting actor popularity calculation"
    )

    const errors: string[] = []
    const pool = getPool()
    let processed = 0
    let updated = 0
    let skipped = 0

    try {
      // Get actors to process
      let actorsQuery: string
      const params: (number | number[])[] = []

      if (actorIds && actorIds.length > 0) {
        // Process specific IDs
        actorsQuery = `
          SELECT id, tmdb_popularity, wikipedia_annual_pageviews, wikidata_sitelinks, actor_awards_data
          FROM actors
          WHERE id = ANY($1)
          ${!recalculateAll ? "AND dof_popularity IS NULL" : ""}
        `
        params.push(actorIds)
      } else {
        // Batch processing - get actors without scores
        actorsQuery = `
          SELECT id, tmdb_popularity, wikipedia_annual_pageviews, wikidata_sitelinks, actor_awards_data
          FROM actors
          ${!recalculateAll ? "WHERE dof_popularity IS NULL" : ""}
          ORDER BY id
          LIMIT $1
        `
        params.push(batchSize)
      }

      const actorsResult = await pool.query<{
        id: number
        tmdb_popularity: number | null
        wikipedia_annual_pageviews: number | null
        wikidata_sitelinks: number | null
        actor_awards_data: ActorAwardsData | null
      }>(actorsQuery, params)
      const actors = actorsResult.rows

      log.info({ actorCount: actors.length }, "Retrieved actors for processing")

      // Process each actor
      for (const actor of actors) {
        try {
          processed++

          // Get filmography with content scores
          const filmography = await this.getActorFilmography(pool, actor.id)

          if (filmography.length === 0) {
            skipped++
            continue
          }

          // Extract pre-computed awards score from JSONB
          const awardsData = actor.actor_awards_data as ActorAwardsData | null
          const actorAwardsScore =
            awardsData?.totalScore != null
              ? awardsData.totalScore
              : calculateActorAwardsScore(awardsData)

          // Build input and calculate
          const input: ActorPopularityInput = {
            appearances: filmography,
            tmdbPopularity: actor.tmdb_popularity,
            wikipediaAnnualPageviews: actor.wikipedia_annual_pageviews,
            wikidataSitelinks: actor.wikidata_sitelinks,
            actorAwardsScore: actorAwardsScore ?? null,
          }

          const result = calculateActorPopularity(input)

          // Skip if no score could be calculated
          if (result.dofPopularity === null) {
            skipped++
            continue
          }

          // Update the database
          await pool.query(
            `
            UPDATE actors
            SET
              dof_popularity = $1,
              dof_popularity_confidence = $2,
              dof_popularity_updated_at = NOW()
            WHERE id = $3
            `,
            [result.dofPopularity, result.confidence, actor.id]
          )

          updated++
        } catch (error) {
          const errorMsg = `Failed to process actor ${actor.id}: ${error instanceof Error ? error.message : String(error)}`
          log.error({ actorId: actor.id, error: errorMsg }, "Error processing actor")
          errors.push(errorMsg)
        }
      }

      // Record metrics
      newrelic.recordMetric("Custom/JobHandler/ActorPopularity/Processed", processed)
      newrelic.recordMetric("Custom/JobHandler/ActorPopularity/Updated", updated)
      newrelic.recordMetric("Custom/JobHandler/ActorPopularity/Skipped", skipped)

      log.info(
        { processed, updated, skipped, errorsCount: errors.length },
        "Actor popularity calculation completed"
      )

      return {
        success: true,
        data: { processed, updated, skipped, errors },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.error({ error: errorMsg }, "Error in actor popularity calculation")
      errors.push(errorMsg)

      newrelic.recordMetric("Custom/JobHandler/ActorPopularity/Error", 1)

      return {
        success: false,
        error: errorMsg,
        data: { processed, updated, skipped, errors },
      }
    }
  }

  /**
   * Get an actor's filmography with content popularity scores
   */
  private async getActorFilmography(
    pool: ReturnType<typeof getPool>,
    actorId: number
  ): Promise<ActorAppearance[]> {
    const appearances: ActorAppearance[] = []

    // Get movie appearances with cast size and next billing order for star power.
    // Window functions are computed over the full cast (subquery) before filtering
    // to the target actor, so cast_size and next_billing_order reflect the real cast.
    const moviesResult = await pool.query<{
      dof_popularity: number | null
      dof_weight: number | null
      billing_order: number | null
      cast_size: number | null
      next_billing_order: number | null
    }>(
      `
      SELECT w.dof_popularity, w.dof_weight, w.billing_order,
             w.cast_size, w.next_billing_order
      FROM (
        SELECT
          ama.actor_id,
          m.dof_popularity,
          m.dof_weight,
          ama.billing_order,
          COUNT(*) OVER (PARTITION BY ama.movie_tmdb_id)::int as cast_size,
          LEAD(ama.billing_order) OVER (
            PARTITION BY ama.movie_tmdb_id ORDER BY ama.billing_order
          ) as next_billing_order
        FROM actor_movie_appearances ama
        JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
        WHERE ama.movie_tmdb_id IN (
          SELECT movie_tmdb_id FROM actor_movie_appearances WHERE actor_id = $1
        )
      ) w
      WHERE w.actor_id = $1
      `,
      [actorId]
    )

    for (const row of moviesResult.rows) {
      appearances.push({
        contentDofPopularity: row.dof_popularity,
        contentDofWeight: row.dof_weight,
        billingOrder: row.billing_order,
        episodeCount: null,
        isMovie: true,
        castSize: row.cast_size,
        nextBillingOrder: row.next_billing_order,
      })
    }

    // Get TV appearances (aggregated by show)
    const showsResult = await pool.query<{
      dof_popularity: number | null
      dof_weight: number | null
      min_billing_order: number | null
      episode_count: number
    }>(
      `
      SELECT
        s.dof_popularity,
        s.dof_weight,
        MIN(asa.billing_order) as min_billing_order,
        COUNT(*) as episode_count
      FROM actor_show_appearances asa
      JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
      WHERE asa.actor_id = $1
      GROUP BY s.tmdb_id, s.dof_popularity, s.dof_weight
      `,
      [actorId]
    )

    for (const row of showsResult.rows) {
      appearances.push({
        contentDofPopularity: row.dof_popularity,
        contentDofWeight: row.dof_weight,
        billingOrder: row.min_billing_order,
        episodeCount: Number(row.episode_count),
        isMovie: false,
        castSize: null,
        nextBillingOrder: null,
      })
    }

    return appearances
  }
}
