#!/usr/bin/env tsx
import newrelic from "newrelic"
/**
 * Batch backfill TMDB sync in configurable batches with resumption
 *
 * This script runs the TMDB sync in intervals across a date range,
 * with automatic checkpoint/resumption if interrupted.
 *
 * Default behavior (no --*-only flags):
 *   Runs all three sync types in sequence: movies → shows → people
 *
 * Usage:
 *   npm run backfill:tmdb -- --start-date 2026-01-01 --end-date 2026-01-21
 *   npm run backfill:tmdb -- --start-date 2024-06-01 --end-date 2024-12-31 --dry-run
 *   npm run backfill:tmdb -- --start-date 2025-01-01 --end-date 2025-12-31 --people-only
 *   npm run backfill:tmdb -- --start-date 2026-01-01 --end-date 2026-01-21 --batch-size 7
 *   npm run backfill:tmdb -- --start-date 2026-01-01 --end-date 2026-01-21 --checkpoint-frequency 10
 *   npm run backfill:tmdb -- --start-date 2026-01-01 --end-date 2026-01-21 --reset
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { promises as fs } from "fs"
import * as readline from "readline"
import { runSync } from "./sync-tmdb-changes.js"
import { formatDate } from "../src/lib/date-utils.js"
import { createActorSlug } from "../src/lib/slug-utils.js"
import { CLIStatusBar } from "../src/lib/cli-status-bar.js"

const SITE_URL = process.env.SITE_URL || "https://deadonfilm.com"

const CHECKPOINT_FILE = "./scripts/.backfill-tmdb-checkpoint"

// ANSI color codes
const FG_BRIGHT_GREEN = "\x1b[92m"
const RESET = "\x1b[0m"

interface BatchSummary {
  peopleChecked: number
  newDeathsFound: number
  newlyDeceasedActors: Array<{ id: number; tmdbId: number; name: string; deathday: string }>
  moviesChecked: number
  moviesUpdated: number
  moviesSkipped: number
  showsChecked: number
  newEpisodesFound: number
  errors: number
}

type SyncMode = "movies" | "shows" | "people"

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Wait for user to press Enter
 * Skips prompt in non-interactive mode (e.g., when running in cron)
 */
async function waitForEnter(message: string = "Press Enter to continue..."): Promise<void> {
  // Skip prompt if stdin is not a TTY (non-interactive mode)
  if (!process.stdin.isTTY) {
    return
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close()
      resolve()
    })
  })
}

/**
 * Load checkpoint if it exists
 * Returns checkpoint data with timestamp if available
 */
async function loadCheckpoint(): Promise<{
  batchIndex: number
  mode: string | null
  timestamp: number
} | null> {
  try {
    const data = await fs.readFile(CHECKPOINT_FILE, "utf-8")
    const parts = data.trim().split(":")
    if (parts.length >= 2) {
      const batchIndex = parseInt(parts[0], 10)
      if (Number.isNaN(batchIndex) || batchIndex < 0) {
        // Corrupt or invalid checkpoint; treat as if no checkpoint exists
        return null
      }
      const mode = parts[1] || null
      const rawTimestamp = parts.length >= 3 ? parseInt(parts[2], 10) : Date.now()
      const timestamp = Number.isNaN(rawTimestamp) ? Date.now() : rawTimestamp
      return { batchIndex, mode, timestamp }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Save checkpoint with timestamp
 */
async function saveCheckpoint(batchIndex: number, mode: string | null): Promise<void> {
  const timestamp = Date.now()
  const checkpointData = `${batchIndex}:${mode || ""}:${timestamp}`
  await fs.writeFile(CHECKPOINT_FILE, checkpointData, "utf-8")

  // Log checkpoint creation with bright green color to make it stand out
  const checkpointTime = new Date(timestamp).toISOString()
  const modeStr = mode ? ` (${getModeName(mode as SyncMode)} complete)` : ""
  console.log(
    `\n${FG_BRIGHT_GREEN}✓ Checkpoint saved (ID: ${timestamp}): batch ${batchIndex + 1}${modeStr} [${checkpointTime}]${RESET}`
  )
}

/**
 * Clear checkpoint
 */
async function clearCheckpoint(): Promise<void> {
  try {
    await fs.unlink(CHECKPOINT_FILE)
  } catch {
    // File doesn't exist, that's fine
  }
}

/**
 * Generate batches from date range
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @param batchSize - Number of days per batch (default: 2)
 */
export function generateBatches(
  startDate: string,
  endDate: string,
  batchSize: number = 2
): Array<{ start: string; end: string }> {
  const batches: Array<{ start: string; end: string }> = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  const current = new Date(start)

  while (current <= end) {
    const batchStart = formatDate(current)
    const batchEndDate = new Date(current)
    batchEndDate.setDate(batchEndDate.getDate() + batchSize - 1)

    // Don't go past the end date
    const batchEnd = batchEndDate > end ? formatDate(end) : formatDate(batchEndDate)

    batches.push({ start: batchStart, end: batchEnd })

    // Move to next batch
    current.setDate(current.getDate() + batchSize)
  }

  return batches
}

/**
 * Get mode name for display
 */
function getModeName(mode: SyncMode): string {
  switch (mode) {
    case "movies":
      return "Movies"
    case "shows":
      return "TV Shows"
    case "people":
      return "People"
  }
}

/**
 * Run sync for a single mode in a single batch
 */
async function runBatchMode(
  mode: SyncMode,
  batch: { start: string; end: string },
  batchNum: number,
  totalBatches: number,
  dryRun: boolean,
  statusBar: CLIStatusBar,
  onItemProcessed?: () => Promise<void>
): Promise<{
  peopleChecked: number
  newDeathsFound: number
  newlyDeceasedActors: Array<{ id: number; tmdbId: number; name: string; deathday: string }>
  moviesChecked: number
  moviesUpdated: number
  moviesSkipped: number
  showsChecked: number
  newEpisodesFound: number
  errors: number
}> {
  const modeName = getModeName(mode)

  // Run sync for this batch and mode with progress callbacks
  const result = await runSync({
    startDate: batch.start,
    endDate: batch.end,
    dryRun,
    peopleOnly: mode === "people",
    moviesOnly: mode === "movies",
    showsOnly: mode === "shows",
    quiet: true, // Suppress verbose output
    onProgress: async (progress) => {
      // Build per-item progress display
      let itemProgress = ""
      if (progress.total !== undefined && progress.current !== undefined) {
        itemProgress = `${progress.current + 1}/${progress.total}`
      }

      // Update status bar with per-item progress and operation
      const operation = progress.currentItem
        ? `${progress.operation}: ${progress.currentItem}`
        : progress.operation
      statusBar.update({
        currentItem: itemProgress,
        currentOperation: operation,
      })

      // Call checkpoint callback only when processing actual items
      if (
        onItemProcessed &&
        typeof progress.operation === "string" &&
        progress.operation.startsWith("Processing")
      ) {
        await onItemProcessed()
      }
    },
    onLog: (message) => {
      // Route log messages through status bar
      statusBar.log(message)
    },
  })

  // Log newly deceased actors for this batch
  if (result.newlyDeceasedActors.length > 0) {
    for (const actor of result.newlyDeceasedActors) {
      statusBar.log(`  ✝️  ${actor.name} (${actor.deathday})`)
    }
  }

  // Record New Relic event for batch-mode completion
  newrelic.recordCustomEvent("BackfillBatchModeCompleted", {
    mode: modeName,
    batchNumber: batchNum,
    totalBatches: totalBatches,
    dateRange: `${batch.start} to ${batch.end}`,
    peopleChecked: result.peopleChecked,
    newDeathsFound: result.newDeathsFound,
    moviesChecked: result.moviesChecked,
    moviesUpdated: result.moviesUpdated,
    showsChecked: result.showsChecked,
    newEpisodesFound: result.newEpisodesFound,
    errors: result.errors.length,
  })

  return {
    peopleChecked: result.peopleChecked,
    newDeathsFound: result.newDeathsFound,
    newlyDeceasedActors: result.newlyDeceasedActors,
    moviesChecked: result.moviesChecked,
    moviesUpdated: result.moviesUpdated,
    moviesSkipped: result.moviesSkipped,
    showsChecked: result.showsChecked,
    newEpisodesFound: result.newEpisodesFound,
    errors: result.errors.length,
  }
}

interface BackfillOptions {
  startDate: string
  endDate: string
  dryRun: boolean
  peopleOnly: boolean
  moviesOnly: boolean
  showsOnly: boolean
  reset: boolean
  batchSize: number
  checkpointFrequency: number
  yes: boolean
}

async function runBackfill(options: BackfillOptions): Promise<void> {
  // Determine which modes to run
  const modes: SyncMode[] = []
  if (options.moviesOnly) {
    modes.push("movies")
  } else if (options.showsOnly) {
    modes.push("shows")
  } else if (options.peopleOnly) {
    modes.push("people")
  } else {
    // Default: run all three in sequence within each batch
    modes.push("movies", "shows", "people")
  }

  // Generate batches
  const batches = generateBatches(options.startDate, options.endDate, options.batchSize)
  const totalDays = Math.ceil(
    (new Date(options.endDate).getTime() - new Date(options.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  )

  // Check for existing checkpoint
  let checkpointInfo = ""
  const checkpoint = await loadCheckpoint()
  let resumeBatchIndex = 0
  let resumeModeIndex = 0

  if (checkpoint && !options.reset) {
    const { batchIndex, mode, timestamp } = checkpoint
    if (batchIndex >= 0 && batchIndex < batches.length) {
      resumeBatchIndex = batchIndex
      const checkpointTime = new Date(timestamp).toISOString()
      let batch = batches[batchIndex]

      // Determine which mode to resume from
      if (mode && modes.includes(mode as SyncMode)) {
        resumeModeIndex = modes.indexOf(mode as SyncMode) + 1 // Resume from next mode
        if (resumeModeIndex >= modes.length) {
          // All modes in this batch are done, move to next batch
          resumeBatchIndex++
          resumeModeIndex = 0
          // Update batch reference for correct checkpoint info
          batch = batches[resumeBatchIndex]
        }
        checkpointInfo = `\n  Resuming: Yes (from checkpoint ID: ${timestamp})\n  Checkpoint: Batch ${batchIndex + 1} (${batch.start} to ${batch.end}) after ${getModeName(mode as SyncMode)}\n  Created: ${checkpointTime}`
      } else {
        checkpointInfo = `\n  Resuming: Yes (from checkpoint ID: ${timestamp})\n  Checkpoint: Batch ${batchIndex + 1} (${batch.start} to ${batch.end})\n  Created: ${checkpointTime}`
      }
    }
  }

  // Display configuration summary
  console.log("\n" + "=".repeat(70))
  console.log("TMDB BATCH BACKFILL - CONFIGURATION SUMMARY")
  console.log("=".repeat(70))
  console.log("\nDate Range:")
  console.log(`  Start Date: ${options.startDate}`)
  console.log(`  End Date:   ${options.endDate}`)
  console.log(`  Total Days: ${totalDays}`)
  console.log(`\nExecution Plan:`)
  console.log(`  Batch Size: ${options.batchSize} days`)
  console.log(`  Total Batches: ${batches.length}`)
  console.log(`  Modes per batch: ${modes.map((m) => getModeName(m)).join(" → ")}`)
  console.log(
    `  Total Operations: ${batches.length * modes.length} (${batches.length} batches × ${modes.length} modes)`
  )
  console.log(`\nOptions:`)
  console.log(`  Dry Run: ${options.dryRun ? "Yes (no changes will be written)" : "No"}`)
  if (checkpointInfo) {
    console.log(checkpointInfo)
  } else {
    console.log(`  Resuming: No (starting from beginning)`)
  }
  if (options.reset) {
    console.log(`  Reset: Yes (checkpoint cleared)`)
  }
  console.log("\nWhat will be synced (per batch):")
  if (modes.includes("movies")) {
    console.log("  • Movies: Update mortality statistics for changed movies")
  }
  if (modes.includes("shows")) {
    console.log("  • TV Shows: Check active shows for new episodes")
  }
  if (modes.includes("people")) {
    console.log("  • People: Detect newly deceased actors, fetch cause of death (Claude Opus 4.5)")
  }
  console.log("\nSystem Operations:")
  console.log("  • Cache invalidation for updated entities")
  console.log("  • Movie mortality stats recalculation when deaths detected")
  console.log("  • Automatic checkpoint saving (resumable if interrupted)")
  console.log("\n" + "=".repeat(70))

  // Wait for user confirmation (unless --yes flag is set)
  if (!options.yes) {
    await waitForEnter("\nPress Enter to start the backfill, or Ctrl+C to cancel...")
    console.log("")
  }

  // Handle reset
  if (options.reset) {
    await clearCheckpoint()
  }

  // Overall summary across all batches and modes
  const overallSummary: BatchSummary = {
    peopleChecked: 0,
    newDeathsFound: 0,
    newlyDeceasedActors: [],
    moviesChecked: 0,
    moviesUpdated: 0,
    moviesSkipped: 0,
    showsChecked: 0,
    newEpisodesFound: 0,
    errors: 0,
  }

  // Setup combined metrics for status bar (all modes)
  const metrics = ["checked", "updated", "skipped", "episodes", "deaths"]

  // Initialize status bar
  const statusBar = new CLIStatusBar({
    totalItems: batches.length,
    itemLabel: "batches",
    metrics,
    header: `Backfilling TMDB: ${options.startDate} to ${options.endDate}`,
  })

  console.log("\n" + "=".repeat(60))
  console.log("BACKFILL STARTED")
  console.log("=".repeat(60))
  console.log(`Total batches: ${batches.length}`)
  console.log(`Modes per batch: ${modes.map((m) => getModeName(m)).join(" → ")}`)
  if (resumeBatchIndex > 0 || resumeModeIndex > 0) {
    const modeStr =
      resumeModeIndex > 0 ? ` (starting from ${getModeName(modes[resumeModeIndex])})` : ""
    console.log(`Resuming from batch ${resumeBatchIndex + 1}${modeStr}`)
  }
  console.log("")

  // Track items processed for checkpointing
  let itemsSinceLastCheckpoint = 0

  // Start the status bar
  statusBar.start()

  try {
    // Loop through batches
    for (let batchIndex = resumeBatchIndex; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      const batchNum = batchIndex + 1

      // Determine starting mode for this batch
      const startModeIndex = batchIndex === resumeBatchIndex ? resumeModeIndex : 0

      // Update status bar for this batch
      statusBar.update({
        current: batchNum,
      })

      // Loop through modes for this batch
      for (let modeIndex = startModeIndex; modeIndex < modes.length; modeIndex++) {
        const mode = modes[modeIndex]
        const modeName = getModeName(mode)

        // Update status bar mode
        statusBar.update({
          mode: modeName,
        })

        // Run this mode for this batch with checkpoint callback
        const result = await runBatchMode(
          mode,
          batch,
          batchNum,
          batches.length,
          options.dryRun,
          statusBar,
          async () => {
            // Increment counter after each item
            itemsSinceLastCheckpoint++

            // Save checkpoint if we've hit the frequency threshold
            const isLastMode = modeIndex === modes.length - 1
            const isLastBatch = batchIndex === batches.length - 1
            if (
              itemsSinceLastCheckpoint >= options.checkpointFrequency &&
              !(isLastMode && isLastBatch)
            ) {
              await saveCheckpoint(batchIndex, mode)
              itemsSinceLastCheckpoint = 0
            }
          }
        )

        // Accumulate results
        overallSummary.peopleChecked += result.peopleChecked
        overallSummary.newDeathsFound += result.newDeathsFound
        overallSummary.newlyDeceasedActors.push(...result.newlyDeceasedActors)
        overallSummary.moviesChecked += result.moviesChecked
        overallSummary.moviesUpdated += result.moviesUpdated
        overallSummary.moviesSkipped += result.moviesSkipped
        overallSummary.showsChecked += result.showsChecked
        overallSummary.newEpisodesFound += result.newEpisodesFound
        overallSummary.errors += result.errors

        // Update status bar metrics (cumulative)
        statusBar.update({
          metrics: {
            checked:
              overallSummary.moviesChecked +
              overallSummary.showsChecked +
              overallSummary.peopleChecked,
            updated: overallSummary.moviesUpdated,
            skipped: overallSummary.moviesSkipped,
            episodes: overallSummary.newEpisodesFound,
            deaths: overallSummary.newDeathsFound,
          },
        })

        // Small delay between modes
        if (modeIndex < modes.length - 1) {
          await delay(1000)
        }
      }

      // Record New Relic event for batch completion (all modes done)
      newrelic.recordCustomEvent("BackfillBatchCompleted", {
        batchNumber: batchNum,
        totalBatches: batches.length,
        dateRange: `${batch.start} to ${batch.end}`,
        modesCompleted: modes.length,
      })

      // Small delay between batches
      if (batchIndex < batches.length - 1) {
        await delay(2000)
      }
    }
  } finally {
    // Always stop the status bar
    statusBar.stop()
  }

  // Clear checkpoint on successful completion
  await clearCheckpoint()

  // Print overall summary
  console.log("\n" + "=".repeat(60))
  console.log("BACKFILL COMPLETE!")
  console.log("=".repeat(60))
  console.log("")
  console.log(`Overall Summary (${options.startDate} to ${options.endDate}):`)
  console.log("-".repeat(60))

  if (overallSummary.peopleChecked > 0 || overallSummary.newDeathsFound > 0) {
    console.log("\nPeople:")
    console.log(`  - Total checked: ${overallSummary.peopleChecked.toLocaleString()}`)
    console.log(
      `  - New deaths found: ${overallSummary.newDeathsFound.toLocaleString()}${overallSummary.newDeathsFound > 0 ? " ✓" : ""}`
    )
  }

  if (
    overallSummary.moviesChecked > 0 ||
    overallSummary.moviesUpdated > 0 ||
    overallSummary.moviesSkipped > 0
  ) {
    console.log("\nMovies:")
    console.log(`  - Total checked: ${overallSummary.moviesChecked.toLocaleString()}`)
    console.log(
      `  - Total updated: ${overallSummary.moviesUpdated.toLocaleString()}${overallSummary.moviesUpdated > 0 ? " ✓" : ""}`
    )
    if (overallSummary.moviesSkipped > 0) {
      console.log(
        `  - Total skipped: ${overallSummary.moviesSkipped.toLocaleString()} (only unimportant fields changed)`
      )
    }
  }

  if (overallSummary.showsChecked > 0 || overallSummary.newEpisodesFound > 0) {
    console.log("\nTV Shows:")
    console.log(`  - Total checked: ${overallSummary.showsChecked.toLocaleString()}`)
    console.log(
      `  - New episodes found: ${overallSummary.newEpisodesFound.toLocaleString()}${overallSummary.newEpisodesFound > 0 ? " ✓" : ""}`
    )
  }

  // Show newly deceased actors with links
  if (overallSummary.newlyDeceasedActors.length > 0) {
    console.log("\n" + "─".repeat(60))
    console.log("Newly Deceased Actors:")
    console.log("─".repeat(60))
    for (const actor of overallSummary.newlyDeceasedActors) {
      const slug = createActorSlug(actor.name, actor.id)
      const url = `${SITE_URL}/actor/${slug}`
      console.log(`  ${actor.name} (${actor.deathday}): ${url}`)
    }
  }

  console.log("")
  console.log(`Total errors: ${overallSummary.errors}`)
  console.log(`Total batches processed: ${batches.length}`)
  console.log("")
  console.log("=".repeat(60))
}

// Validate date format
export function validateDate(value: string): string {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(value)) {
    throw new InvalidArgumentError("Date must be in YYYY-MM-DD format")
  }
  return value
}

// Validate batch size
export function parseBatchSize(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0 || value.includes(".")) {
    throw new InvalidArgumentError("Batch size must be a positive integer")
  }
  if (n > 365) {
    throw new InvalidArgumentError("Batch size cannot exceed 365 days")
  }
  return n
}

// Validate checkpoint frequency
export function parseCheckpointFrequency(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0 || value.includes(".")) {
    throw new InvalidArgumentError("Checkpoint frequency must be a positive integer")
  }
  return n
}

const program = new Command()
  .name("backfill-tmdb-batch")
  .description("Batch backfill TMDB sync in configurable batches with automatic resumption")
  .requiredOption("--start-date <date>", "Start date (YYYY-MM-DD)", validateDate)
  .requiredOption("--end-date <date>", "End date (YYYY-MM-DD)", validateDate)
  .option("-n, --dry-run", "Preview changes without writing to database", false)
  .option("-p, --people-only", "Only sync people changes", false)
  .option("-m, --movies-only", "Only sync movie changes", false)
  .option("-s, --shows-only", "Only sync active TV show episodes", false)
  .option("-b, --batch-size <days>", "Number of days per batch (default: 2)", parseBatchSize, 2)
  .option(
    "-f, --checkpoint-frequency <items>",
    "Save checkpoint after processing N items (default: 100)",
    parseCheckpointFrequency,
    100
  )
  .option("--reset", "Clear checkpoint and start from beginning", false)
  .option("-y, --yes", "Skip confirmation prompt", false)
  .action(
    async (options: {
      startDate: string
      endDate: string
      dryRun: boolean
      peopleOnly: boolean
      moviesOnly: boolean
      showsOnly: boolean
      batchSize: number
      checkpointFrequency: number
      reset: boolean
      yes: boolean
    }) => {
      // Validate mutually exclusive options
      const exclusiveCount = [options.peopleOnly, options.moviesOnly, options.showsOnly].filter(
        Boolean
      ).length
      if (exclusiveCount > 1) {
        console.error("Error: Cannot specify multiple --*-only options")
        console.error("Use one or none to sync all")
        process.exit(1)
      }

      // Validate date range
      const startDate = new Date(options.startDate)
      const endDate = new Date(options.endDate)
      if (startDate > endDate) {
        console.error("Error: --start-date must be before or equal to --end-date")
        process.exit(1)
      }

      try {
        await runBackfill({
          startDate: options.startDate,
          endDate: options.endDate,
          dryRun: options.dryRun,
          peopleOnly: options.peopleOnly,
          moviesOnly: options.moviesOnly,
          showsOnly: options.showsOnly,
          batchSize: options.batchSize,
          checkpointFrequency: options.checkpointFrequency,
          reset: options.reset,
          yes: options.yes,
        })

        // Record New Relic custom event for batch completion
        newrelic.recordCustomEvent("TmdbBatchBackfillCompleted", {
          startDate: options.startDate,
          endDate: options.endDate,
          dryRun: options.dryRun,
          peopleOnly: options.peopleOnly,
          moviesOnly: options.moviesOnly,
          showsOnly: options.showsOnly,
          batchSize: options.batchSize,
          checkpointFrequency: options.checkpointFrequency,
        })
      } catch (error) {
        newrelic.recordCustomEvent("TmdbBatchBackfillError", {
          startDate: options.startDate,
          endDate: options.endDate,
          error: error instanceof Error ? error.message : String(error),
        })
        console.error("Fatal error:", error)
        process.exit(1)
      }

      // Exit cleanly
      await delay(100)
      process.exit(0)
    }
  )

// Only run if executed directly, not when imported for testing
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
