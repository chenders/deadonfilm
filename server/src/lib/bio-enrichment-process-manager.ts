/**
 * Bio Enrichment Process Manager
 *
 * Manages the lifecycle of biography enrichment runs using BullMQ:
 * - Creates bio_enrichment_runs in database
 * - Enqueues BullMQ jobs for processing
 * - Provides progress updates
 * - Handles job cancellation
 *
 * Pattern: server/src/lib/enrichment-process-manager.ts
 */

import { getPool } from "./db.js"
import { logger } from "./logger.js"
import { queueManager } from "./jobs/queue-manager.js"
import { JobType } from "./jobs/types.js"
import newrelic from "newrelic"

/**
 * Configuration for starting a bio enrichment run
 */
export interface BioEnrichmentRunConfig {
  limit?: number
  minPopularity?: number
  actorIds?: number[]
  confidenceThreshold?: number
  maxCostPerActor?: number
  maxTotalCost?: number
  allowRegeneration?: boolean
  sourceCategories?: {
    free?: boolean
    reference?: boolean
    webSearch?: boolean
    news?: boolean
    obituary?: boolean
    archives?: boolean
  }
}

/**
 * In-memory store of running bio enrichment jobs
 * Maps run_id -> jobId
 */
const runningJobs = new Map<number, string>()

/**
 * Start a new bio enrichment run
 */
export async function startBioEnrichmentRun(config: BioEnrichmentRunConfig): Promise<number> {
  const pool = getPool()

  try {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO bio_enrichment_runs (
        status,
        config,
        started_at
      ) VALUES ($1, $2, NOW())
      RETURNING id`,
      ["pending", JSON.stringify(config)]
    )

    const runId = result.rows[0].id

    logger.info({ runId, config }, "Created bio enrichment run")

    // Enqueue BullMQ job with runId
    const jobId = await queueManager.addJob(
      JobType.ENRICH_BIOGRAPHIES_BATCH,
      {
        runId,
        limit: config.limit,
        minPopularity: config.minPopularity,
        actorIds: config.actorIds,
        confidenceThreshold: config.confidenceThreshold ?? 0.6,
        maxCostPerActor: config.maxCostPerActor,
        maxTotalCost: config.maxTotalCost,
        allowRegeneration: config.allowRegeneration ?? false,
        useStaging: false,
        sourceCategories: config.sourceCategories
          ? {
              free: config.sourceCategories.free ?? true,
              reference: config.sourceCategories.reference ?? true,
              webSearch: config.sourceCategories.webSearch ?? true,
              news: config.sourceCategories.news ?? true,
              obituary: config.sourceCategories.obituary ?? true,
              archives: config.sourceCategories.archives ?? true,
            }
          : undefined,
      },
      { createdBy: "admin-bio-enrichment" }
    )

    // Update database with status 'running'
    await pool.query(
      `UPDATE bio_enrichment_runs
       SET status = 'running'
       WHERE id = $1`,
      [runId]
    )

    logger.info({ runId, jobId }, "Bio enrichment job enqueued")

    // Store the job ID
    runningJobs.set(runId, jobId)

    newrelic.recordCustomEvent("BioEnrichmentRunCreated", {
      runId,
      limit: config.limit ?? 0,
      minPopularity: config.minPopularity ?? 0,
      actorCount: config.actorIds?.length ?? 0,
    })

    return runId
  } catch (error) {
    logger.error({ error }, "Failed to start bio enrichment run")
    throw error
  }
}

/**
 * Stop a running bio enrichment run
 */
export async function stopBioEnrichmentRun(runId: number): Promise<boolean> {
  const pool = getPool()

  logger.info({ runId }, "Stopping bio enrichment run")

  const jobId = runningJobs.get(runId)

  if (!jobId) {
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM bio_enrichment_runs WHERE id = $1`,
      [runId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Bio enrichment run ${runId} not found`)
    }

    const { status } = result.rows[0]

    if (status !== "running" && status !== "pending") {
      throw new Error(`Bio enrichment run ${runId} is not running (status: ${status})`)
    }

    await pool.query(
      `UPDATE bio_enrichment_runs
       SET status = 'stopped',
           completed_at = NOW(),
           exit_reason = 'interrupted'
       WHERE id = $1`,
      [runId]
    )

    logger.warn({ runId }, "Bio enrichment job not found in memory, marked as stopped")
    return true
  }

  try {
    const cancelled = await queueManager.cancelJob(jobId)

    if (cancelled) {
      logger.info({ runId, jobId }, "Bio enrichment job cancelled")
    } else {
      logger.warn({ runId, jobId }, "Bio enrichment job not found in queue")
    }

    runningJobs.delete(runId)

    await pool.query(
      `UPDATE bio_enrichment_runs
       SET status = 'stopped',
           completed_at = NOW(),
           exit_reason = 'interrupted'
       WHERE id = $1`,
      [runId]
    )

    newrelic.recordCustomEvent("BioEnrichmentRunStopped", { runId })

    return true
  } catch (error) {
    logger.error({ error, runId, jobId }, "Failed to cancel bio enrichment job")
    throw error
  }
}

/**
 * Get the current progress of a bio enrichment run
 */
export async function getBioEnrichmentRunProgress(runId: number) {
  const pool = getPool()

  const result = await pool.query<{
    status: string
    current_actor_index: number | null
    current_actor_name: string | null
    actors_queried: number
    actors_processed: number
    actors_enriched: number
    actors_with_substantive_content: number
    total_cost_usd: number
    synthesis_cost_usd: number
    source_cost_usd: number
    started_at: Date
  }>(
    `SELECT
      status,
      current_actor_index,
      current_actor_name,
      actors_queried,
      actors_processed,
      actors_enriched,
      actors_with_substantive_content,
      total_cost_usd,
      synthesis_cost_usd,
      source_cost_usd,
      started_at
    FROM bio_enrichment_runs
    WHERE id = $1`,
    [runId]
  )

  if (result.rows.length === 0) {
    throw new Error(`Bio enrichment run ${runId} not found`)
  }

  const row = result.rows[0]

  const actorsQueried = row.actors_queried ?? 0
  const actorsProcessed = row.actors_processed ?? 0
  const progressPercentage = actorsQueried > 0 ? (actorsProcessed / actorsQueried) * 100 : 0

  const elapsedMs = Date.now() - new Date(row.started_at).getTime()

  let estimatedTimeRemainingMs: number | null = null
  if (row.status === "running" && actorsProcessed > 0 && actorsQueried > 0) {
    const msPerActor = elapsedMs / actorsProcessed
    const actorsRemaining = actorsQueried - actorsProcessed
    estimatedTimeRemainingMs = Math.round(msPerActor * actorsRemaining)
  }

  return {
    status: row.status,
    currentActorIndex: row.current_actor_index,
    currentActorName: row.current_actor_name,
    actorsQueried,
    actorsProcessed,
    actorsEnriched: row.actors_enriched ?? 0,
    actorsWithSubstantiveContent: row.actors_with_substantive_content ?? 0,
    totalCostUsd: parseFloat((row.total_cost_usd ?? 0).toString()),
    synthesisCostUsd: parseFloat((row.synthesis_cost_usd ?? 0).toString()),
    sourceCostUsd: parseFloat((row.source_cost_usd ?? 0).toString()),
    progressPercentage: Math.round(progressPercentage * 10) / 10,
    elapsedMs,
    estimatedTimeRemainingMs,
  }
}

/**
 * Get all running bio enrichment runs
 */
export function getRunningBioEnrichments(): number[] {
  return Array.from(runningJobs.keys())
}
