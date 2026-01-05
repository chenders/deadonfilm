#!/usr/bin/env tsx
/**
 * Continuous runner for cause of death batch processing.
 *
 * This script wraps the submit/status/process workflow and runs continuously
 * until all actors are processed or the user presses Ctrl-C.
 *
 * Usage:
 *   npm run backfill:cause-of-death-runner -- --limit 100
 *   npm run backfill:cause-of-death-runner -- --limit 50 --poll-interval 30
 *   npm run backfill:cause-of-death-runner -- --quiet --no-pause  # Run silently without stops
 *
 * Options:
 *   --limit <n>           Number of actors per batch (default: 100)
 *   --poll-interval <s>   Seconds between status checks (default: 60)
 *   --dry-run             Preview without submitting or processing
 *   --quiet               Suppress per-actor output (default: verbose)
 *   --no-pause            Run continuously without pausing between batches (default: pause)
 *   --all                 Process ALL deceased actors (not just those missing cause)
 */

import "dotenv/config"
import Anthropic from "@anthropic-ai/sdk"
import { Command } from "commander"
import * as readline from "readline"
import { getPool, resetPool } from "../src/lib/db.js"
import { initNewRelic, recordCustomEvent } from "../src/lib/newrelic.js"
import {
  loadCheckpoint,
  saveCheckpoint,
  deleteCheckpoint,
  parsePositiveInt,
  stripMarkdownCodeFences,
  getYearFromDate,
  storeFailure,
  type Checkpoint,
} from "./backfill-cause-of-death-batch.js"

// Initialize New Relic for monitoring
initNewRelic()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function promptToContinue(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`\n${message} [Y/n/q]: `, (answer) => {
      rl.close()
      const lower = answer.toLowerCase().trim()
      if (lower === "q" || lower === "quit") {
        console.log("\nQuitting...")
        process.exit(0)
      }
      resolve(lower === "y" || lower === "yes" || lower === "")
    })
  })
}

/**
 * Global flag controlling per-actor output in processResults().
 * When true (default), shows cause/details for each processed actor.
 * Set via --quiet flag which inverts this to false.
 * Must be global because processResults is an exported function used by tests.
 */
let verboseMode = false

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${mins}m`
}

interface BatchStatus {
  processing_status: string
  request_counts: {
    processing: number
    succeeded: number
    errored: number
    canceled: number
    expired: number
  }
  ended_at?: string
}

interface ActorToProcess {
  id: number
  tmdb_id: number
  name: string
  birthday: Date | string | null
  deathday: Date | string | null
}

let isShuttingDown = false

async function run(options: {
  limit: number
  pollInterval: number
  dryRun: boolean
  verbose: boolean
  pause: boolean
  all: boolean
}): Promise<void> {
  const { limit, pollInterval, dryRun, verbose, pause, all } = options

  // Set global verbose mode for use in processResults
  verboseMode = verbose

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  // Show mode info
  console.log(`\n${"=".repeat(60)}`)
  console.log(`CAUSE OF DEATH BATCH RUNNER`)
  console.log(`${"=".repeat(60)}`)
  console.log(`Mode: ${all ? "ALL deceased actors" : "Only missing cause of death"}`)
  console.log(`Batch size: ${limit}`)
  console.log(`Verbose: ${verbose}`)
  console.log(`Pause between batches: ${pause}`)
  if (dryRun) console.log(`*** DRY RUN - no changes will be made ***`)

  if (!process.env.ANTHROPIC_API_KEY && !dryRun) {
    console.error("ANTHROPIC_API_KEY environment variable is required")
    process.exit(1)
  }

  const anthropic = dryRun ? null : new Anthropic()
  const startTime = Date.now()
  let totalProcessed = 0
  let batchCount = 0

  console.log(`\n${"=".repeat(60)}`)
  console.log(`Cause of Death Batch Runner`)
  console.log(`${"=".repeat(60)}`)
  console.log(`Limit per batch: ${limit}`)
  console.log(`Poll interval: ${pollInterval}s`)
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`)
  console.log(`Press Ctrl-C to stop after current batch completes`)
  console.log(`${"=".repeat(60)}\n`)

  if (!dryRun) {
    recordCustomEvent("CauseOfDeathRunnerStarted", {
      limit,
      pollInterval,
    })
  }

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    if (isShuttingDown) {
      console.log("\nForce quitting...")
      process.exit(1)
    }
    console.log("\n\nReceived Ctrl-C. Will stop after current batch completes...")
    console.log("Press Ctrl-C again to force quit.")
    isShuttingDown = true
  })

  while (!isShuttingDown) {
    batchCount++

    // Count remaining actors before each batch
    const db = getPool()
    const countQuery = all
      ? `SELECT COUNT(*) as count FROM actors WHERE deathday IS NOT NULL`
      : `SELECT COUNT(*) as count
         FROM actors
         WHERE deathday IS NOT NULL
           AND cause_of_death IS NULL
           AND cause_of_death_checked_at IS NULL`
    const countResult = await db.query<{ count: string }>(countQuery)
    const remaining = parseInt(countResult.rows[0].count, 10)
    await resetPool()

    console.log(`\n${"─".repeat(60)}`)
    console.log(`BATCH #${batchCount} | Remaining actors: ${remaining.toLocaleString()}`)
    console.log(`${"─".repeat(60)}`)

    if (remaining === 0) {
      console.log("\nNo more actors need processing. All done!")
      break
    }

    // Step 1: Check for existing batch or submit new one
    let checkpoint = loadCheckpoint()
    let batchId: string | null = checkpoint?.batchId || null

    if (!batchId) {
      // Submit a new batch
      console.log(`\n[1/3] Submitting batch (limit: ${limit})...`)

      const db = getPool()
      const selectQuery = all
        ? `SELECT id, tmdb_id, name, birthday, deathday
           FROM actors
           WHERE deathday IS NOT NULL
           ORDER BY popularity DESC NULLS LAST
           LIMIT $1`
        : `SELECT id, tmdb_id, name, birthday, deathday
           FROM actors
           WHERE deathday IS NOT NULL
             AND cause_of_death IS NULL
             AND cause_of_death_checked_at IS NULL
           ORDER BY popularity DESC NULLS LAST
           LIMIT $1`
      const result = await db.query<ActorToProcess>(selectQuery, [limit])

      if (result.rows.length === 0) {
        console.log("\nNo more actors need processing. All done!")
        await resetPool()
        break
      }

      console.log(`Found ${result.rows.length} actors to process`)

      if (dryRun) {
        console.log("\n[DRY RUN] Would submit batch with:")
        for (const actor of result.rows.slice(0, 5)) {
          console.log(`  - ${actor.name} (ID: ${actor.id})`)
        }
        if (result.rows.length > 5) {
          console.log(`  ... and ${result.rows.length - 5} more`)
        }
        await resetPool()

        // Simulate some work in dry run
        totalProcessed += result.rows.length
        console.log(`\n[DRY RUN] Simulating batch completion...`)
        await sleep(2000)
        continue
      }

      // Build and submit batch requests
      const requests = result.rows.map((actor) => ({
        custom_id: `actor-${actor.id}`,
        params: {
          model: "claude-opus-4-5-20251101",
          max_tokens: 300,
          messages: [
            {
              role: "user" as const,
              content: buildPrompt(actor),
            },
          ],
        },
      }))

      try {
        const batch = await anthropic!.messages.batches.create({ requests })
        batchId = batch.id
        console.log(`Batch submitted: ${batchId}`)

        // Save checkpoint
        checkpoint = {
          batchId,
          processedActorIds: [],
          startedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          stats: {
            submitted: result.rows.length,
            succeeded: 0,
            errored: 0,
            expired: 0,
            updatedCause: 0,
            updatedDetails: 0,
            updatedBirthday: 0,
            updatedDeathday: 0,
            updatedManner: 0,
            updatedCategories: 0,
            updatedCircumstances: 0,
            createdCircumstancesRecord: 0,
          },
        }
        saveCheckpoint(checkpoint)

        recordCustomEvent("CauseOfDeathBatchSubmitted", {
          batchId: batch.id,
          actorCount: result.rows.length,
          batchNumber: batchCount,
        })
      } catch (error) {
        recordCustomEvent("CauseOfDeathRunnerError", {
          operation: "submit",
          batchNumber: batchCount,
          error: error instanceof Error ? error.message : "Unknown error",
        })
        console.error("Error submitting batch:", error)
        await resetPool()
        process.exit(1)
      }

      await resetPool()
    } else {
      console.log(`\n[1/3] Resuming existing batch: ${batchId}`)
    }

    // Step 2: Poll status until complete
    console.log(`\n[2/3] Waiting for batch to complete...`)

    let status: BatchStatus | null = null

    while (!isShuttingDown) {
      try {
        status = (await anthropic!.messages.batches.retrieve(batchId!)) as BatchStatus

        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const { processing, succeeded, errored } = status.request_counts

        process.stdout.write(
          `\r  Status: ${status.processing_status} | ` +
            `Processing: ${processing} | Succeeded: ${succeeded} | Errored: ${errored} | ` +
            `Elapsed: ${formatDuration(elapsed)}    `
        )

        if (status.processing_status === "ended") {
          console.log() // New line after status
          break
        }

        await sleep(pollInterval * 1000)
      } catch (error) {
        console.error("\nError checking status:", error)
        await sleep(pollInterval * 1000)
      }
    }

    if (isShuttingDown) {
      console.log("\n\nShutdown requested. Batch will resume on next run.")
      break
    }

    // Step 3: Process results
    console.log(`\n[3/3] Processing results...`)

    try {
      const batchProcessed = await processResults(anthropic!, batchId!, checkpoint!)
      totalProcessed += batchProcessed

      // Clean up checkpoint on success
      deleteCheckpoint()
      console.log(`\nBatch #${batchCount} complete: ${batchProcessed} actors processed`)

      recordCustomEvent("CauseOfDeathBatchProcessed", {
        batchId: batchId!,
        batchNumber: batchCount,
        processed: batchProcessed,
        succeeded: checkpoint!.stats.succeeded,
        errored: checkpoint!.stats.errored,
        expired: checkpoint!.stats.expired,
        updatedCause: checkpoint!.stats.updatedCause,
        updatedDetails: checkpoint!.stats.updatedDetails,
      })
    } catch (error) {
      recordCustomEvent("CauseOfDeathRunnerError", {
        operation: "process",
        batchId: batchId!,
        batchNumber: batchCount,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      console.error("Error processing results:", error)
      console.log("Batch checkpoint preserved. Will retry on next run.")
      break
    }

    // Pause or continue before next batch
    if (!isShuttingDown) {
      if (pause) {
        const shouldContinue = await promptToContinue("Continue with next batch?")
        if (!shouldContinue) {
          console.log("Stopping at user request.")
          break
        }
      } else {
        console.log("\nStarting next batch in 5 seconds...")
        await sleep(5000)
      }
    }
  }

  // Final summary
  const totalElapsed = Math.floor((Date.now() - startTime) / 1000)
  console.log(`\n${"=".repeat(60)}`)
  console.log(`Run Complete`)
  console.log(`${"=".repeat(60)}`)
  console.log(`Total batches: ${batchCount}`)
  console.log(`Total actors processed: ${totalProcessed}`)
  console.log(`Total time: ${formatDuration(totalElapsed)}`)
  console.log(`${"=".repeat(60)}\n`)

  if (!dryRun) {
    recordCustomEvent("CauseOfDeathRunnerCompleted", {
      totalBatches: batchCount,
      totalProcessed,
      durationSeconds: totalElapsed,
      stoppedByUser: isShuttingDown,
    })
  }
}

function buildPrompt(actor: ActorToProcess): string {
  const birthYear = getYearFromDate(actor.birthday)
  const deathYear = getYearFromDate(actor.deathday)
  const birthInfo = birthYear ? `born ${birthYear}, ` : ""

  return `What was the cause of death for ${actor.name} (${birthInfo}died ${deathYear})?

Return JSON with these fields:
- cause: specific medical cause (e.g., "heart failure", "pancreatic cancer") or null if unknown
- details: 1-2 sentences of medical context about their death, or null if no additional info
- corrections: object with corrected birthYear, deathYear, or deathDate (YYYY-MM-DD) if our data is wrong, or null

Rules:
- Be specific (e.g., "pancreatic cancer" not "cancer")
- Details = medical circumstances only (duration of illness, complications, etc.)
- No family/career/tribute info in details
- Only include corrections if you're confident our dates are wrong

Respond with valid JSON only.`
}

export async function markActorAsChecked(
  db: ReturnType<typeof getPool>,
  actorId: number
): Promise<void> {
  await db.query(
    `UPDATE actors SET cause_of_death_checked_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [actorId]
  )
}

export async function processResults(
  anthropic: Anthropic,
  batchId: string,
  checkpoint: Checkpoint
): Promise<number> {
  const db = getPool()
  let processed = 0

  try {
    for await (const result of await anthropic.messages.batches.results(batchId)) {
      const customId = result.custom_id
      const actorId = parseInt(customId.replace("actor-", ""), 10)

      // Skip already processed
      if (checkpoint.processedActorIds.includes(actorId)) {
        continue
      }

      processed++

      if (result.result.type === "succeeded") {
        const message = result.result.message
        const responseText = message.content[0].type === "text" ? message.content[0].text : ""

        try {
          const jsonText = stripMarkdownCodeFences(responseText)
          const parsed = JSON.parse(jsonText)

          // Apply update to database
          await applyUpdate(db, actorId, parsed, batchId, checkpoint)
          checkpoint.stats.succeeded++

          // Show per-actor output in verbose mode
          if (verboseMode && (parsed.cause || parsed.details)) {
            console.log(`\n  Actor ${actorId}: ${parsed.cause || "(no cause)"}`)
            if (parsed.details) {
              console.log(`    Details: ${parsed.details}`)
            }
          }
        } catch (error) {
          checkpoint.stats.errored++
          const errorMsg = error instanceof Error ? error.message : "Unknown error"
          console.error(`\n  Error processing actor ${actorId}:`, error)

          // Log failure for later reprocessing
          await storeFailure(db, batchId, actorId, customId, responseText, errorMsg, "json_parse")

          // Mark actor as checked to prevent infinite reprocessing
          await markActorAsChecked(db, actorId)
        }
      } else if (result.result.type === "errored") {
        checkpoint.stats.errored++
        const errorInfo = JSON.stringify(result.result.error)
        console.error(`\n  API error for actor ${actorId}:`, errorInfo)

        // Log failure for debugging and potential reprocessing
        await storeFailure(db, batchId, actorId, customId, "", errorInfo, "api_error")

        // Mark actor as checked to prevent infinite reprocessing
        await markActorAsChecked(db, actorId)
      } else if (result.result.type === "expired") {
        checkpoint.stats.expired++
        console.log(`\n  Request expired for actor ${actorId}`)

        // Log failure for debugging and potential reprocessing
        await storeFailure(db, batchId, actorId, customId, "", "Request expired", "expired")

        // Mark actor as checked to prevent infinite reprocessing
        await markActorAsChecked(db, actorId)
      }

      checkpoint.processedActorIds.push(actorId)

      // Save checkpoint periodically
      if (processed % 50 === 0) {
        saveCheckpoint(checkpoint)
        process.stdout.write(`\r  Processed: ${processed}...`)
      }
    }

    saveCheckpoint(checkpoint)
    console.log(`\n  Succeeded: ${checkpoint.stats.succeeded}`)
    console.log(`  Errored: ${checkpoint.stats.errored}`)
    console.log(`  Expired: ${checkpoint.stats.expired}`)
    console.log(`  Updated causes: ${checkpoint.stats.updatedCause}`)
    console.log(`  Updated details: ${checkpoint.stats.updatedDetails}`)

    return processed
  } finally {
    await resetPool()
  }
}

async function applyUpdate(
  db: ReturnType<typeof getPool>,
  actorId: number,
  parsed: { cause?: string | null; details?: string | null },
  batchId: string,
  checkpoint: Checkpoint
): Promise<void> {
  const SOURCE_NAME = "claude-opus-4.5-batch"

  // Get current actor data
  const actorResult = await db.query<{
    cause_of_death: string | null
    cause_of_death_details: string | null
  }>("SELECT cause_of_death, cause_of_death_details FROM actors WHERE id = $1", [actorId])

  if (actorResult.rows.length === 0) return

  const actor = actorResult.rows[0]
  const updates: string[] = []
  const values: (string | number | null)[] = []
  let paramIndex = 1

  // Update cause_of_death if we have a new one and actor doesn't have one
  if (parsed.cause && !actor.cause_of_death) {
    updates.push(`cause_of_death = $${paramIndex++}`)
    values.push(parsed.cause)
    updates.push(`cause_of_death_source = $${paramIndex++}`)
    values.push(SOURCE_NAME)
    checkpoint.stats.updatedCause++
  }

  // Update details if we have new ones and actor doesn't have them
  if (parsed.details && !actor.cause_of_death_details) {
    updates.push(`cause_of_death_details = $${paramIndex++}`)
    values.push(parsed.details)
    updates.push(`cause_of_death_details_source = $${paramIndex++}`)
    values.push(SOURCE_NAME)
    checkpoint.stats.updatedDetails++
  }

  // ALWAYS mark as checked to prevent re-processing
  updates.push(`cause_of_death_checked_at = NOW()`)
  updates.push(`updated_at = NOW()`)
  values.push(actorId)
  await db.query(`UPDATE actors SET ${updates.join(", ")} WHERE id = $${paramIndex}`, values)

  // Record history
  if (parsed.cause && !actor.cause_of_death) {
    await db.query(
      `INSERT INTO actor_death_info_history (actor_id, field_name, old_value, new_value, source, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, "cause_of_death", actor.cause_of_death, parsed.cause, SOURCE_NAME, batchId]
    )
  }
  if (parsed.details && !actor.cause_of_death_details) {
    await db.query(
      `INSERT INTO actor_death_info_history (actor_id, field_name, old_value, new_value, source, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actorId,
        "cause_of_death_details",
        actor.cause_of_death_details,
        parsed.details,
        SOURCE_NAME,
        batchId,
      ]
    )
  }
}

// CLI setup
const program = new Command()
  .name("run-cause-of-death-batch")
  .description("Continuously run cause of death batch processing until complete")
  .option("-l, --limit <number>", "Number of actors per batch", parsePositiveInt, 100)
  .option("-p, --poll-interval <seconds>", "Seconds between status checks", parsePositiveInt, 60)
  .option("-n, --dry-run", "Preview without submitting or processing")
  .option("-q, --quiet", "Suppress per-actor output (default: verbose)")
  .option("--no-pause", "Run continuously without pausing between batches")
  .option("-a, --all", "Process ALL deceased actors (not just those missing cause)")
  .action(async (options) => {
    await run({
      limit: options.limit,
      pollInterval: options.pollInterval,
      dryRun: options.dryRun ?? false,
      verbose: !options.quiet, // Default verbose=true, --quiet sets to false
      pause: options.pause !== false, // Default pause=true, --no-pause sets to false
      all: options.all ?? false,
    })
  })

// Only run CLI when executed directly (not when imported for testing)
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("run-cause-of-death-batch.ts")

if (isMainModule) {
  program.parse()
}
