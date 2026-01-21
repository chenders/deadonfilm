#!/usr/bin/env tsx
/**
 * Backfill IMDb IDs for movies from TMDB external_ids API.
 *
 * This script is a prerequisite for OMDb and Trakt rating backfills,
 * which require IMDb IDs to perform their lookups.
 *
 * Features:
 * - Exponential backoff retry logic (max 3 attempts)
 * - Marks permanently failed items after 3 attempts
 * - Respects rate limits with configurable delay
 * - Processes highest popularity movies first
 *
 * Usage:
 *   npm run backfill:movie-imdb-ids -- [options]
 *
 * Options:
 *   --limit <n>           Limit number of movies to process
 *   --min-popularity <n>  Only process movies with popularity >= n
 *   --dry-run            Preview without writing to database
 *
 * Examples:
 *   npm run backfill:movie-imdb-ids -- --limit 500
 *   npm run backfill:movie-imdb-ids -- --min-popularity 10 --dry-run
 */

import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { getMovieExternalIds } from "../src/lib/tmdb.js"

function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function parseNonNegativeNumber(value: string): number {
  const parsed = parseFloat(value)
  if (isNaN(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Must be a non-negative number")
  }
  return parsed
}

interface MovieInfo {
  tmdb_id: number
  title: string
  popularity: number | null
  external_ids_fetch_attempts: number
}

const RATE_LIMIT_DELAY_MS = 100 // 100ms between requests

const program = new Command()
  .name("backfill-movie-imdb-ids")
  .description("Backfill IMDb IDs for movies from TMDB")
  .option("-l, --limit <number>", "Limit number of movies to process", parsePositiveInt)
  .option(
    "--min-popularity <number>",
    "Only process movies with popularity >= n",
    parseNonNegativeNumber
  )
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
      minPopularity?: number
      dryRun?: boolean
      maxConsecutiveFailures?: number
    }) => {
      if (options.dryRun) {
        await runBackfill(options)
      } else {
        await withNewRelicTransaction("backfill-movie-imdb-ids", async (recordMetrics) => {
          const stats = await runBackfill(options)
          recordMetrics({
            recordsProcessed: stats.processed,
            recordsUpdated: stats.updated,
            recordsFailed: stats.failed,
            errorsEncountered: stats.errors,
          })
        })
      }
    }
  )

async function runBackfill(options: {
  limit?: number
  minPopularity?: number
  dryRun?: boolean
  maxConsecutiveFailures?: number
}): Promise<{ processed: number; updated: number; failed: number; errors: number }> {
  const { limit, minPopularity, dryRun, maxConsecutiveFailures = 3 } = options

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  const db = getPool()

  console.log(`\nBackfilling movie IMDb IDs${dryRun ? " (DRY RUN)" : ""}`)
  if (minPopularity !== undefined) console.log(`Min popularity: ${minPopularity}`)
  if (limit) console.log(`Limit: ${limit} movies`)
  console.log()

  // Build query - find movies needing IMDb IDs with retry logic
  let query = `
    SELECT tmdb_id, title, popularity, external_ids_fetch_attempts
    FROM movies
    WHERE imdb_id IS NULL
      AND external_ids_permanently_failed = false
      AND external_ids_fetch_attempts < 3
      AND (
        external_ids_last_fetch_attempt IS NULL
        OR external_ids_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, external_ids_fetch_attempts)
      )
  `

  const params: (number | string)[] = []

  if (minPopularity !== undefined) {
    params.push(minPopularity)
    query += ` AND popularity >= $${params.length}`
  }

  query += " ORDER BY popularity DESC NULLS LAST"

  if (limit) {
    params.push(limit)
    query += ` LIMIT $${params.length}`
  }

  const result = await db.query<MovieInfo>(query, params)
  const movies = result.rows

  console.log(`Found ${movies.length} movies to process\n`)

  let processed = 0
  let updated = 0
  let failed = 0
  let errors = 0
  let consecutiveFailures = 0

  for (const movie of movies) {
    processed++
    const attemptNum = movie.external_ids_fetch_attempts + 1
    const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""
    process.stdout.write(`[${processed}/${movies.length}] ${movie.title}${retryLabel}... `)

    try {
      const externalIds = await getMovieExternalIds(movie.tmdb_id)

      if (externalIds.imdb_id) {
        if (!dryRun) {
          // Success - reset retry counters
          await db.query(
            `UPDATE movies
             SET imdb_id = $1,
                 external_ids_fetch_attempts = 0,
                 external_ids_last_fetch_attempt = NULL,
                 external_ids_fetch_error = NULL
             WHERE tmdb_id = $2`,
            [externalIds.imdb_id, movie.tmdb_id]
          )
        }
        updated++
        consecutiveFailures = 0 // Reset circuit breaker on success
        console.log(`${dryRun ? "would set: " : ""}${externalIds.imdb_id}`)
      } else {
        // No IMDb ID found - this is a permanent condition (not an error)
        if (!dryRun) {
          const willMarkPermanent = attemptNum >= 3
          await db.query(
            `UPDATE movies
             SET external_ids_fetch_attempts = $1,
                 external_ids_last_fetch_attempt = NOW(),
                 external_ids_fetch_error = 'No IMDb ID available',
                 external_ids_permanently_failed = $2
             WHERE tmdb_id = $3`,
            [attemptNum, willMarkPermanent, movie.tmdb_id]
          )
          if (willMarkPermanent) {
            failed++
          }
        }
        console.log(`no IMDb ID found${attemptNum >= 3 ? " - marking permanently failed" : ""}`)
      }

      // Rate limit delay
      if (processed < movies.length) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
    } catch (error) {
      errors++
      consecutiveFailures++
      const errorMsg = error instanceof Error ? error.message : "unknown error"
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
          `   Processed ${processed}/${movies.length} movies before stopping (${updated} updated, ${errors} errors)\n`
        )

        if (!dryRun) {
          await db.end()
        }
        process.exit(2) // Exit code 2 indicates circuit breaker trip
      }

      // Update retry tracking
      if (!dryRun) {
        const willMarkPermanent = attemptNum >= 3
        await db.query(
          `UPDATE movies
           SET external_ids_fetch_attempts = $1,
               external_ids_last_fetch_attempt = NOW(),
               external_ids_fetch_error = $2,
               external_ids_permanently_failed = $3
           WHERE tmdb_id = $4`,
          [attemptNum, errorMsg.substring(0, 500), willMarkPermanent, movie.tmdb_id]
        )
        if (willMarkPermanent) {
          failed++
        }
      }
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log(`Processed: ${processed}`)
  console.log(`${dryRun ? "Would update" : "Updated"}: ${updated}`)
  if (failed > 0) {
    console.log(`Permanently failed: ${failed}`)
  }
  if (errors > 0) {
    console.log(`Errors: ${errors}`)
  }

  await resetPool()

  return { processed, updated, failed, errors }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
