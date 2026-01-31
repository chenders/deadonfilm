/**
 * REBUILD_DEATH_CACHES Handler
 *
 * Rebuilds all death-related caches including:
 * - Recent deaths
 * - Death watch
 * - All deaths
 * - COVID deaths
 * - Unnatural deaths
 *
 * This handler is typically queued after:
 * - New deaths are detected by TMDB sync
 * - Actor obscurity is recalculated
 * - Manual cache invalidation
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type RebuildDeathCachesPayload } from "../types.js"
import { rebuildDeathCaches, setDeathCacheMetadata } from "../../cache.js"
import { getPool } from "../../db.js"

/**
 * Result from cache rebuild
 */
export interface RebuildDeathCachesResult {
  rebuilt: boolean
  duration: number
  mostRecentDeath?: {
    name: string
    deathday: string
  }
  cacheRebuiltAt: string
}

/**
 * Handler for rebuilding death-related caches
 */
export class RebuildDeathCachesHandler extends BaseJobHandler<
  RebuildDeathCachesPayload,
  RebuildDeathCachesResult
> {
  readonly jobType = JobType.REBUILD_DEATH_CACHES
  readonly queueName = QueueName.CACHE

  /**
   * Process the cache rebuild job
   */
  async process(job: Job<RebuildDeathCachesPayload>): Promise<JobResult<RebuildDeathCachesResult>> {
    const log = this.createLogger(job)
    const startTime = Date.now()

    log.info("Starting death caches rebuild")

    try {
      // Rebuild all death-related caches
      await rebuildDeathCaches()

      const duration = Date.now() - startTime
      const cacheRebuiltAt = new Date().toISOString()

      // Get the most recent death for reporting
      const pool = getPool()
      const recentDeathResult = await pool.query<{ name: string; deathday: string }>(
        `SELECT name, deathday::text
         FROM actors
         WHERE deathday IS NOT NULL AND is_obscure = false
         ORDER BY deathday DESC
         LIMIT 1`
      )
      const mostRecentDeath = recentDeathResult.rows[0]

      // Store metadata about the cache rebuild
      await setDeathCacheMetadata({
        lastRebuiltAt: cacheRebuiltAt,
        mostRecentDeath,
      })

      // Record metrics
      newrelic.recordMetric("Custom/JobHandler/RebuildDeathCaches/Duration", duration)
      newrelic.recordMetric("Custom/JobHandler/RebuildDeathCaches/Success", 1)

      log.info(
        {
          duration,
          mostRecentDeath: mostRecentDeath?.name,
          mostRecentDeathDate: mostRecentDeath?.deathday,
        },
        "Death caches rebuilt successfully"
      )

      return {
        success: true,
        data: {
          rebuilt: true,
          duration,
          mostRecentDeath,
          cacheRebuiltAt,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.error({ error: errorMsg }, "Error rebuilding death caches")

      newrelic.recordMetric("Custom/JobHandler/RebuildDeathCaches/Error", 1)

      return {
        success: false,
        error: errorMsg,
        data: {
          rebuilt: false,
          duration: Date.now() - startTime,
          cacheRebuiltAt: new Date().toISOString(),
        },
      }
    }
  }
}
