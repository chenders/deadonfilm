#!/usr/bin/env tsx
/**
 * Backfill TheTVDB scores for TV shows
 *
 * This script fetches community scores from TheTVDB API for all shows
 * that have a TheTVDB ID.
 *
 * Features:
 * - Exponential backoff retry logic (max 3 attempts)
 * - Marks permanently failed items after 3 attempts
 * - Classifies errors as permanent (404, 400, 401) vs transient (500, 503, timeouts)
 * - Respects rate limits with 100ms delay between requests
 *
 * Usage:
 *   npm run backfill:thetvdb-scores -- [options]
 *
 * Options:
 *   -l, --limit <n>           Process only N shows
 *   -n, --dry-run             Preview without writing
 *   --min-popularity <n>      Skip shows below popularity threshold
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db/pool.js"
import { getSeriesExtended } from "../src/lib/thetvdb.js"
import { upsertShow } from "../src/lib/db/shows.js"
import type { ShowRecord } from "../src/lib/db/types.js"
import { isPermanentError } from "../src/lib/backfill-utils.js"

const RATE_LIMIT_DELAY_MS = 100

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

export function parseNonNegativeFloat(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n < 0) {
    throw new InvalidArgumentError("Must be non-negative number")
  }
  return n
}

interface BackfillOptions {
  limit?: number
  dryRun?: boolean
  minPopularity?: number
  maxConsecutiveFailures?: number
}

interface BackfillStats {
  totalProcessed: number
  successful: number
  failed: number
  permanentlyFailed: number
  skipped: number
}

interface ShowInfo extends ShowRecord {
  thetvdb_fetch_attempts: number
}

const program = new Command()
  .name("backfill-thetvdb-scores")
  .description("Backfill TheTVDB community scores for TV shows")
  .option("-l, --limit <n>", "Process only N shows", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing")
  .option("--min-popularity <n>", "Skip shows below popularity threshold", parseNonNegativeFloat)
  .option(
    "--max-consecutive-failures <number>",
    "Stop processing after N consecutive failures (circuit breaker)",
    parsePositiveInt,
    3
  )

program.parse()

const options = program.opts<BackfillOptions>()

async function run(options: BackfillOptions) {
  const stats: BackfillStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    permanentlyFailed: 0,
    skipped: 0,
  }

  const { maxConsecutiveFailures = 3 } = options

  const pool = getPool()

  try {
    console.log("📺 TheTVDB Scores Backfill Script")
    console.log("==================================")
    console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
    console.log(`Limit: ${options.limit || "unlimited"}`)
    console.log(`Min popularity: ${options.minPopularity || "none"}`)

    // Query shows that need TheTVDB scores with retry logic
    const conditions: string[] = [
      "thetvdb_id IS NOT NULL",
      "thetvdb_score IS NULL",
      "thetvdb_permanently_failed = false",
      "thetvdb_fetch_attempts < 3",
      `(
        thetvdb_last_fetch_attempt IS NULL
        OR thetvdb_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, thetvdb_fetch_attempts)
      )`,
    ]

    const params: number[] = []
    let paramIndex = 1

    if (options.minPopularity !== undefined) {
      conditions.push(`popularity >= $${paramIndex}`)
      params.push(options.minPopularity)
      paramIndex += 1
    }

    let limitClause = ""
    if (options.limit !== undefined) {
      limitClause = `LIMIT $${paramIndex}`
      params.push(options.limit)
      paramIndex += 1
    }

    const query = `
      SELECT tmdb_id, name, thetvdb_id, popularity,
             first_air_date, last_air_date, poster_path, backdrop_path,
             genres, status, number_of_seasons, number_of_episodes,
             vote_average, origin_country, original_language,
             cast_count, deceased_count, living_count,
             expected_deaths, mortality_surprise_score,
             tvmaze_id, imdb_id, thetvdb_fetch_attempts
      FROM shows
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY popularity DESC NULLS LAST
      ${limitClause}
    `

    const result = await pool.query<ShowInfo>(query, params)
    const shows = result.rows

    console.log(`\nFound ${shows.length} shows to backfill`)

    let consecutiveFailures = 0

    for (const show of shows) {
      stats.totalProcessed++

      const attemptNum = show.thetvdb_fetch_attempts + 1
      const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""

      if (stats.totalProcessed % 10 === 0) {
        console.log(`Progress: ${stats.totalProcessed}/${shows.length} shows processed...`)
      }

      try {
        const seriesData = await getSeriesExtended(show.thetvdb_id!)

        if (!seriesData) {
          console.log(
            `  ⚠️  No data found for "${show.name}" (TheTVDB ID: ${show.thetvdb_id})${retryLabel}`
          )
          stats.failed++

          if (!options.dryRun) {
            const willMarkPermanent = attemptNum >= 3
            await pool.query(
              `UPDATE shows
               SET thetvdb_fetch_attempts = $1,
                   thetvdb_last_fetch_attempt = NOW(),
                   thetvdb_fetch_error = 'No data found',
                   thetvdb_permanently_failed = $2
               WHERE tmdb_id = $3`,
              [attemptNum, willMarkPermanent, show.tmdb_id]
            )
            if (willMarkPermanent) stats.permanentlyFailed++
          }

          // Rate limit - apply after both success and error to respect API limits
          if (stats.totalProcessed < shows.length) {
            await delay(RATE_LIMIT_DELAY_MS)
          }
          continue
        }

        if (seriesData.score === null || seriesData.score === undefined) {
          console.log(`  ⚠️  No score available for "${show.name}"${retryLabel}`)
          stats.skipped++

          if (!options.dryRun) {
            const willMarkPermanent = attemptNum >= 3
            await pool.query(
              `UPDATE shows
               SET thetvdb_fetch_attempts = $1,
                   thetvdb_last_fetch_attempt = NOW(),
                   thetvdb_fetch_error = 'No score available',
                   thetvdb_permanently_failed = $2
               WHERE tmdb_id = $3`,
              [attemptNum, willMarkPermanent, show.tmdb_id]
            )
            if (willMarkPermanent) stats.permanentlyFailed++
          }

          // Rate limit - apply after both success and error to respect API limits
          if (stats.totalProcessed < shows.length) {
            await delay(RATE_LIMIT_DELAY_MS)
          }
          continue
        }

        if (options.dryRun) {
          console.log(
            `  [DRY RUN] Would update "${show.name}": TheTVDB score ${seriesData.score}/10${retryLabel}`
          )
        } else {
          await upsertShow({
            ...show,
            thetvdb_score: seriesData.score,
          })

          // Reset retry tracking on success
          await pool.query(
            `UPDATE shows
             SET thetvdb_fetch_attempts = 0,
                 thetvdb_last_fetch_attempt = NULL,
                 thetvdb_fetch_error = NULL
             WHERE tmdb_id = $1`,
            [show.tmdb_id]
          )
        }

        stats.successful++
        consecutiveFailures = 0 // Reset circuit breaker on success
      } catch (error) {
        console.error(`  ❌ Error processing "${show.name}"${retryLabel}:`, error)
        stats.failed++
        consecutiveFailures++

        // Circuit breaker: stop if too many consecutive failures (API likely down)
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.error(
            `\n❌ Circuit breaker tripped: ${consecutiveFailures} consecutive failures detected`
          )
          console.error(
            "   The TheTVDB API may be experiencing an outage. Stopping to prevent futile requests."
          )
          console.error(
            `   Processed ${stats.totalProcessed}/${shows.length} shows before stopping (${stats.successful} successful, ${stats.failed} errors)\n`
          )

          await pool.end()
          process.exit(2) // Exit code 2 indicates circuit breaker trip
        }

        if (!options.dryRun) {
          const errorMsg = error instanceof Error ? error.message : "unknown error"
          const permanent = isPermanentError(error)
          const willMarkPermanent = permanent || attemptNum >= 3

          await pool.query(
            `UPDATE shows
             SET thetvdb_fetch_attempts = $1,
                 thetvdb_last_fetch_attempt = NOW(),
                 thetvdb_fetch_error = $2,
                 thetvdb_permanently_failed = $3
             WHERE tmdb_id = $4`,
            [attemptNum, errorMsg.substring(0, 500), willMarkPermanent, show.tmdb_id]
          )

          if (willMarkPermanent) stats.permanentlyFailed++
        }
      }

      // Rate limit - apply after both success and error to respect API limits
      if (stats.totalProcessed < shows.length) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
    }

    // Print summary
    console.log("\n")
    console.log("=".repeat(50))
    console.log("📊 Summary")
    console.log("=".repeat(50))
    console.log(`Total processed: ${stats.totalProcessed}`)
    console.log(`Successful: ${stats.successful}`)
    console.log(`Failed: ${stats.failed}`)
    if (stats.permanentlyFailed > 0) {
      console.log(`Permanently failed: ${stats.permanentlyFailed}`)
    }
    console.log(`Skipped (no score): ${stats.skipped}`)

    if (options.dryRun) {
      console.log("\n⚠️  DRY RUN - No changes were made to the database")
    }
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

run(options)
