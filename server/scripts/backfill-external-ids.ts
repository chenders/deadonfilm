#!/usr/bin/env tsx
/**
 * Backfill external IDs (TVmaze, TheTVDB) for shows in the database.
 *
 * This script pre-populates external IDs from TMDB's external_ids endpoint
 * and TVmaze's lookup API. Having these IDs stored speeds up future fallback
 * lookups since we don't need to query for them each time.
 *
 * The script automatically saves progress to a checkpoint file and resumes
 * from where it left off if interrupted. Use --fresh to start over.
 *
 * Usage:
 *   npm run backfill:external-ids -- [options]
 *
 * Options:
 *   --limit <n>      Limit number of shows to process
 *   --missing-only   Only process shows without external IDs
 *   --dry-run        Preview without writing to database
 *   --fresh          Start fresh (ignore checkpoint)
 *
 * Examples:
 *   npm run backfill:external-ids                       # All shows (resumes if interrupted)
 *   npm run backfill:external-ids -- --missing-only     # Only shows without IDs
 *   npm run backfill:external-ids -- --limit 50         # First 50 shows
 *   npm run backfill:external-ids -- --dry-run          # Preview only
 *   npm run backfill:external-ids -- --fresh            # Start fresh, ignore checkpoint
 */

import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
import "dotenv/config"
import path from "path"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool, updateShowExternalIds } from "../src/lib/db.js"
import { getExternalIds } from "../src/lib/episode-data-source.js"
import {
  loadCheckpoint as loadCheckpointGeneric,
  saveCheckpoint as saveCheckpointGeneric,
  deleteCheckpoint as deleteCheckpointGeneric,
} from "../src/lib/checkpoint-utils.js"

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join(process.cwd(), ".backfill-external-ids-checkpoint.json")

export interface Checkpoint {
  processedShowIds: number[]
  startedAt: string
  lastUpdated: string
  stats: {
    processed: number
    updated: number
    errors: number
  }
}

export function loadCheckpoint(filePath: string = CHECKPOINT_FILE): Checkpoint | null {
  return loadCheckpointGeneric<Checkpoint>(filePath)
}

export function saveCheckpoint(checkpoint: Checkpoint, filePath: string = CHECKPOINT_FILE): void {
  saveCheckpointGeneric(filePath, checkpoint, (cp) => {
    cp.lastUpdated = new Date().toISOString()
  })
}

export function deleteCheckpoint(filePath: string = CHECKPOINT_FILE): void {
  deleteCheckpointGeneric(filePath)
}

export function parsePositiveInt(value: string): number {
  // Validate the entire string is a positive integer (no decimals, no trailing chars)
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface ShowInfo {
  tmdb_id: number
  name: string
  tvmaze_id: number | null
  thetvdb_id: number | null
}

const program = new Command()
  .name("backfill-external-ids")
  .description("Backfill TVmaze and TheTVDB IDs for shows")
  .option("-l, --limit <number>", "Limit number of shows to process", parsePositiveInt)
  .option("--missing-only", "Only process shows without external IDs")
  .option("-n, --dry-run", "Preview without writing to database")
  .option("--fresh", "Start fresh (ignore checkpoint)")
  .action(
    async (options: {
      limit?: number
      missingOnly?: boolean
      dryRun?: boolean
      fresh?: boolean
    }) => {
      // Don't wrap dry-run mode
      if (options.dryRun) {
        await runBackfill(options)
      } else {
        await withNewRelicTransaction("backfill-external-ids", async (recordMetrics) => {
          const stats = await runBackfill(options)
          recordMetrics({
            recordsProcessed: stats.processed,
            recordsUpdated: stats.updated,
            errorsEncountered: stats.errors,
          })
        })
      }
    }
  )

async function runBackfill(options: {
  limit?: number
  missingOnly?: boolean
  dryRun?: boolean
  fresh?: boolean
}): Promise<{ processed: number; updated: number; errors: number }> {
  const { limit, missingOnly, dryRun, fresh } = options

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  const db = getPool()

  // Load or create checkpoint
  let checkpoint: Checkpoint | null = null
  if (!fresh && !dryRun) {
    checkpoint = loadCheckpoint()
    if (checkpoint) {
      console.log(`\nResuming from checkpoint (started ${checkpoint.startedAt})`)
      console.log(`  Previously processed: ${checkpoint.processedShowIds.length} shows`)
      console.log(`  Updated: ${checkpoint.stats.updated}, Errors: ${checkpoint.stats.errors}`)
    }
  }

  if (!checkpoint) {
    checkpoint = {
      processedShowIds: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: { processed: 0, updated: 0, errors: 0 },
    }
  }

  const processedSet = new Set(checkpoint.processedShowIds)

  console.log(`\nBackfilling external IDs${dryRun ? " (DRY RUN)" : ""}`)
  if (missingOnly) console.log("Processing only shows without external IDs")
  if (limit) console.log(`Limit: ${limit} shows`)
  console.log()

  // Build query
  let query = "SELECT tmdb_id, name, tvmaze_id, thetvdb_id FROM shows"
  const params: number[] = []

  if (missingOnly) {
    query += " WHERE tvmaze_id IS NULL AND thetvdb_id IS NULL"
  }

  query += " ORDER BY popularity DESC NULLS LAST"

  if (limit) {
    params.push(limit)
    query += ` LIMIT $${params.length}`
  }

  const result = await db.query<ShowInfo>(query, params)

  // Filter out already processed shows
  const showsToProcess = result.rows.filter((show) => !processedSet.has(show.tmdb_id))
  const skippedCount = result.rows.length - showsToProcess.length

  if (skippedCount > 0) {
    console.log(`Skipping ${skippedCount} already processed shows`)
  }
  console.log(`Found ${showsToProcess.length} shows to process\n`)

  let sessionProcessed = 0

  for (const show of showsToProcess) {
    sessionProcessed++
    const totalProcessed = checkpoint.stats.processed + sessionProcessed
    process.stdout.write(
      `[${sessionProcessed}/${showsToProcess.length}] (${totalProcessed} total) ${show.name}... `
    )

    // Skip if already has both IDs (still counts as processed)
    if (show.tvmaze_id && show.thetvdb_id) {
      console.log("already has both IDs")
      checkpoint.processedShowIds.push(show.tmdb_id)
      if (!dryRun) saveCheckpoint(checkpoint)
      continue
    }

    try {
      const externalIds = await getExternalIds(show.tmdb_id)

      // Check if we found any new IDs
      const newTvmaze = !show.tvmaze_id && externalIds.tvmazeId
      const newThetvdb = !show.thetvdb_id && externalIds.thetvdbId

      if (newTvmaze || newThetvdb) {
        if (!dryRun) {
          await updateShowExternalIds(show.tmdb_id, externalIds.tvmazeId, externalIds.thetvdbId)
        }
        checkpoint.stats.updated++
        console.log(
          `${dryRun ? "would update: " : ""}TVmaze=${externalIds.tvmazeId ?? "none"}, TheTVDB=${externalIds.thetvdbId ?? "none"}`
        )
      } else if (externalIds.tvmazeId || externalIds.thetvdbId) {
        console.log("no new IDs to add")
      } else {
        console.log("no external IDs found")
      }

      // Small delay to respect rate limits
      await delay(200)
    } catch (error) {
      checkpoint.stats.errors++
      console.log(`error: ${error instanceof Error ? error.message : "unknown"}`)
    } finally {
      // Update checkpoint after each show (even on error to avoid infinite retry loops)
      checkpoint.processedShowIds.push(show.tmdb_id)
      if (!dryRun) saveCheckpoint(checkpoint)
    }
  }

  // Update final stats
  checkpoint.stats.processed += sessionProcessed

  console.log("\n" + "=".repeat(60))
  console.log(`Session processed: ${sessionProcessed}`)
  console.log(`Total processed: ${checkpoint.stats.processed}`)
  console.log(`${dryRun ? "Would update" : "Updated"}: ${checkpoint.stats.updated}`)
  if (checkpoint.stats.errors > 0) {
    console.log(`Errors: ${checkpoint.stats.errors}`)
  }

  // Delete checkpoint on successful completion (all shows processed with no errors)
  if (
    !dryRun &&
    showsToProcess.length > 0 &&
    showsToProcess.length === sessionProcessed &&
    checkpoint.stats.errors === 0
  ) {
    console.log("\nAll shows processed with no errors. Deleting checkpoint.")
    deleteCheckpoint()
  }

  // Close database pool to allow process to exit
  await resetPool()

  return {
    processed: checkpoint.stats.processed,
    updated: checkpoint.stats.updated,
    errors: checkpoint.stats.errors,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Only run when executed directly, not when imported for testing
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
