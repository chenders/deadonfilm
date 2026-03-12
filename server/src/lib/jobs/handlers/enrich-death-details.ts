/**
 * Single Actor Death Details Enrichment Handler
 *
 * BullMQ job handler for enriching death information for a single actor.
 * Delegates to EnrichmentRunner (same as the batch handler) with
 * actorIds: [actorId] and limit: 1.
 */

import type { Job } from "bullmq"
import { getPool } from "../../db.js"
import { EnrichmentRunner, type EnrichmentStats } from "../../enrichment-runner.js"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type EnrichDeathDetailsPayload } from "../types.js"

/**
 * Result returned from single-actor enrichment
 */
export interface SingleActorEnrichmentResult {
  actorId: number
  actorName: string
  enriched: boolean
  costUsd: number
  stats?: EnrichmentStats
}

/**
 * Handler for single actor death details enrichment jobs
 */
export class EnrichDeathDetailsHandler extends BaseJobHandler<
  EnrichDeathDetailsPayload,
  SingleActorEnrichmentResult
> {
  readonly jobType = JobType.ENRICH_DEATH_DETAILS
  readonly queueName = QueueName.ENRICHMENT

  /**
   * Process the enrichment job for a single actor
   */
  async process(
    job: Job<EnrichDeathDetailsPayload>
  ): Promise<JobResult<SingleActorEnrichmentResult>> {
    const log = this.createLogger(job)
    const { actorId, actorName, forceRefresh } = job.data

    log.info({ actorId, actorName, forceRefresh }, "Starting single actor enrichment")

    const db = getPool()

    // 1. Validate actor exists and is deceased
    const validation = await this.validateActor(db, actorId, forceRefresh)
    if (validation.skip) {
      log.info({ actorId, reason: validation.reason }, validation.message)
      return {
        success: validation.success,
        data: validation.data,
        error: validation.error,
        metadata: validation.metadata,
      }
    }

    // 2. Run enrichment via EnrichmentRunner (same engine as batch handler)
    const runner = new EnrichmentRunner({
      actorIds: [actorId],
      limit: 1,
      free: true,
      paid: true,
      ai: false,
      claudeCleanup: true,
      confidence: 0.5,
      ignoreCache: forceRefresh,
    })

    try {
      const stats = await runner.run()

      log.info(
        {
          actorId,
          actorName,
          enriched: stats.actorsEnriched > 0,
          costUsd: stats.totalCostUsd,
        },
        "Single actor enrichment completed"
      )

      return {
        success: true,
        data: {
          actorId,
          actorName,
          enriched: stats.actorsEnriched > 0,
          costUsd: stats.totalCostUsd,
          stats,
        },
      }
    } catch (error) {
      log.error({ actorId, actorName, error }, "Enrichment failed")
      throw error
    }
  }

  /**
   * Validate that the actor exists, is deceased, and needs enrichment.
   * Returns early-exit info if the actor should be skipped.
   */
  private async validateActor(
    db: ReturnType<typeof getPool>,
    actorId: number,
    forceRefresh: boolean
  ): Promise<{
    skip: boolean
    success: boolean
    message: string
    reason?: string
    error?: string
    data?: SingleActorEnrichmentResult
    metadata?: Record<string, unknown>
  }> {
    const result = await db.query<{
      id: number
      name: string
      deathday: Date | string | null
      circumstances: string | null
    }>(
      `SELECT a.id, a.name, a.deathday, c.circumstances
       FROM actors a
       LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
       WHERE a.id = $1`,
      [actorId]
    )

    const actor = result.rows[0]

    if (!actor) {
      return {
        skip: true,
        success: false,
        message: "Actor not found in database",
        error: `Actor with ID ${actorId} not found`,
        metadata: { isPermanent: true },
      }
    }

    if (!actor.deathday) {
      return {
        skip: true,
        success: false,
        message: "Actor is not deceased",
        error: `Actor ${actor.name} (ID: ${actorId}) is not deceased`,
        metadata: { isPermanent: true },
      }
    }

    if (!forceRefresh && actor.circumstances) {
      return {
        skip: true,
        success: true,
        message: "Actor already has enrichment data, skipping",
        reason: "already_enriched",
        data: {
          actorId,
          actorName: actor.name,
          enriched: false,
          costUsd: 0,
        },
        metadata: { skipped: true, reason: "already_enriched" },
      }
    }

    return { skip: false, success: true, message: "Actor validated" }
  }
}
