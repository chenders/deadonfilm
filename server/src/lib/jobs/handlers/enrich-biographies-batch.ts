/**
 * Batch Biography Enrichment Handler
 *
 * BullMQ job handler that enriches actor biographies using the multi-source
 * biography enrichment orchestrator. Uses the full biography enrichment pipeline
 * with multiple data sources and Claude synthesis.
 *
 * When a runId is provided, tracks per-actor results in bio_enrichment_run_actors
 * and updates bio_enrichment_runs with progress, costs, and source stats.
 */

import newrelic from "newrelic"
import type { Job } from "bullmq"
import { getPool } from "../../db.js"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type EnrichBiographiesBatchPayload } from "../types.js"
import { createBioEnrichmentPipeline } from "../../biography-sources/debriefer/adapter.js"
// RunLogger removed — per-source logs now come from debriefer lifecycle hooks
// via result.logEntries, merged into actorLogs and stored in bio_enrichment_run_actors
import {
  writeBiographyToProduction,
  writeBiographyToStaging,
} from "../../biography-enrichment-db-writer.js"
import { ParallelBatchRunner, BatchCostTracker } from "../../shared/concurrency.js"
import type { ActorForBiography, BiographyResult } from "../../biography-sources/types.js"
import type { Pool } from "pg"

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

/** Log entry stored per-actor in JSONB */
interface LogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  message: string
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
    const {
      runId,
      actorIds,
      limit,
      minPopularity,
      confidenceThreshold,
      maxCostPerActor,
      maxTotalCost,
      earlyStopSourceCount,
      allowRegeneration,
      sortBy,
      useStaging,
      sourceCategories,
      concurrency,
    } = job.data
    const db = getPool()

    // Add New Relic attributes for this job
    for (const [key, value] of Object.entries({
      "bio.job.actorCount": actorIds?.length || limit || 10,
      "bio.job.allowRegeneration": !!allowRegeneration,
      "bio.job.useStaging": !!useStaging,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    try {
      // 1. Query actors
      const actors = await this.queryActors(db, {
        actorIds,
        limit,
        minPopularity,
        allowRegeneration,
        sortBy,
      })

      log.info({ actorCount: actors.length }, "Found actors for biography enrichment")

      // Update run with actors_queried
      if (runId) {
        await db.query(`UPDATE bio_enrichment_runs SET actors_queried = $1 WHERE id = $2`, [
          actors.length,
          runId,
        ])
      }

      if (actors.length === 0) {
        if (runId) {
          await this.completeBioEnrichmentRun(db, runId, {
            actorsProcessed: 0,
            actorsEnriched: 0,
            actorsWithSubstantiveContent: 0,
            totalCostUsd: 0,
            sourceCostUsd: 0,
            synthesisCostUsd: 0,
            exitReason: "no_actors_matched",
            costBySource: {},
            sourceHitRates: {},
            errorCount: 0,
            errors: [],
          })
        }
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

      // 2. Create enrichment pipeline (debriefer adapter + Claude synthesis)
      const enrichActor = createBioEnrichmentPipeline({
        confidenceThreshold: confidenceThreshold ?? 0.6,
        earlyStopThreshold: earlyStopSourceCount === 0 ? Infinity : (earlyStopSourceCount ?? 3),
        maxCostPerActor: maxCostPerActor ?? 0.5,
        maxTotalCost: maxTotalCost ?? 10.0,
        free: sourceCategories?.free ?? true,
        reference: sourceCategories?.reference ?? true,
        webSearch: sourceCategories?.webSearch ?? true,
        news: sourceCategories?.news ?? true,
        obituary: sourceCategories?.obituary ?? true,
        archives: sourceCategories?.archives ?? true,
        books: sourceCategories?.books ?? true,
      })

      // 3. Process actors in parallel using ParallelBatchRunner
      const results: EnrichBiographiesBatchResult["results"] = []
      let totalSourceCost = 0
      let totalSynthesisCost = 0
      let actorsEnriched = 0
      let actorsWithSubstantiveContent = 0
      let actorsFailed = 0
      const costBySource: Record<string, number> = {}
      const sourceAttempts: Record<string, number> = {}
      const sourceSuccesses: Record<string, number> = {}
      const errors: Array<{ actorId: number; actorName: string; error: string }> = []

      // Create cost tracker for batch-level limits
      const costTracker = new BatchCostTracker(maxTotalCost ?? Infinity)

      // Define per-actor processor
      const processActor = async (actor: ActorForBiography): Promise<{ costUsd: number }> => {
        const actorLogs: LogEntry[] = []

        try {
          actorLogs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: `Starting enrichment for ${actor.name}`,
          })

          const result = await enrichActor(actor)
          const costUsd = result.stats.totalCostUsd
          totalSourceCost += result.stats.sourceCostUsd ?? 0
          totalSynthesisCost += result.stats.synthesisCostUsd ?? 0

          // Track source stats
          for (const source of result.sources) {
            const sourceType = source.type
            sourceAttempts[sourceType] = (sourceAttempts[sourceType] || 0) + 1
            if (source.costUsd) {
              costBySource[sourceType] = (costBySource[sourceType] || 0) + source.costUsd
            }
          }
          for (const source of result.sources) {
            if (source.confidence > 0) {
              sourceSuccesses[source.type] = (sourceSuccesses[source.type] || 0) + 1
            }
          }

          // Log source results
          actorLogs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: `Sources: ${result.stats.sourcesSucceeded}/${result.stats.sourcesAttempted} succeeded, cost: $${costUsd.toFixed(4)} (source: $${(result.stats.sourceCostUsd ?? 0).toFixed(4)}, synthesis: $${(result.stats.synthesisCostUsd ?? 0).toFixed(4)})`,
          })

          if (result.data && result.data.hasSubstantiveContent) {
            const writer = useStaging ? writeBiographyToStaging : writeBiographyToProduction
            await writer(db, actor.id, result.data, result.sources)
            actorsEnriched++
            actorsWithSubstantiveContent++

            actorLogs.push({
              timestamp: new Date().toISOString(),
              level: "info",
              message: `Enriched successfully. Confidence: ${result.data.narrativeConfidence || "unknown"}`,
            })

            results.push({ actorId: actor.id, actorName: actor.name, enriched: true, costUsd })
          } else {
            const reason = result.error || "No substantive content"
            actorLogs.push({
              timestamp: new Date().toISOString(),
              level: "warn",
              message: `Not enriched: ${reason}`,
            })
            results.push({
              actorId: actor.id,
              actorName: actor.name,
              enriched: false,
              error: reason,
              costUsd,
            })
          }

          // Merge debriefer per-source log entries with handler-level logs
          if (result.logEntries) {
            actorLogs.push(
              ...result.logEntries.map((le) => ({
                timestamp: le.timestamp,
                level: le.level as LogEntry["level"],
                message: le.message,
              }))
            )
          }

          // Insert per-actor result
          if (runId) {
            try {
              await this.insertActorResult(db, runId, actor, result, actorLogs)
            } catch (trackingError) {
              log.error(
                { error: trackingError, runId, actorId: actor.id },
                "Failed to insert actor result tracking (enrichment still succeeded)"
              )
            }
          }

          return { costUsd }
        } catch (error) {
          actorsFailed++
          const errorMsg = error instanceof Error ? error.message : "Unknown error"
          log.error({ actorId: actor.id, error: errorMsg }, "Failed to enrich actor biography")

          actorLogs.push({
            timestamp: new Date().toISOString(),
            level: "error",
            message: `Error: ${errorMsg}`,
          })

          errors.push({ actorId: actor.id, actorName: actor.name, error: errorMsg })

          results.push({
            actorId: actor.id,
            actorName: actor.name,
            enriched: false,
            error: errorMsg,
            costUsd: 0,
          })

          // Still insert actor result on error
          if (runId) {
            await db.query(
              `INSERT INTO bio_enrichment_run_actors (
                run_id, actor_id, was_enriched, error, log_entries
              ) VALUES ($1, $2, false, $3, $4)
              ON CONFLICT (run_id, actor_id) DO UPDATE SET
                was_enriched = false, error = $3, log_entries = $4`,
              [runId, actor.id, errorMsg, JSON.stringify(actorLogs)]
            )
          }

          return { costUsd: 0 }
        }
      }

      // Run actors in parallel with configurable concurrency
      let actorsCompleted = 0
      const runner = new ParallelBatchRunner<ActorForBiography, { costUsd: number }>({
        concurrency: concurrency ?? 5,
        costTracker,
        getCost: (result) => result.costUsd,
        onItemComplete: async (_actor, _result, progress) => {
          actorsCompleted = progress.completed

          // Update run progress in DB
          if (runId) {
            try {
              await this.updateRunProgress(
                db,
                runId,
                progress.completed,
                `${progress.inFlight} actors in flight`,
                {
                  actorsProcessed: progress.completed,
                  actorsEnriched,
                  totalCostUsd: costTracker.getTotalCost(),
                  sourceCostUsd: totalSourceCost,
                  synthesisCostUsd: totalSynthesisCost,
                }
              )
            } catch (progressError) {
              log.warn(
                { error: progressError, runId, completed: progress.completed },
                "Failed to update run progress"
              )
            }
          }

          // Update job progress percentage
          await job.updateProgress(Math.round((progress.completed / actors.length) * 100))
        },
      })

      await runner.run(actors, processActor)

      const totalCostUsd = costTracker.getTotalCost()
      const costLimitReached = costTracker.isLimitExceeded()

      // If cost limit was hit, complete the run with cost_limit exit reason
      if (costLimitReached) {
        log.info({ totalCostUsd, maxTotalCost }, "Batch total cost limit reached")
        if (runId) {
          await this.completeBioEnrichmentRun(db, runId, {
            actorsProcessed: actorsCompleted,
            actorsEnriched,
            actorsWithSubstantiveContent,
            totalCostUsd,
            sourceCostUsd: totalSourceCost,
            synthesisCostUsd: totalSynthesisCost,
            exitReason: "cost_limit",
            costBySource,
            sourceHitRates: this.computeHitRates(sourceAttempts, sourceSuccesses),
            errorCount: errors.length,
            errors,
          })
        }
        return {
          success: true,
          data: {
            actorsProcessed: actorsCompleted,
            actorsEnriched,
            actorsFailed,
            totalCostUsd,
            results,
          },
        }
      }

      // Complete the run
      if (runId) {
        try {
          await this.completeBioEnrichmentRun(db, runId, {
            actorsProcessed: actors.length,
            actorsEnriched,
            actorsWithSubstantiveContent,
            totalCostUsd,
            sourceCostUsd: totalSourceCost,
            synthesisCostUsd: totalSynthesisCost,
            exitReason: "completed",
            costBySource,
            sourceHitRates: this.computeHitRates(sourceAttempts, sourceSuccesses),
            errorCount: errors.length,
            errors,
          })
        } catch (completionError) {
          log.error(
            { error: completionError, runId },
            "Failed to mark bio enrichment run as completed"
          )
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error"
      if (runId) {
        try {
          await this.markRunAsFailed(db, runId, errorMsg)
        } catch (failError) {
          log.error({ error: failError, runId }, "Failed to mark bio enrichment run as failed")
        }
      }
      throw error
    }
  }

  private async queryActors(
    db: Pool,
    opts: {
      actorIds?: number[]
      limit?: number
      minPopularity?: number
      allowRegeneration?: boolean
      sortBy?: "popularity" | "interestingness"
    }
  ): Promise<ActorForBiography[]> {
    if (opts.actorIds && opts.actorIds.length > 0) {
      const placeholders = opts.actorIds.map((_, i) => `$${i + 1}`).join(", ")
      const result = await db.query(
        `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
                wikipedia_url, biography_raw_tmdb, biography
         FROM actors
         WHERE id IN (${placeholders})
         ${!opts.allowRegeneration ? "AND id NOT IN (SELECT actor_id FROM actor_biography_details)" : ""}`,
        opts.actorIds
      )
      return result.rows
    }

    const params: unknown[] = []
    let paramIndex = 1
    let whereClause = "WHERE deathday IS NOT NULL"

    if (!opts.allowRegeneration) {
      whereClause += " AND id NOT IN (SELECT actor_id FROM actor_biography_details)"
    }

    if (opts.minPopularity !== undefined) {
      whereClause += ` AND COALESCE(dof_popularity, 0) >= $${paramIndex++}`
      params.push(opts.minPopularity)
    }

    const limitValue = opts.limit || 10
    params.push(limitValue)

    const orderByClause =
      opts.sortBy === "interestingness"
        ? "ORDER BY interestingness_score DESC NULLS LAST, id ASC"
        : "ORDER BY dof_popularity DESC NULLS LAST, id ASC"

    const result = await db.query(
      `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
              wikipedia_url, biography_raw_tmdb, biography
       FROM actors
       ${whereClause}
       ${orderByClause}
       LIMIT $${paramIndex}`,
      params
    )
    return result.rows
  }

  private async insertActorResult(
    db: Pool,
    runId: number,
    actor: ActorForBiography,
    result: BiographyResult,
    logEntries: LogEntry[]
  ): Promise<void> {
    const sourcesAttempted = result.sources.map((s) => ({
      source: s.type,
      success: s.confidence > 0,
      costUsd: s.costUsd || 0,
      confidence: s.confidence,
      reliabilityScore: s.reliabilityScore || null,
      error: s.error || null,
    }))

    await db.query(
      `INSERT INTO bio_enrichment_run_actors (
        run_id, actor_id, was_enriched, has_substantive_content,
        narrative_confidence, sources_attempted, sources_succeeded,
        synthesis_model, processing_time_ms, cost_usd,
        source_cost_usd, synthesis_cost_usd, error, log_entries
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (run_id, actor_id) DO UPDATE SET
        was_enriched = $3, has_substantive_content = $4,
        narrative_confidence = $5, sources_attempted = $6,
        sources_succeeded = $7, synthesis_model = $8,
        processing_time_ms = $9, cost_usd = $10,
        source_cost_usd = $11, synthesis_cost_usd = $12,
        error = $13, log_entries = $14`,
      [
        runId,
        actor.id,
        result.data?.hasSubstantiveContent ? true : false,
        result.data?.hasSubstantiveContent || false,
        result.data?.narrativeConfidence || null,
        JSON.stringify(sourcesAttempted),
        result.stats.sourcesSucceeded,
        null, // synthesis_model tracked at orchestrator level
        result.stats.processingTimeMs,
        result.stats.totalCostUsd,
        result.stats.sourceCostUsd ?? 0,
        result.stats.synthesisCostUsd ?? 0,
        result.error || null,
        JSON.stringify(logEntries),
      ]
    )
  }

  private async updateRunProgress(
    db: Pool,
    runId: number,
    actorIndex: number,
    actorName: string,
    stats: {
      actorsProcessed: number
      actorsEnriched: number
      totalCostUsd: number
      sourceCostUsd: number
      synthesisCostUsd: number
    }
  ): Promise<void> {
    await db.query(
      `UPDATE bio_enrichment_runs SET
        current_actor_index = $1,
        current_actor_name = $2,
        actors_processed = $3,
        actors_enriched = $4,
        total_cost_usd = $5,
        source_cost_usd = $6,
        synthesis_cost_usd = $7
      WHERE id = $8`,
      [
        actorIndex,
        actorName,
        stats.actorsProcessed,
        stats.actorsEnriched,
        stats.totalCostUsd,
        stats.sourceCostUsd,
        stats.synthesisCostUsd,
        runId,
      ]
    )
  }

  private async completeBioEnrichmentRun(
    db: Pool,
    runId: number,
    stats: {
      actorsProcessed: number
      actorsEnriched: number
      actorsWithSubstantiveContent: number
      totalCostUsd: number
      sourceCostUsd: number
      synthesisCostUsd: number
      exitReason: string
      costBySource: Record<string, number>
      sourceHitRates: Record<string, number>
      errorCount: number
      errors: Array<{ actorId: number; actorName: string; error: string }>
    }
  ): Promise<void> {
    const fillRate =
      stats.actorsProcessed > 0
        ? Math.round((stats.actorsEnriched / stats.actorsProcessed) * 10000) / 100
        : 0

    await db.query(
      `UPDATE bio_enrichment_runs SET
        status = 'completed',
        completed_at = NOW(),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
        actors_processed = $1,
        actors_enriched = $2,
        actors_with_substantive_content = $3,
        fill_rate = $4,
        total_cost_usd = $5,
        source_cost_usd = $6,
        synthesis_cost_usd = $7,
        exit_reason = $8,
        cost_by_source = $9,
        source_hit_rates = $10,
        error_count = $11,
        errors = $12,
        current_actor_index = NULL,
        current_actor_name = NULL
      WHERE id = $13`,
      [
        stats.actorsProcessed,
        stats.actorsEnriched,
        stats.actorsWithSubstantiveContent,
        fillRate,
        stats.totalCostUsd,
        stats.sourceCostUsd,
        stats.synthesisCostUsd,
        stats.exitReason,
        JSON.stringify(stats.costBySource),
        JSON.stringify(stats.sourceHitRates),
        stats.errorCount,
        JSON.stringify(stats.errors),
        runId,
      ]
    )
  }

  private async markRunAsFailed(db: Pool, runId: number, error: string): Promise<void> {
    await db.query(
      `UPDATE bio_enrichment_runs SET
        status = 'failed',
        completed_at = NOW(),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
        exit_reason = 'error',
        errors = jsonb_build_array(jsonb_build_object('error', $1::text)),
        error_count = 1,
        current_actor_index = NULL,
        current_actor_name = NULL
      WHERE id = $2`,
      [error, runId]
    )
  }

  private computeHitRates(
    attempts: Record<string, number>,
    successes: Record<string, number>
  ): Record<string, number> {
    const rates: Record<string, number> = {}
    for (const [source, attempted] of Object.entries(attempts)) {
      const succeeded = successes[source] || 0
      rates[source] = attempted > 0 ? Math.round((succeeded / attempted) * 10000) / 100 : 0
    }
    return rates
  }
}
