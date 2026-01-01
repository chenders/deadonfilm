#!/usr/bin/env tsx
/**
 * Backfill external IDs (TVmaze, TheTVDB) for shows in the database.
 *
 * This script pre-populates external IDs from TMDB's external_ids endpoint
 * and TVmaze's lookup API. Having these IDs stored speeds up future fallback
 * lookups since we don't need to query for them each time.
 *
 * Usage:
 *   npm run backfill:external-ids -- [options]
 *
 * Options:
 *   --limit <n>      Limit number of shows to process
 *   --missing-only   Only process shows without external IDs
 *   --dry-run        Preview without writing to database
 *
 * Examples:
 *   npm run backfill:external-ids                       # All shows
 *   npm run backfill:external-ids -- --missing-only     # Only shows without IDs
 *   npm run backfill:external-ids -- --limit 50         # First 50 shows
 *   npm run backfill:external-ids -- --dry-run          # Preview only
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, updateShowExternalIds } from "../src/lib/db.js"
import { getExternalIds } from "../src/lib/episode-data-source.js"

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
  .action(async (options: { limit?: number; missingOnly?: boolean; dryRun?: boolean }) => {
    await runBackfill(options)
  })

async function runBackfill(options: { limit?: number; missingOnly?: boolean; dryRun?: boolean }) {
  const { limit, missingOnly, dryRun } = options

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  const db = getPool()

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

  console.log(`Found ${result.rows.length} shows to process\n`)

  let processed = 0
  let updated = 0
  let errors = 0

  for (const show of result.rows) {
    processed++
    process.stdout.write(`[${processed}/${result.rows.length}] ${show.name}... `)

    // Skip if already has both IDs
    if (show.tvmaze_id && show.thetvdb_id) {
      console.log("already has both IDs")
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
        updated++
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
      errors++
      console.log(`error: ${error instanceof Error ? error.message : "unknown"}`)
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log(`Processed: ${processed}`)
  console.log(`${dryRun ? "Would update" : "Updated"}: ${updated}`)
  if (errors > 0) {
    console.log(`Errors: ${errors}`)
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
