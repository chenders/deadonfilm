/**
 * Batch Biography Enrichment Handler
 *
 * BullMQ job handler that enriches actor biographies using the multi-source
 * biography enrichment orchestrator. Unlike GenerateBiographiesBatchHandler
 * (which uses the Anthropic Batches API for TMDB-based generation), this handler
 * uses the full biography enrichment pipeline with multiple data sources and
 * Claude synthesis.
 */

import newrelic from "newrelic"
import type { Job } from "bullmq"
import { getPool } from "../../db.js"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type EnrichBiographiesBatchPayload } from "../types.js"
import { BiographyEnrichmentOrchestrator } from "../../biography-sources/orchestrator.js"
import {
  writeBiographyToProduction,
  writeBiographyToStaging,
} from "../../biography-enrichment-db-writer.js"
import type { ActorForBiography } from "../../biography-sources/types.js"

export interface EnrichBiographiesBatchResult {
  actorsProcessed: number
  actorsEnriched: number
  actorsFailed: number
  totalCostUsd: number
  results: Array<{
    actorId: number
    actorName: string
    enriched: boolean
    error?: string
    costUsd: number
  }>
}

export class EnrichBiographiesBatchHandler extends BaseJobHandler<
  EnrichBiographiesBatchPayload,
  EnrichBiographiesBatchResult
> {
  readonly jobType = JobType.ENRICH_BIOGRAPHIES_BATCH
  readonly queueName = QueueName.ENRICHMENT

  async process(
    job: Job<EnrichBiographiesBatchPayload>
  ): Promise<JobResult<EnrichBiographiesBatchResult>> {
    const log = this.createLogger(job)
    const { actorIds, limit, minPopularity, confidenceThreshold, allowRegeneration, useStaging } =
      job.data
    const db = getPool()

    // Add New Relic attributes for this job
    for (const [key, value] of Object.entries({
      "bio.job.actorCount": actorIds?.length || limit || 10,
      "bio.job.allowRegeneration": !!allowRegeneration,
      "bio.job.useStaging": !!useStaging,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    // 1. Query actors
    let actors: ActorForBiography[]
    if (actorIds && actorIds.length > 0) {
      const placeholders = actorIds.map((_, i) => `$${i + 1}`).join(", ")
      const result = await db.query(
        `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
                wikipedia_url, biography AS biography_raw_tmdb, biography
         FROM actors
         WHERE id IN (${placeholders})
         ${!allowRegeneration ? "AND id NOT IN (SELECT actor_id FROM actor_biography_details)" : ""}`,
        actorIds
      )
      actors = result.rows
    } else {
      const params: unknown[] = []
      let paramIndex = 1
      let whereClause = "WHERE deathday IS NOT NULL"

      if (!allowRegeneration) {
        whereClause += " AND id NOT IN (SELECT actor_id FROM actor_biography_details)"
      }

      if (minPopularity !== undefined) {
        whereClause += ` AND COALESCE(dof_popularity, 0) >= $${paramIndex++}`
        params.push(minPopularity)
      }

      const limitValue = limit || 10
      params.push(limitValue)

      const result = await db.query(
        `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
                wikipedia_url, biography AS biography_raw_tmdb, biography
         FROM actors
         ${whereClause}
         ORDER BY dof_popularity DESC NULLS LAST, id ASC
         LIMIT $${paramIndex}`,
        params
      )
      actors = result.rows
    }

    log.info({ actorCount: actors.length }, "Found actors for biography enrichment")

    if (actors.length === 0) {
      return {
        success: true,
        data: {
          actorsProcessed: 0,
          actorsEnriched: 0,
          actorsFailed: 0,
          totalCostUsd: 0,
          results: [],
        },
      }
    }

    // 2. Create orchestrator
    const orchestrator = new BiographyEnrichmentOrchestrator({
      confidenceThreshold: confidenceThreshold ?? 0.6,
    })

    // 3. Process each actor
    const results: EnrichBiographiesBatchResult["results"] = []
    let totalCostUsd = 0
    let actorsEnriched = 0
    let actorsFailed = 0

    for (const actor of actors) {
      try {
        const result = await orchestrator.enrichActor(actor)
        const costUsd = result.stats.totalCostUsd
        totalCostUsd += costUsd

        if (result.data && result.data.hasSubstantiveContent) {
          const writer = useStaging ? writeBiographyToStaging : writeBiographyToProduction
          await writer(db, actor.id, result.data, result.sources)
          actorsEnriched++
          results.push({ actorId: actor.id, actorName: actor.name, enriched: true, costUsd })
        } else {
          results.push({
            actorId: actor.id,
            actorName: actor.name,
            enriched: false,
            error: result.error || "No substantive content",
            costUsd,
          })
        }

        // Update job progress
        await job.updateProgress(Math.round((results.length / actors.length) * 100))
      } catch (error) {
        actorsFailed++
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        log.error({ actorId: actor.id, error: errorMsg }, "Failed to enrich actor biography")
        results.push({
          actorId: actor.id,
          actorName: actor.name,
          enriched: false,
          error: errorMsg,
          costUsd: 0,
        })
      }
    }

    // Record job completion in New Relic
    newrelic.recordCustomEvent("BioJobComplete", {
      actorsProcessed: actors.length,
      actorsEnriched,
      actorsFailed,
      totalCostUsd,
    })

    return {
      success: true,
      data: {
        actorsProcessed: actors.length,
        actorsEnriched,
        actorsFailed,
        totalCostUsd,
        results,
      },
    }
  }
}
