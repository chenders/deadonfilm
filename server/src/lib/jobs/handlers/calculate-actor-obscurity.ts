/**
 * CALCULATE_ACTOR_OBSCURITY Handler
 *
 * Calculates the is_obscure flag for specified actors based on their
 * movie and TV appearances. Used after TMDB sync detects new deaths.
 *
 * An actor is NOT obscure if ANY of these conditions are true:
 * - Has appeared in a movie with popularity >= 20 (hit film)
 * - Has appeared in a TV show with popularity >= 20 (hit show)
 * - Has 3+ English movies with popularity >= 5
 * - Has 3+ English TV shows with popularity >= 5
 * - Has 10+ movies total
 * - Has 50+ TV episodes total
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import {
  JobType,
  QueueName,
  type JobResult,
  type CalculateActorObscurityPayload,
} from "../types.js"
import { getPool } from "../../db.js"
import { queueManager } from "../queue-manager.js"

// Thresholds for obscurity detection (same as backfill-actor-obscure.ts)
const THRESHOLDS = {
  HIT_MOVIE_POPULARITY: 20,
  HIT_SHOW_POPULARITY: 20,
  ENGLISH_CONTENT_POPULARITY: 5,
  MIN_ENGLISH_MOVIES: 3,
  MIN_ENGLISH_SHOWS: 3,
  MIN_TOTAL_MOVIES: 10,
  MIN_TOTAL_EPISODES: 50,
}

/**
 * Result from obscurity calculation
 */
export interface CalculateActorObscurityResult {
  processed: number
  changedToVisible: number
  changedToObscure: number
  unchanged: number
  errors: string[]
}

/**
 * Handler for calculating actor obscurity
 */
export class CalculateActorObscurityHandler extends BaseJobHandler<
  CalculateActorObscurityPayload,
  CalculateActorObscurityResult
> {
  readonly jobType = JobType.CALCULATE_ACTOR_OBSCURITY
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the obscurity calculation job
   */
  async process(
    job: Job<CalculateActorObscurityPayload>
  ): Promise<JobResult<CalculateActorObscurityResult>> {
    const log = this.createLogger(job)
    const { actorIds, rebuildCachesOnComplete } = job.data

    log.info({ actorCount: actorIds.length }, "Starting actor obscurity calculation")

    const errors: string[] = []
    const pool = getPool()

    let changedToVisible = 0
    let changedToObscure = 0
    let unchanged = 0

    try {
      // Calculate obscurity for the specified actors
      const result = await pool.query<{
        id: number
        name: string
        old_obscure: boolean
        new_obscure: boolean
      }>(
        `
        WITH actor_metrics AS (
          SELECT
            a.id,
            a.name,
            a.is_obscure as old_obscure,
            CASE
              WHEN COALESCE(ma.max_movie_pop, 0) >= $1 THEN false
              WHEN COALESCE(ta.max_show_pop, 0) >= $2 THEN false
              WHEN COALESCE(ma.en_movies_pop5, 0) >= $3 THEN false
              WHEN COALESCE(ta.en_shows_pop5, 0) >= $4 THEN false
              WHEN COALESCE(ma.movie_count, 0) >= $5 THEN false
              WHEN COALESCE(ta.episode_count, 0) >= $6 THEN false
              ELSE true
            END as new_obscure
          FROM actors a
          LEFT JOIN (
            SELECT
              ama.actor_id,
              COUNT(*)::int as movie_count,
              MAX(m.tmdb_popularity) as max_movie_pop,
              COUNT(*) FILTER (WHERE m.original_language = 'en' AND m.tmdb_popularity >= $7)::int as en_movies_pop5
            FROM actor_movie_appearances ama
            JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
            WHERE ama.actor_id = ANY($8)
            GROUP BY ama.actor_id
          ) ma ON ma.actor_id = a.id
          LEFT JOIN (
            SELECT
              asa.actor_id,
              COUNT(*)::int as episode_count,
              MAX(s.tmdb_popularity) as max_show_pop,
              COUNT(DISTINCT asa.show_tmdb_id) FILTER (WHERE s.original_language = 'en' AND s.tmdb_popularity >= $7)::int as en_shows_pop5
            FROM actor_show_appearances asa
            JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
            WHERE asa.actor_id = ANY($8)
            GROUP BY asa.actor_id
          ) ta ON ta.actor_id = a.id
          WHERE a.id = ANY($8)
        )
        UPDATE actors a
        SET
          is_obscure = am.new_obscure,
          updated_at = NOW()
        FROM actor_metrics am
        WHERE a.id = am.id
        RETURNING a.id, am.name, am.old_obscure, am.new_obscure
        `,
        [
          THRESHOLDS.HIT_MOVIE_POPULARITY,
          THRESHOLDS.HIT_SHOW_POPULARITY,
          THRESHOLDS.MIN_ENGLISH_MOVIES,
          THRESHOLDS.MIN_ENGLISH_SHOWS,
          THRESHOLDS.MIN_TOTAL_MOVIES,
          THRESHOLDS.MIN_TOTAL_EPISODES,
          THRESHOLDS.ENGLISH_CONTENT_POPULARITY,
          actorIds,
        ]
      )

      // Count changes
      for (const row of result.rows) {
        if (row.old_obscure !== row.new_obscure) {
          if (row.new_obscure) {
            changedToObscure++
            log.info({ actorId: row.id, name: row.name }, "Actor changed to obscure")
          } else {
            changedToVisible++
            log.info({ actorId: row.id, name: row.name }, "Actor changed to visible")
          }
        } else {
          unchanged++
        }
      }

      // Record metrics
      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/Processed", actorIds.length)
      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/ChangedToVisible", changedToVisible)
      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/ChangedToObscure", changedToObscure)

      log.info(
        {
          processed: actorIds.length,
          changedToVisible,
          changedToObscure,
          unchanged,
        },
        "Actor obscurity calculation completed"
      )

      // Queue cache rebuild if requested and there were changes
      if (rebuildCachesOnComplete && (changedToVisible > 0 || changedToObscure > 0)) {
        log.info("Queueing death cache rebuild job")
        await queueManager.addJob(
          JobType.REBUILD_DEATH_CACHES,
          {},
          {
            createdBy: "calculate-actor-obscurity",
          }
        )
      }

      return {
        success: true,
        data: {
          processed: actorIds.length,
          changedToVisible,
          changedToObscure,
          unchanged,
          errors,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.error({ error: errorMsg }, "Error calculating actor obscurity")
      errors.push(errorMsg)

      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/Error", 1)

      return {
        success: false,
        error: errorMsg,
        data: {
          processed: 0,
          changedToVisible,
          changedToObscure,
          unchanged,
          errors,
        },
      }
    }
  }
}
