/**
 * Enrichment Process Manager
 *
 * Manages the lifecycle of enrichment script executions:
 * - Spawns enrichment script as a child process
 * - Tracks process status in database
 * - Provides progress updates
 * - Handles graceful shutdown
 */

import { spawn, type ChildProcess } from "child_process"
import { getPool } from "./db.js"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import newrelic from "newrelic"
import { logger } from "./logger.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Determine if we're running in production mode.
 * Uses the standard NODE_ENV convention used throughout the codebase.
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production"
}

/**
 * Get the script path and command for running the enrichment script.
 * In development: use tsx to run .ts files from scripts/
 * In production: use node to run compiled .js files from dist/scripts/
 */
function getScriptCommand(): { command: string; args: string[]; scriptPath: string; cwd: string } {
  const serverRoot = join(__dirname, "..", "..")

  if (isProduction()) {
    // Production: run compiled JS with node and New Relic instrumentation
    const scriptPath = join(serverRoot, "dist/scripts/enrich-death-details.js")
    return {
      command: "node",
      args: ["--import", "newrelic/esm-loader.mjs", scriptPath],
      scriptPath,
      cwd: serverRoot,
    }
  } else {
    // Development: run TypeScript source with tsx
    const scriptPath = join(serverRoot, "scripts/enrich-death-details.ts")
    return {
      command: "npx",
      args: ["tsx", scriptPath],
      scriptPath,
      cwd: serverRoot,
    }
  }
}

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
  stopOnMatch?: boolean
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
}

/**
 * In-memory store of running enrichment processes
 * Maps run_id -> ChildProcess
 */
const runningProcesses = new Map<number, ChildProcess>()

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

    // Build command line arguments for the enrichment script
    const scriptArgs = buildScriptArgs(config)
    scriptArgs.push("--run-id", runId.toString())
    scriptArgs.push("--yes") // Skip confirmation prompt

    // Get the appropriate command and path for dev vs production
    const { command, args: baseArgs, scriptPath, cwd } = getScriptCommand()
    const fullArgs = [...baseArgs, ...scriptArgs]

    // Spawn the enrichment process
    logger.info(
      { runId, command, args: fullArgs, scriptPath, cwd, isProduction: isProduction() },
      "Spawning enrichment process"
    )

    const child = spawn(command, fullArgs, {
      cwd,
      env: {
        ...process.env,
        // Ensure the script has access to environment variables
      },
      stdio: ["ignore", "pipe", "pipe"], // Capture stdout and stderr
    })

    // Update database with process_id and status 'running'
    await pool.query(
      `UPDATE enrichment_runs
       SET status = 'running',
           process_id = $1
       WHERE id = $2`,
      [child.pid, runId]
    )

    logger.info({ runId, pid: child.pid }, "Enrichment process started")

    // Store the child process
    runningProcesses.set(runId, child)

    // Set up event handlers for the child process
    setupProcessHandlers(child, runId)

    return runId
  } catch (error) {
    logger.error({ error }, "Failed to start enrichment run")
    throw error
  }
}

/**
 * Build command line arguments for the enrichment script
 */
function buildScriptArgs(config: EnrichmentRunConfig): string[] {
  const args: string[] = []

  if (config.limit !== undefined) {
    args.push("--limit", config.limit.toString())
  }

  if (config.minPopularity !== undefined) {
    args.push("--min-popularity", config.minPopularity.toString())
  }

  if (config.recentOnly) {
    args.push("--recent-only")
  }

  if (config.actorIds && config.actorIds.length > 0) {
    args.push("--actor-id", config.actorIds.join(","))
  }

  if (config.free) {
    args.push("--free")
  }

  if (config.paid) {
    args.push("--paid")
  }

  if (config.ai) {
    args.push("--ai")
  }

  if (config.stopOnMatch) {
    args.push("--stop-on-match")
  }

  if (config.confidence !== undefined) {
    args.push("--confidence", config.confidence.toString())
  }

  if (config.maxCostPerActor !== undefined) {
    args.push("--max-cost-per-actor", config.maxCostPerActor.toString())
  }

  if (config.maxTotalCost !== undefined) {
    args.push("--max-total-cost", config.maxTotalCost.toString())
  }

  if (config.claudeCleanup) {
    args.push("--claude-cleanup")
  }

  if (config.gatherAllSources) {
    args.push("--gather-all-sources")
  }

  if (config.followLinks) {
    args.push("--follow-links")
  }

  if (config.aiLinkSelection) {
    args.push("--ai-link-selection")
  }

  if (config.aiContentExtraction) {
    args.push("--ai-content-extraction")
  }

  if (config.aiModel) {
    args.push("--ai-model", config.aiModel)
  }

  if (config.maxLinks !== undefined) {
    args.push("--max-links", config.maxLinks.toString())
  }

  if (config.maxLinkCost !== undefined) {
    args.push("--max-link-cost", config.maxLinkCost.toString())
  }

  if (config.topBilledYear !== undefined) {
    args.push("--top-billed-year", config.topBilledYear.toString())
  }

  if (config.maxBilling !== undefined) {
    args.push("--max-billing", config.maxBilling.toString())
  }

  if (config.topMovies !== undefined) {
    args.push("--top-movies", config.topMovies.toString())
  }

  if (config.usActorsOnly) {
    args.push("--us-actors-only")
  }

  return args
}

/**
 * Set up event handlers for the child process
 */
function setupProcessHandlers(child: ChildProcess, runId: number): void {
  const pool = getPool()

  // Capture stdout for logging (optional - for debugging)
  child.stdout?.on("data", (data) => {
    logger.debug({ runId, output: data.toString() }, "Enrichment script output")
  })

  // Capture stderr for errors
  child.stderr?.on("data", (data) => {
    logger.error({ runId, error: data.toString() }, "Enrichment script error output")
  })

  // Handle process exit
  child.on("exit", async (code, signal) => {
    logger.info({ runId, code, signal }, "Enrichment process exited")

    // Remove from running processes map
    runningProcesses.delete(runId)

    // The enrichment script should update the database on completion
    // But if the process crashes, we need to mark it as failed
    if (code !== 0) {
      try {
        await pool.query(
          `UPDATE enrichment_runs
           SET status = 'failed',
               completed_at = NOW(),
               exit_reason = 'error',
               process_id = NULL
           WHERE id = $1 AND status = 'running'`,
          [runId]
        )

        newrelic.recordCustomEvent("EnrichmentRunFailed", {
          runId,
          exitCode: code ?? -1,
          signal: signal ?? "none",
        })
      } catch (error) {
        logger.error({ error, runId }, "Failed to update enrichment run status on process exit")
      }
    }
  })

  // Handle process errors
  child.on("error", async (error) => {
    logger.error({ error, runId }, "Enrichment process error")

    runningProcesses.delete(runId)

    try {
      await pool.query(
        `UPDATE enrichment_runs
         SET status = 'failed',
             completed_at = NOW(),
             exit_reason = 'error',
             process_id = NULL,
             errors = jsonb_set(
               COALESCE(errors, '[]'::jsonb),
               '{999999}',
               to_jsonb($2::text)
             )
         WHERE id = $1`,
        [runId, error.message]
      )

      newrelic.recordCustomEvent("EnrichmentRunError", {
        runId,
        error: error.message,
      })
    } catch (dbError) {
      logger.error({ error: dbError, runId }, "Failed to update enrichment run status on error")
    }
  })
}

/**
 * Stop a running enrichment run
 *
 * Sends SIGTERM to the process to allow graceful shutdown.
 * The enrichment script should handle SIGTERM and update the database.
 *
 * @param runId - ID of the enrichment run to stop
 * @returns true if the process was found and signaled, false otherwise
 */
export async function stopEnrichmentRun(runId: number): Promise<boolean> {
  const pool = getPool()

  logger.info({ runId }, "Stopping enrichment run")

  // Check if the process is running
  const child = runningProcesses.get(runId)

  if (!child) {
    // Process not in memory - check database
    const result = await pool.query<{ process_id: number | null; status: string }>(
      `SELECT process_id, status FROM enrichment_runs WHERE id = $1`,
      [runId]
    )

    if (result.rows.length === 0) {
      throw new Error(`Enrichment run ${runId} not found`)
    }

    const { process_id, status } = result.rows[0]

    if (status !== "running") {
      throw new Error(`Enrichment run ${runId} is not running (status: ${status})`)
    }

    if (!process_id) {
      throw new Error(`Enrichment run ${runId} has no process_id`)
    }

    // Try to kill the process by PID (may fail if process already exited)
    try {
      process.kill(process_id, "SIGTERM")
      logger.info({ runId, pid: process_id }, "Sent SIGTERM to enrichment process")

      // Update database to mark as stopped
      await pool.query(
        `UPDATE enrichment_runs
         SET status = 'stopped',
             completed_at = NOW(),
             exit_reason = 'interrupted',
             process_id = NULL
         WHERE id = $1`,
        [runId]
      )

      return true
    } catch (error) {
      logger.error({ error, runId, pid: process_id }, "Failed to kill enrichment process")
      throw new Error(`Failed to stop enrichment run ${runId}: process may have already exited`)
    }
  }

  // Process is in memory - send SIGTERM
  try {
    child.kill("SIGTERM")
    logger.info({ runId, pid: child.pid }, "Sent SIGTERM to enrichment process")

    // Update database to mark as stopped
    await pool.query(
      `UPDATE enrichment_runs
       SET status = 'stopped',
           completed_at = NOW(),
           exit_reason = 'interrupted',
           process_id = NULL
       WHERE id = $1`,
      [runId]
    )

    newrelic.recordCustomEvent("EnrichmentRunStopped", { runId })

    return true
  } catch (error) {
    logger.error({ error, runId }, "Failed to send SIGTERM to enrichment process")
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
  return Array.from(runningProcesses.keys())
}
