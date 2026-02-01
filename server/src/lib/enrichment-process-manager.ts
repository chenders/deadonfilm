/**
 * Enrichment Process Manager
 *
 * Manages the lifecycle of enrichment runs using BullMQ:
 * - Creates enrichment runs in database
 * - Enqueues BullMQ jobs for processing
 * - Provides progress updates
 * - Handles job cancellation
 */

import { getPool } from "./db.js"
import newrelic from "newrelic"
import { logger } from "./logger.js"
import { queueManager } from "./jobs/queue-manager.js"
import { JobType } from "./jobs/types.js"

/**
 * Configuration for starting an enrichment run
 */
export interface EnrichmentRunConfig {
  limit?: number
  minPopularity?: number
  recentOnly?: boolean
  actorIds?: number[]
  free?: boolean
  paid?: boolean
  ai?: boolean
  confidence?: number
  maxCostPerActor?: number
  maxTotalCost?: number
  claudeCleanup?: boolean
  gatherAllSources?: boolean
  followLinks?: boolean
  aiLinkSelection?: boolean
  aiContentExtraction?: boolean
  aiModel?: string
  maxLinks?: number
  maxLinkCost?: number
  topBilledYear?: number
  maxBilling?: number
  topMovies?: number
  usActorsOnly?: boolean
  /** Bypass source query cache for fresh data. Default: true for admin API */
  ignoreCache?: boolean
}

/**
 * In-memory store of running enrichment jobs
 * Maps run_id -> jobId
 */
const runningJobs = new Map<number, string>()

/**
 * Start a new enrichment run
 *
 * @param config - Configuration for the enrichment run
 * @returns The ID of the created enrichment run
 */
export async function startEnrichmentRun(config: EnrichmentRunConfig): Promise<number> {
  const pool = getPool()

  try {
    // Create a new enrichment_runs row with status 'pending'
    const result = await pool.query<{ id: number }>(
      `INSERT INTO enrichment_runs (
        status,
        config,
        started_at
      ) VALUES ($1, $2, NOW())
      RETURNING id`,
      ["pending", JSON.stringify(config)]
    )

    const runId = result.rows[0].id

    logger.info({ runId, config }, "Created enrichment run")

    // Record New Relic event
    newrelic.recordCustomEvent("EnrichmentRunCreated", {
      runId,
      limit: config.limit ?? 0,
      maxTotalCost: config.maxTotalCost ?? 0,
      claudeCleanup: config.claudeCleanup || false,
    })

    // Enqueue BullMQ job instead of spawning script
    const jobId = await queueManager.addJob(
      JobType.ENRICH_DEATH_DETAILS_BATCH,
      {
        runId,
        limit: config.limit,
        minPopularity: config.minPopularity,
        actorIds: config.actorIds,
        recentOnly: config.recentOnly,
        free: config.free ?? true,
        paid: config.paid ?? true,
        ai: config.ai ?? false,
        confidence: config.confidence ?? 0.5,
        maxCostPerActor: config.maxCostPerActor,
        maxTotalCost: config.maxTotalCost,
        claudeCleanup: config.claudeCleanup ?? true,
        gatherAllSources: config.gatherAllSources ?? true,
        followLinks: config.followLinks ?? true,
        aiLinkSelection: config.aiLinkSelection ?? true,
        aiContentExtraction: config.aiContentExtraction ?? true,
        aiModel: config.aiModel,
        maxLinks: config.maxLinks,
        maxLinkCost: config.maxLinkCost,
        topBilledYear: config.topBilledYear,
        maxBilling: config.maxBilling,
        topMovies: config.topMovies,
        usActorsOnly: config.usActorsOnly ?? false,
        ignoreCache: config.ignoreCache ?? true, // Default: bypass cache for admin runs
        staging: false,
      },
      { createdBy: "admin-enrichment" }
    )

    // Update database with status 'running'
    await pool.query(
      `UPDATE enrichment_runs
       SET status = 'running'
       WHERE id = $1`,
      [runId]
    )

    logger.info({ runId, jobId }, "Enrichment job enqueued")

    // Store the job ID
    runningJobs.set(runId, jobId)

    return runId
  } catch (error) {
    logger.error({ error }, "Failed to start enrichment run")
    throw error
  }
}

/**
 * Stop a running enrichment run
 *
 * Cancels the BullMQ job and updates the database.
 *
 * @param runId - ID of the enrichment run to stop
 * @returns true if the job was found and cancelled, false otherwise
 */
export async function stopEnrichmentRun(runId: number): Promise<boolean> {
  const pool = getPool()

  logger.info({ runId }, "Stopping enrichment run")

  // Check if the job is in memory
  const jobId = runningJobs.get(runId)

  if (!jobId) {
    // Job not in memory - check database status
    const result = await pool.query<{ status: string }>(
      `SELECT status FROM enrichment_runs WHERE id = $1`,
      [runId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Enrichment run ${runId} not found`)
    }

    const { status } = result.rows[0]

    if (status !== "running" && status !== "pending") {
      throw new Error(`Enrichment run ${runId} is not running (status: ${status})`)
    }

    // Job may have already completed or been orphaned
    // Just update the database status
    await pool.query(
      `UPDATE enrichment_runs
       SET status = 'stopped',
           completed_at = NOW(),
           exit_reason = 'interrupted'
       WHERE id = $1`,
      [runId]
    )

    logger.warn({ runId }, "Job not found in memory, marked as stopped in database")
    return true
  }

  // Job is in memory - cancel it via queue manager
  try {
    const cancelled = await queueManager.cancelJob(jobId)

    if (cancelled) {
      logger.info({ runId, jobId }, "Enrichment job cancelled")
    } else {
      logger.warn({ runId, jobId }, "Job not found in queue, may have already completed")
    }

    // Remove from running jobs map
    runningJobs.delete(runId)

    // Update database to mark as stopped
    await pool.query(
      `UPDATE enrichment_runs
       SET status = 'stopped',
           completed_at = NOW(),
           exit_reason = 'interrupted'
       WHERE id = $1`,
      [runId]
    )

    newrelic.recordCustomEvent("EnrichmentRunStopped", { runId })

    return true
  } catch (error) {
    logger.error({ error, runId, jobId }, "Failed to cancel enrichment job")
    throw error
  }
}

/**
 * Get the current progress of an enrichment run
 *
 * @param runId - ID of the enrichment run
 * @returns Progress information
 */
export async function getEnrichmentRunProgress(runId: number) {
  const pool = getPool()

  const result = await pool.query<{
    status: string
    current_actor_index: number | null
    current_actor_name: string | null
    actors_queried: number
    actors_processed: number
    actors_enriched: number
    total_cost_usd: number
    started_at: Date
  }>(
    `SELECT
      status,
      current_actor_index,
      current_actor_name,
      actors_queried,
      actors_processed,
      actors_enriched,
      total_cost_usd,
      started_at
    FROM enrichment_runs
    WHERE id = $1`,
    [runId]
  )

  if (result.rows.length === 0) {
    throw new Error(`Enrichment run ${runId} not found`)
  }

  const row = result.rows[0]

  // Calculate progress percentage
  const progressPercentage =
    row.actors_queried > 0 ? (row.actors_processed / row.actors_queried) * 100 : 0

  // Calculate elapsed time
  const elapsedMs = Date.now() - new Date(row.started_at).getTime()

  // Estimate time remaining (if running)
  let estimatedTimeRemainingMs: number | null = null
  if (row.status === "running" && row.actors_processed > 0 && row.actors_queried > 0) {
    const msPerActor = elapsedMs / row.actors_processed
    const actorsRemaining = row.actors_queried - row.actors_processed
    estimatedTimeRemainingMs = Math.round(msPerActor * actorsRemaining)
  }

  return {
    status: row.status,
    currentActorIndex: row.current_actor_index,
    currentActorName: row.current_actor_name,
    actorsQueried: row.actors_queried,
    actorsProcessed: row.actors_processed,
    actorsEnriched: row.actors_enriched,
    totalCostUsd: parseFloat(row.total_cost_usd.toString()),
    progressPercentage: Math.round(progressPercentage * 10) / 10, // Round to 1 decimal
    elapsedMs,
    estimatedTimeRemainingMs,
  }
}

/**
 * Get all running enrichment runs
 *
 * @returns Array of running enrichment run IDs
 */
export function getRunningEnrichments(): number[] {
  return Array.from(runningJobs.keys())
}
