#!/usr/bin/env tsx
/**
 * Batch backfill TMDB sync in 2-day chunks with resumption
 *
 * This script runs the TMDB sync in 2-day intervals across a date range,
 * with automatic checkpoint/resumption if interrupted.
 *
 * Default behavior (no --*-only flags):
 *   Runs all three sync types in sequence: movies → shows → people
 *
 * Usage:
 *   npm run backfill:tmdb -- --start-date 2026-01-01 --end-date 2026-01-21
 *   npm run backfill:tmdb -- --start-date 2024-06-01 --end-date 2024-12-31 --dry-run
 *   npm run backfill:tmdb -- --start-date 2025-01-01 --end-date 2025-12-31 --people-only
 *   npm run backfill:tmdb -- --start-date 2026-01-01 --end-date 2026-01-21 --reset
 */

// New Relic must be initialized first for full transaction traces
import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { promises as fs } from "fs"
import { runSync, type SyncResult, parsePositiveInt } from "./sync-tmdb-changes.js"
import { formatDate, subtractDays } from "../src/lib/date-utils.js"

const CHECKPOINT_FILE = "./scripts/.backfill-tmdb-checkpoint"

interface ChunkSummary {
  peopleChecked: number
  newDeathsFound: number
  moviesChecked: number
  moviesUpdated: number
  showsChecked: number
  newEpisodesFound: number
  errors: number
}

type SyncMode = "movies" | "shows" | "people"

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  } else {
    return `${seconds}s`
  }
}

/**
 * Draw a comprehensive status bar with progress, time, and stats
 */
function drawStatusBar(
  current: number,
  total: number,
  startTime: number,
  summary: ChunkSummary,
  mode: SyncMode
): string {
  const percentage = Math.round((current * 100) / total)
  const filled = Math.floor((40 * current) / total)
  const empty = 40 - filled

  // Progress bar
  const bar = "[" + "█".repeat(filled) + "░".repeat(empty) + "]"
  const progress = `${bar} ${percentage}% (${current}/${total})`

  // Time calculations
  const elapsed = Date.now() - startTime
  const elapsedStr = formatDuration(elapsed)

  let etaStr = "calculating..."
  if (current > 0) {
    const avgTimePerChunk = elapsed / current
    const remainingChunks = total - current
    const estimatedRemainingMs = avgTimePerChunk * remainingChunks
    etaStr = formatDuration(estimatedRemainingMs)
  }

  // Build stats based on mode
  let statsStr = ""
  switch (mode) {
    case "people":
      if (summary.peopleChecked > 0 || summary.newDeathsFound > 0) {
        statsStr = `${summary.peopleChecked.toLocaleString()} checked, ${summary.newDeathsFound.toLocaleString()} deaths`
      }
      break
    case "movies":
      if (summary.moviesChecked > 0 || summary.moviesUpdated > 0) {
        statsStr = `${summary.moviesChecked.toLocaleString()} checked, ${summary.moviesUpdated.toLocaleString()} updated`
      }
      break
    case "shows":
      if (summary.showsChecked > 0 || summary.newEpisodesFound > 0) {
        statsStr = `${summary.showsChecked.toLocaleString()} checked, ${summary.newEpisodesFound.toLocaleString()} episodes`
      }
      break
  }

  // Format output
  return [
    progress,
    `Elapsed: ${elapsedStr} | ETA: ${etaStr}`,
    statsStr ? `Stats: ${statsStr}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Load checkpoint if it exists
 */
async function loadCheckpoint(): Promise<string | null> {
  try {
    const data = await fs.readFile(CHECKPOINT_FILE, "utf-8")
    return data.trim()
  } catch {
    return null
  }
}

/**
 * Save checkpoint
 */
async function saveCheckpoint(date: string): Promise<void> {
  await fs.writeFile(CHECKPOINT_FILE, date, "utf-8")
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
 * Generate 2-day chunks from date range
 */
function generateChunks(startDate: string, endDate: string): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = []
  const start = new Date(startDate)
  const end = new Date(endDate)

  let current = new Date(start)

  while (current <= end) {
    const chunkStart = formatDate(current)
    const chunkEndDate = new Date(current)
    chunkEndDate.setDate(chunkEndDate.getDate() + 1) // +1 day (2-day range)

    // Don't go past the end date
    const chunkEnd = chunkEndDate > end ? formatDate(end) : formatDate(chunkEndDate)

    chunks.push({ start: chunkStart, end: chunkEnd })

    // Move to next chunk (+2 days)
    current.setDate(current.getDate() + 2)
  }

  return chunks
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
 * Run backfill for a single mode
 */
async function runModeBackfill(
  mode: SyncMode,
  chunks: Array<{ start: string; end: string }>,
  dryRun: boolean,
  resumeFromChunk: number
): Promise<ChunkSummary> {
  const modeName = getModeName(mode)
  const totalChunks = chunks.length
  const startTime = Date.now()

  console.log("\n" + "=".repeat(60))
  console.log(`BACKFILLING ${modeName.toUpperCase()}`)
  console.log("=".repeat(60))
  console.log(`Total chunks: ${totalChunks}`)
  if (resumeFromChunk > 0) {
    console.log(`Resuming from chunk ${resumeFromChunk + 1}`)
  }
  console.log("")

  const summary: ChunkSummary = {
    peopleChecked: 0,
    newDeathsFound: 0,
    moviesChecked: 0,
    moviesUpdated: 0,
    showsChecked: 0,
    newEpisodesFound: 0,
    errors: 0,
  }

  for (let i = resumeFromChunk; i < totalChunks; i++) {
    const chunk = chunks[i]
    const chunkNum = i + 1

    console.log("=".repeat(60))
    console.log(`${modeName} - Chunk ${chunkNum} of ${totalChunks}`)
    console.log(`Date range: ${chunk.start} to ${chunk.end}`)
    console.log("=".repeat(60))

    // Run sync for this chunk
    const result = await runSync({
      startDate: chunk.start,
      endDate: chunk.end,
      dryRun,
      peopleOnly: mode === "people",
      moviesOnly: mode === "movies",
      showsOnly: mode === "shows",
    })

    // Accumulate results
    summary.peopleChecked += result.peopleChecked
    summary.newDeathsFound += result.newDeathsFound
    summary.moviesChecked += result.moviesChecked
    summary.moviesUpdated += result.moviesUpdated
    summary.showsChecked += result.showsChecked
    summary.newEpisodesFound += result.newEpisodesFound
    summary.errors += result.errors.length

    // Show status bar
    console.log("\n" + "─".repeat(60))
    console.log(drawStatusBar(chunkNum, totalChunks, startTime, summary, mode))
    console.log("─".repeat(60))

    // Save checkpoint after successful chunk
    if (i < totalChunks - 1) {
      const nextChunk = chunks[i + 1]
      await saveCheckpoint(`${mode}:${nextChunk.start}`)
      console.log(`\nCheckpoint saved: ${mode}:${nextChunk.start}`)
    }

    console.log("")

    // Small delay to be nice to the API
    await delay(2000)
  }

  // Show final stats for this mode
  const totalElapsed = Date.now() - startTime
  console.log("\n" + "=".repeat(60))
  console.log(`${modeName} backfill complete!`)
  console.log(`Total time: ${formatDuration(totalElapsed)}`)
  console.log("=".repeat(60))

  return summary
}

interface BackfillOptions {
  startDate: string
  endDate: string
  dryRun: boolean
  peopleOnly: boolean
  moviesOnly: boolean
  showsOnly: boolean
  reset: boolean
}

async function runBackfill(options: BackfillOptions): Promise<void> {
  console.log("TMDB Batch Backfill")
  console.log("===================")
  if (options.dryRun) console.log("DRY RUN MODE - no changes will be written")

  // Determine which modes to run
  const modes: SyncMode[] = []
  if (options.moviesOnly) {
    modes.push("movies")
  } else if (options.showsOnly) {
    modes.push("shows")
  } else if (options.peopleOnly) {
    modes.push("people")
  } else {
    // Default: run all three in sequence
    console.log("\nNo mode specified - will run movies, shows, then people in sequence")
    modes.push("movies", "shows", "people")
  }

  // Handle reset
  if (options.reset) {
    await clearCheckpoint()
    console.log("Checkpoint cleared. Starting from beginning.")
  }

  // Generate chunks
  const chunks = generateChunks(options.startDate, options.endDate)
  console.log(`\nBackfilling from ${options.startDate} to ${options.endDate}`)
  console.log(`Running in 2-day chunks (${chunks.length} total chunks per mode)`)
  console.log("")

  // Check for checkpoint
  let checkpointMode: SyncMode | null = null
  let checkpointChunkIndex = 0

  const checkpoint = await loadCheckpoint()
  if (checkpoint && !options.reset) {
    const [mode, date] = checkpoint.split(":")
    if (mode && date && modes.includes(mode as SyncMode)) {
      checkpointMode = mode as SyncMode
      // Find which chunk this date corresponds to
      checkpointChunkIndex = chunks.findIndex((c) => c.start === date)
      if (checkpointChunkIndex >= 0) {
        console.log("========================================")
        console.log(`RESUMING from checkpoint`)
        console.log(`Mode: ${getModeName(checkpointMode)}`)
        console.log(`Starting at chunk ${checkpointChunkIndex + 1} (${date})`)
        console.log("========================================")
        console.log("")
      }
    }
  }

  // Overall summary across all modes
  const overallSummary: ChunkSummary = {
    peopleChecked: 0,
    newDeathsFound: 0,
    moviesChecked: 0,
    moviesUpdated: 0,
    showsChecked: 0,
    newEpisodesFound: 0,
    errors: 0,
  }

  // Run each mode
  for (const mode of modes) {
    // Determine if we should resume this mode
    const shouldResume =
      checkpointMode === mode && checkpointChunkIndex > 0 && checkpointChunkIndex < chunks.length
    const startChunk = shouldResume ? checkpointChunkIndex : 0

    const summary = await runModeBackfill(mode, chunks, options.dryRun, startChunk)

    // Accumulate into overall summary
    overallSummary.peopleChecked += summary.peopleChecked
    overallSummary.newDeathsFound += summary.newDeathsFound
    overallSummary.moviesChecked += summary.moviesChecked
    overallSummary.moviesUpdated += summary.moviesUpdated
    overallSummary.showsChecked += summary.showsChecked
    overallSummary.newEpisodesFound += summary.newEpisodesFound
    overallSummary.errors += summary.errors

    // Clear checkpoint after mode completes
    if (mode === checkpointMode) {
      checkpointMode = null
      checkpointChunkIndex = 0
    }
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

  if (overallSummary.moviesChecked > 0 || overallSummary.moviesUpdated > 0) {
    console.log("\nMovies:")
    console.log(`  - Total checked: ${overallSummary.moviesChecked.toLocaleString()}`)
    console.log(
      `  - Total updated: ${overallSummary.moviesUpdated.toLocaleString()}${overallSummary.moviesUpdated > 0 ? " ✓" : ""}`
    )
  }

  if (overallSummary.showsChecked > 0 || overallSummary.newEpisodesFound > 0) {
    console.log("\nTV Shows:")
    console.log(`  - Total checked: ${overallSummary.showsChecked.toLocaleString()}`)
    console.log(
      `  - New episodes found: ${overallSummary.newEpisodesFound.toLocaleString()}${overallSummary.newEpisodesFound > 0 ? " ✓" : ""}`
    )
  }

  console.log("")
  console.log(`Total errors: ${overallSummary.errors}`)
  console.log(`Total chunks processed: ${chunks.length * modes.length}`)
  console.log("")
  console.log("=".repeat(60))
}

// Validate date format
function validateDate(value: string): string {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(value)) {
    throw new InvalidArgumentError("Date must be in YYYY-MM-DD format")
  }
  return value
}

const program = new Command()
  .name("backfill-tmdb-batch")
  .description("Batch backfill TMDB sync in 2-day chunks with automatic resumption")
  .requiredOption(
    "--start-date <date>",
    "Start date (YYYY-MM-DD)",
    validateDate
  )
  .requiredOption(
    "--end-date <date>",
    "End date (YYYY-MM-DD)",
    validateDate
  )
  .option("-n, --dry-run", "Preview changes without writing to database", false)
  .option("-p, --people-only", "Only sync people changes", false)
  .option("-m, --movies-only", "Only sync movie changes", false)
  .option("-s, --shows-only", "Only sync active TV show episodes", false)
  .option("--reset", "Clear checkpoint and start from beginning", false)
  .action(
    async (options: {
      startDate: string
      endDate: string
      dryRun: boolean
      peopleOnly: boolean
      moviesOnly: boolean
      showsOnly: boolean
      reset: boolean
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

      // Wrap in New Relic transaction for monitoring
      await withNewRelicTransaction("backfill-tmdb-batch", async (recordMetrics) => {
        try {
          await runBackfill({
            startDate: options.startDate,
            endDate: options.endDate,
            dryRun: options.dryRun,
            peopleOnly: options.peopleOnly,
            moviesOnly: options.moviesOnly,
            showsOnly: options.showsOnly,
            reset: options.reset,
          })

          // Record metrics for New Relic
          recordMetrics({
            startDate: options.startDate,
            endDate: options.endDate,
            dryRun: options.dryRun,
            peopleOnly: options.peopleOnly,
            moviesOnly: options.moviesOnly,
            showsOnly: options.showsOnly,
          })
        } catch (error) {
          console.error("Fatal error:", error)
          process.exit(1)
        }
      })

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
