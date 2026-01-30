#!/usr/bin/env tsx
/**
 * Backfill external IDs (IMDb, TVmaze, TheTVDB) for shows in the database.
 *
 * This script pre-populates external IDs from TMDB's external_ids endpoint
 * and TVmaze's lookup API. Having these IDs stored speeds up future fallback
 * lookups since we don't need to query for them each time.
 *
 * IMDb IDs are required for OMDb and Trakt rating lookups.
 *
 * Features:
 * - Exponential backoff retry logic (max 3 attempts)
 * - Marks permanently failed items after 3 attempts
 * - Classifies errors as permanent (404, 400, 401) vs transient (500, 503, timeouts)
 * - Respects rate limits with 200ms delay between requests
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
 *   npm run backfill:external-ids                       # All shows needing IDs
 *   npm run backfill:external-ids -- --missing-only     # Only shows without IDs
 *   npm run backfill:external-ids -- --limit 50         # First 50 shows
 *   npm run backfill:external-ids -- --dry-run          # Preview only
 */

import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool, updateShowExternalIds } from "../src/lib/db.js"
import { getExternalIds } from "../src/lib/episode-data-source.js"
import { isPermanentError } from "../src/lib/backfill-utils.js"

const RATE_LIMIT_DELAY_MS = 200

export function parsePositiveInt(value: string): number {
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
  imdb_id: string | null
  external_ids_fetch_attempts: number
}

const program = new Command()
  .name("backfill-external-ids")
  .description("Backfill IMDb, TVmaze, and TheTVDB IDs for shows")
  .option("-l, --limit <number>", "Limit number of shows to process", parsePositiveInt)
  .option("--missing-only", "Only process shows without external IDs")
  .option("-n, --dry-run", "Preview without writing to database")
  .option(
    "--max-consecutive-failures <number>",
    "Stop processing after N consecutive failures (circuit breaker)",
    parsePositiveInt,
    3
  )
  .action(
    async (options: {
      limit?: number
      missingOnly?: boolean
      dryRun?: boolean
      maxConsecutiveFailures?: number
    }) => {
      if (options.dryRun) {
        await runBackfill(options)
      } else {
        await withNewRelicTransaction("backfill-external-ids", async (recordMetrics) => {
          const stats = await runBackfill(options)
          recordMetrics({
            recordsProcessed: stats.processed,
            recordsUpdated: stats.updated,
            recordsFailed: stats.permanentlyFailed,
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
  maxConsecutiveFailures?: number
}): Promise<{ processed: number; updated: number; permanentlyFailed: number; errors: number }> {
  const { limit, missingOnly, dryRun, maxConsecutiveFailures = 3 } = options

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

  // Build query with retry logic
  let query = `
    SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id, external_ids_fetch_attempts
    FROM shows
    WHERE external_ids_permanently_failed = false
      AND external_ids_fetch_attempts < 3
      AND (
        external_ids_last_fetch_attempt IS NULL
        OR external_ids_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, external_ids_fetch_attempts)
      )
  `

  const params: number[] = []

  if (missingOnly) {
    query += " AND tvmaze_id IS NULL AND thetvdb_id IS NULL"
  }

  query += " ORDER BY popularity DESC NULLS LAST"

  if (limit) {
    params.push(limit)
    query += ` LIMIT $${params.length}`
  }

  const result = await db.query<ShowInfo>(query, params)
  const shows = result.rows

  console.log(`Found ${shows.length} shows to process\n`)

  let processed = 0
  let updated = 0
  let permanentlyFailed = 0
  let errors = 0
  let consecutiveFailures = 0

  for (const show of shows) {
    processed++

    const attemptNum = show.external_ids_fetch_attempts + 1
    const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""

    process.stdout.write(`[${processed}/${shows.length}] ${show.name}${retryLabel}... `)

    // Skip if already has both IDs
    if (show.tvmaze_id && show.thetvdb_id) {
      console.log("already has both IDs")
      // Rate limit - apply after both success and error to respect API limits
      if (processed < shows.length) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
      continue
    }

    try {
      const externalIds = await getExternalIds(show.tmdb_id)

      // Check if we found any new IDs
      const newTvmaze = !show.tvmaze_id && externalIds.tvmazeId
      const newThetvdb = !show.thetvdb_id && externalIds.thetvdbId
      const newImdb = !show.imdb_id && externalIds.imdbId

      if (newTvmaze || newThetvdb || newImdb) {
        if (!dryRun) {
          await updateShowExternalIds(
            show.tmdb_id,
            externalIds.tvmazeId,
            externalIds.thetvdbId,
            externalIds.imdbId
          )

          // Reset retry tracking on success
          await db.query(
            `UPDATE shows
             SET external_ids_fetch_attempts = 0,
                 external_ids_last_fetch_attempt = NULL,
                 external_ids_fetch_error = NULL
             WHERE tmdb_id = $1`,
            [show.tmdb_id]
          )
        }
        updated++
        consecutiveFailures = 0 // Reset circuit breaker on success
        console.log(
          `${dryRun ? "would update: " : ""}TVmaze=${externalIds.tvmazeId ?? "none"}, TheTVDB=${externalIds.thetvdbId ?? "none"}, IMDb=${externalIds.imdbId ?? "none"}`
        )
      } else if (externalIds.tvmazeId || externalIds.thetvdbId || externalIds.imdbId) {
        console.log("no new IDs to add")
      } else {
        console.log("no external IDs found")

        // No IDs found - track retry
        if (!dryRun) {
          const willMarkPermanent = attemptNum >= 3
          await db.query(
            `UPDATE shows
             SET external_ids_fetch_attempts = $1,
                 external_ids_last_fetch_attempt = NOW(),
                 external_ids_fetch_error = 'No external IDs found',
                 external_ids_permanently_failed = $2
             WHERE tmdb_id = $3`,
            [attemptNum, willMarkPermanent, show.tmdb_id]
          )
          if (willMarkPermanent) permanentlyFailed++
        }
      }
    } catch (error) {
      errors++
      consecutiveFailures++
      const errorMsg = error instanceof Error ? error.message : "unknown"
      console.log(`error: ${errorMsg}`)

      // Circuit breaker: stop if too many consecutive failures (API likely down)
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.error(
          `\n❌ Circuit breaker tripped: ${consecutiveFailures} consecutive failures detected`
        )
        console.error(
          "   The TMDB API may be experiencing an outage. Stopping to prevent futile requests."
        )
        console.error(
          `   Processed ${processed}/${shows.length} shows before stopping (${updated} updated, ${errors} errors)\n`
        )

        await resetPool()
        process.exit(2) // Exit code 2 indicates circuit breaker trip
      }

      if (!dryRun) {
        const permanent = isPermanentError(error)
        const willMarkPermanent = permanent || attemptNum >= 3

        await db.query(
          `UPDATE shows
           SET external_ids_fetch_attempts = $1,
               external_ids_last_fetch_attempt = NOW(),
               external_ids_fetch_error = $2,
               external_ids_permanently_failed = $3
           WHERE tmdb_id = $4`,
          [attemptNum, errorMsg.substring(0, 500), willMarkPermanent, show.tmdb_id]
        )

        if (willMarkPermanent) permanentlyFailed++
      }
    }

    // Rate limit - apply after both success and error to respect API limits
    if (processed < shows.length) {
      await delay(RATE_LIMIT_DELAY_MS)
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log(`Processed: ${processed}`)
  console.log(`${dryRun ? "Would update" : "Updated"}: ${updated}`)
  if (permanentlyFailed > 0) {
    console.log(`Permanently failed: ${permanentlyFailed}`)
  }
  if (errors > 0) {
    console.log(`Errors: ${errors}`)
  }

  await resetPool()

  return {
    processed,
    updated,
    permanentlyFailed,
    errors,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
