#!/usr/bin/env tsx
import newrelic from "newrelic"
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

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { promises as fs } from "fs"
import * as readline from "readline"
import { runSync, type SyncResult, parsePositiveInt } from "./sync-tmdb-changes.js"
import { formatDate, subtractDays } from "../src/lib/date-utils.js"
import { createActorSlug } from "../src/lib/slug-utils.js"

const SITE_URL = process.env.SITE_URL || "https://deadonfilm.com"

const CHECKPOINT_FILE = "./scripts/.backfill-tmdb-checkpoint"

interface ChunkSummary {
  peopleChecked: number
  newDeathsFound: number
  newlyDeceasedActors: Array<{ tmdbId: number; name: string; deathday: string }>
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
 */
async function waitForEnter(message: string = "Press Enter to continue..."): Promise<void> {
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
      if (summary.moviesChecked > 0 || summary.moviesUpdated > 0 || summary.moviesSkipped > 0) {
        const parts = [`${summary.moviesChecked.toLocaleString()} checked`]
        if (summary.moviesUpdated > 0) {
          parts.push(`${summary.moviesUpdated.toLocaleString()} updated`)
        }
        if (summary.moviesSkipped > 0) {
          parts.push(`${summary.moviesSkipped.toLocaleString()} skipped`)
        }
        statsStr = parts.join(", ")
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
    newlyDeceasedActors: [],
    moviesChecked: 0,
    moviesUpdated: 0,
    moviesSkipped: 0,
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

    // Run sync for this chunk (quiet mode to avoid flooding console)
    const result = await runSync({
      startDate: chunk.start,
      endDate: chunk.end,
      dryRun,
      peopleOnly: mode === "people",
      moviesOnly: mode === "movies",
      showsOnly: mode === "shows",
      quiet: true, // Suppress verbose output, show live status bar instead
    })

    // Accumulate results
    summary.peopleChecked += result.peopleChecked
    summary.newDeathsFound += result.newDeathsFound
    summary.newlyDeceasedActors.push(...result.newlyDeceasedActors)
    summary.moviesChecked += result.moviesChecked
    summary.moviesUpdated += result.moviesUpdated
    summary.moviesSkipped += result.moviesSkipped
    summary.showsChecked += result.showsChecked
    summary.newEpisodesFound += result.newEpisodesFound
    summary.errors += result.errors.length

    // Show status bar
    console.log("\n" + "─".repeat(60))
    console.log(drawStatusBar(chunkNum, totalChunks, startTime, summary, mode))
    console.log("─".repeat(60))

    // Record New Relic event for chunk completion
    newrelic.recordCustomEvent("BackfillChunkCompleted", {
      mode: modeName,
      chunkNumber: chunkNum,
      totalChunks: totalChunks,
      dateRange: `${chunk.start} to ${chunk.end}`,
      peopleChecked: result.peopleChecked,
      newDeathsFound: result.newDeathsFound,
      moviesChecked: result.moviesChecked,
      moviesUpdated: result.moviesUpdated,
      showsChecked: result.showsChecked,
      newEpisodesFound: result.newEpisodesFound,
      errors: result.errors.length,
    })

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

  // Record New Relic event for mode completion
  newrelic.recordCustomEvent("BackfillModeCompleted", {
    mode: modeName,
    durationMs: totalElapsed,
    totalChunks: totalChunks,
    peopleChecked: summary.peopleChecked,
    newDeathsFound: summary.newDeathsFound,
    newlyDeceasedCount: summary.newlyDeceasedActors.length,
    moviesChecked: summary.moviesChecked,
    moviesUpdated: summary.moviesUpdated,
    moviesSkipped: summary.moviesSkipped,
    showsChecked: summary.showsChecked,
    newEpisodesFound: summary.newEpisodesFound,
    errors: summary.errors,
  })

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
    modes.push("movies", "shows", "people")
  }

  // Generate chunks
  const chunks = generateChunks(options.startDate, options.endDate)
  const totalDays = Math.ceil(
    (new Date(options.endDate).getTime() - new Date(options.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  )

  // Check for existing checkpoint
  let checkpointInfo = ""
  const checkpoint = await loadCheckpoint()
  if (checkpoint && !options.reset) {
    const [mode, date] = checkpoint.split(":")
    if (mode && date && modes.includes(mode as SyncMode)) {
      const chunkIndex = chunks.findIndex((c) => c.start === date)
      if (chunkIndex >= 0) {
        checkpointInfo = `\n  Resuming: Yes (from ${getModeName(mode as SyncMode)} at ${date})`
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
  console.log(`  Chunk Size: 2 days`)
  console.log(`  Total Chunks: ${chunks.length}`)
  console.log(`  Modes: ${modes.map((m) => getModeName(m)).join(" → ")}`)
  console.log(`  Total Operations: ${chunks.length * modes.length} (${chunks.length} chunks × ${modes.length} modes)`)
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
  console.log("\nWhat will be synced:")
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

  // Wait for user confirmation
  await waitForEnter("\nPress Enter to start the backfill, or Ctrl+C to cancel...")
  console.log("")

  // Handle reset
  if (options.reset) {
    await clearCheckpoint()
  }

  // Extract checkpoint info (already checked above for summary)
  let checkpointMode: SyncMode | null = null
  let checkpointChunkIndex = 0

  const checkpointData = await loadCheckpoint()
  if (checkpointData && !options.reset) {
    const [mode, date] = checkpointData.split(":")
    if (mode && date && modes.includes(mode as SyncMode)) {
      checkpointMode = mode as SyncMode
      checkpointChunkIndex = chunks.findIndex((c) => c.start === date)
    }
  }

  // Overall summary across all modes
  const overallSummary: ChunkSummary = {
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
    overallSummary.newlyDeceasedActors.push(...summary.newlyDeceasedActors)
    overallSummary.moviesChecked += summary.moviesChecked
    overallSummary.moviesUpdated += summary.moviesUpdated
    overallSummary.moviesSkipped += summary.moviesSkipped
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

  if (overallSummary.moviesChecked > 0 || overallSummary.moviesUpdated > 0 || overallSummary.moviesSkipped > 0) {
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
      const slug = createActorSlug(actor.name, actor.tmdbId)
      const url = `${SITE_URL}/actor/${slug}`
      console.log(`  ${actor.name} (${actor.deathday}): ${url}`)
    }
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

        // Record New Relic custom event for batch completion
        newrelic.recordCustomEvent("TmdbBatchBackfillCompleted", {
          startDate: options.startDate,
          endDate: options.endDate,
          dryRun: options.dryRun,
          peopleOnly: options.peopleOnly,
          moviesOnly: options.moviesOnly,
          showsOnly: options.showsOnly,
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
