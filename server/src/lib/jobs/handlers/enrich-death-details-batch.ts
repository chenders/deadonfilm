/**
 * Batch Death Details Enrichment Handler
 *
 * BullMQ job handler for processing batch enrichment runs.
 * Uses the EnrichmentRunner library for core enrichment logic.
 */

import type { Job } from "bullmq"
import { getPool } from "../../db.js"
import { logger } from "../../logger.js"
import { EnrichmentRunner, type EnrichmentStats } from "../../enrichment-runner.js"
import { BaseJobHandler } from "./base.js"
import {
  JobType,
  QueueName,
  type JobResult,
  type EnrichDeathDetailsBatchPayload,
} from "../types.js"

/**
 * Handler for batch death details enrichment jobs
 */
export class EnrichDeathDetailsBatchHandler extends BaseJobHandler<
  EnrichDeathDetailsBatchPayload,
  EnrichmentStats
> {
  readonly jobType = JobType.ENRICH_DEATH_DETAILS_BATCH
  readonly queueName = QueueName.ENRICHMENT

  /**
   * Process the batch enrichment job
   */
  async process(job: Job<EnrichDeathDetailsBatchPayload>): Promise<JobResult<EnrichmentStats>> {
    const log = this.createLogger(job)
    const { runId, ...config } = job.data

    log.info({ runId }, "Starting batch enrichment job")

    // Create abort controller for cancellation support
    const abortController = new AbortController()

    // Create the runner with progress callback
    const runner = new EnrichmentRunner(
      {
        ...config,
        runId,
      },
      async (progress) => {
        // Update BullMQ job progress (always — lightweight in-memory update)
        await job.updateProgress({
          currentActorIndex: progress.currentActorIndex,
          currentActorName: progress.currentActorName,
          actorsQueried: progress.actorsQueried,
          actorsProcessed: progress.actorsProcessed,
          actorsEnriched: progress.actorsEnriched,
          actorsWithDeathPage: progress.actorsWithDeathPage,
          totalCostUsd: progress.totalCostUsd,
        })

        // "processing" phase = actor just started, only update name/index (lightweight)
        // "completed" phase = actor finished, update all counters (full DB write)
        if (progress.phase === "processing") {
          await this.updateCurrentActor(
            runId,
            progress.currentActorIndex,
            progress.currentActorName
          )
        } else {
          await this.updateRunProgress(runId, progress)
        }
      },
      abortController.signal
    )

    try {
      const stats = await runner.run()

      // Complete the enrichment run in database
      await this.completeEnrichmentRun(runId, stats, config.staging ?? false)

      log.info(
        {
          runId,
          actorsProcessed: stats.actorsProcessed,
          actorsEnriched: stats.actorsEnriched,
          totalCostUsd: stats.totalCostUsd,
          exitReason: stats.exitReason,
        },
        "Batch enrichment job completed"
      )

      return {
        success: true,
        data: stats,
      }
    } catch (error) {
      log.error({ runId, error }, "Batch enrichment job failed")

      // Mark run as failed in database
      await this.markRunAsFailed(runId, error as Error)

      throw error
    }
  }

  /**
   * Lightweight update: only set current actor name/index (no counter writes).
   * Used for "processing" phase to avoid doubling DB writes per actor.
   */
  private async updateCurrentActor(
    runId: number,
    actorIndex: number,
    actorName: string
  ): Promise<void> {
    const db = getPool()

    try {
      await db.query(
        `UPDATE enrichment_runs
         SET current_actor_index = $1,
             current_actor_name = $2
         WHERE id = $3`,
        [actorIndex, actorName, runId]
      )
    } catch (error) {
      logger.error({ runId, error }, "Failed to update current actor")
    }
  }

  /**
   * Update progress in the enrichment_runs table
   */
  private async updateRunProgress(
    runId: number,
    progress: {
      currentActorIndex: number
      currentActorName: string
      actorsQueried: number
      actorsProcessed: number
      actorsEnriched: number
      actorsWithDeathPage: number
      totalCostUsd: number
    }
  ): Promise<void> {
    const db = getPool()

    try {
      await db.query(
        `UPDATE enrichment_runs
         SET current_actor_index = $1,
             current_actor_name = $2,
             actors_queried = $3,
             actors_processed = $4,
             actors_enriched = $5,
             total_cost_usd = $6,
             actors_with_death_page = $7
         WHERE id = $8`,
        [
          progress.currentActorIndex,
          progress.currentActorName,
          progress.actorsQueried,
          progress.actorsProcessed,
          progress.actorsEnriched,
          progress.totalCostUsd,
          progress.actorsWithDeathPage,
          runId,
        ]
      )
    } catch (error) {
      logger.error({ runId, error }, "Failed to update run progress")
      // Don't throw - progress tracking failures shouldn't crash the enrichment
    }
  }

  /**
   * Complete an enrichment run in the database
   */
  private async completeEnrichmentRun(
    runId: number,
    stats: EnrichmentStats,
    staging: boolean
  ): Promise<void> {
    const db = getPool()
    const reviewStatus = staging ? "pending_review" : "not_applicable"

    try {
      // Count actors that created death pages from the per-actor tracking
      const deathPageResult = await db.query<{ cnt: string }>(
        `SELECT count(*) as cnt FROM enrichment_run_actors WHERE run_id = $1 AND created_death_page = true`,
        [runId]
      )
      const actorsWithDeathPage = parseInt(deathPageResult.rows[0]?.cnt ?? "0", 10)

      await db.query(
        `UPDATE enrichment_runs
         SET status = $1,
             completed_at = NOW(),
             duration_ms = $2,
             actors_processed = $3,
             actors_enriched = $4,
             actors_with_death_page = $5,
             fill_rate = $6,
             total_cost_usd = $7,
             cost_by_source = $8,
             exit_reason = $9,
             review_status = $10,
             source_hit_rates = $11,
             sources_attempted = $12,
             process_id = NULL,
             current_actor_index = NULL,
             current_actor_name = NULL
         WHERE id = $13`,
        [
          stats.exitReason === "completed" || stats.exitReason === "cost_limit"
            ? "completed"
            : "stopped",
          stats.totalTimeMs,
          stats.actorsProcessed,
          stats.actorsEnriched,
          actorsWithDeathPage,
          stats.fillRate,
          stats.totalCostUsd,
          JSON.stringify(stats.costBySource),
          stats.exitReason,
          reviewStatus,
          JSON.stringify(stats.sourceHitRates || {}),
          JSON.stringify(stats.uniqueSourcesAttempted || []),
          runId,
        ]
      )
    } catch (error) {
      logger.error({ runId, error }, "Failed to complete enrichment run")
      // Don't throw - the enrichment itself succeeded
    }
  }

  /**
   * Mark an enrichment run as failed in the database
   */
  private async markRunAsFailed(runId: number, error: Error): Promise<void> {
    const db = getPool()

    try {
      await db.query(
        `UPDATE enrichment_runs
         SET status = 'failed',
             completed_at = NOW(),
             exit_reason = 'error',
             process_id = NULL,
             current_actor_index = NULL,
             current_actor_name = NULL,
             errors = jsonb_set(
               COALESCE(errors, '[]'::jsonb),
               '{999999}',
               to_jsonb($2::text)
             )
         WHERE id = $1`,
        [runId, error.message]
      )
    } catch (dbError) {
      logger.error({ runId, dbError }, "Failed to update enrichment run status on error")
    }
  }
}
