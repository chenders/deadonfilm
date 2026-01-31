#!/usr/bin/env tsx
/**
 * Backfill original_title and alternate_titles for movies from TMDB.
 *
 * This script fetches movie details and alternative titles from TMDB to populate
 * the original_title and alternate_titles columns. These are used for better IMDb ID
 * matching when the primary English title doesn't match.
 *
 * Features:
 * - Fetches original_title from movie details endpoint
 * - Fetches alternate_titles from alternative_titles endpoint
 * - Exponential backoff retry logic (max 3 attempts)
 * - Marks permanently failed items after 3 attempts
 * - Classifies errors as permanent (404, 400, 401) vs transient (500, 503, timeouts)
 * - Respects rate limits with configurable delay between requests
 *
 * Usage:
 *   npm run backfill:movie-alternate-titles -- [options]
 *
 * Options:
 *   -l, --limit <n>           Limit number of movies to process (default: 100)
 *   --min-popularity <n>      Only process movies with popularity >= n
 *   -n, --dry-run             Preview without writing to database
 *   --max-consecutive-failures <n>  Stop after N consecutive failures (default: 5)
 *
 * Examples:
 *   npm run backfill:movie-alternate-titles -- --limit 500 --dry-run
 *   npm run backfill:movie-alternate-titles -- --min-popularity 10 --limit 1000
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import {
  getMovieDetailsWithOriginalTitle,
  getMovieAlternativeTitles,
  TMDBAlternativeTitle,
} from "../src/lib/tmdb.js"
import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"

const RATE_LIMIT_DELAY_MS = 100

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
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
  alternate_titles_fetch_attempts: number
}

interface BackfillOptions {
  limit: number
  minPopularity?: number
  dryRun: boolean
  maxConsecutiveFailures: number
}

interface Stats {
  processed: number
  updated: number
  skipped: number
  failed: number
  errors: number
}

function isPermanentError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    // 404 = movie not found in TMDB
    // 400 = bad request (invalid movie ID)
    // 401 = unauthorized (bad API key, but we'd see all failures)
    if (
      message.includes("404") ||
      message.includes("not found") ||
      message.includes("400") ||
      message.includes("401")
    ) {
      return true
    }
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function backfillAlternateTitles(options: BackfillOptions): Promise<Stats> {
  const { limit, minPopularity, dryRun, maxConsecutiveFailures } = options

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("Error: TMDB_API_TOKEN environment variable is not set")
    process.exit(1)
  }

  const db = getPool()

  console.log(`\nBackfilling movie alternate titles${dryRun ? " (DRY RUN)" : ""}`)
  if (minPopularity !== undefined) console.log(`Min popularity: ${minPopularity}`)
  console.log(`Limit: ${limit} movies`)
  console.log()

  // Find movies without original_title or alternate_titles, with retry logic
  const params: (number | string)[] = []
  let query = `
    SELECT tmdb_id, title, popularity, COALESCE(alternate_titles_fetch_attempts, 0) as alternate_titles_fetch_attempts
    FROM movies
    WHERE tmdb_id IS NOT NULL
      AND (original_title IS NULL OR alternate_titles IS NULL)
      AND COALESCE(alternate_titles_permanently_failed, false) = false
      AND COALESCE(alternate_titles_fetch_attempts, 0) < 3
      AND (
        alternate_titles_last_fetch_attempt IS NULL
        OR alternate_titles_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, COALESCE(alternate_titles_fetch_attempts, 0))
      )
  `

  if (minPopularity !== undefined) {
    params.push(minPopularity)
    query += ` AND popularity >= $${params.length}`
  }

  query += ` ORDER BY popularity DESC NULLS LAST, tmdb_id`

  params.push(limit)
  query += ` LIMIT $${params.length}`

  const result = await db.query<MovieInfo>(query, params)
  const movies = result.rows

  if (movies.length === 0) {
    console.log("No movies found that need alternate titles.")
    await resetPool()
    return { processed: 0, updated: 0, skipped: 0, failed: 0, errors: 0 }
  }

  console.log(`Found ${movies.length} movies to process\n`)

  let processed = 0
  let updated = 0
  const skipped = 0
  let failed = 0
  let errors = 0
  let consecutiveFailures = 0

  for (const movie of movies) {
    processed++
    const attemptNum = movie.alternate_titles_fetch_attempts + 1
    const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""
    process.stdout.write(`[${processed}/${movies.length}] ${movie.title}${retryLabel}... `)

    try {
      // Fetch both in parallel
      const [detailsResult, alternativesResult] = await Promise.all([
        getMovieDetailsWithOriginalTitle(movie.tmdb_id),
        getMovieAlternativeTitles(movie.tmdb_id),
      ])

      const originalTitle = detailsResult.original_title
      const alternateTitles: TMDBAlternativeTitle[] = alternativesResult.titles || []

      // Update database
      if (!dryRun) {
        await db.query(
          `UPDATE movies
           SET original_title = $1,
               alternate_titles = $2,
               alternate_titles_fetch_attempts = 0,
               alternate_titles_last_fetch_attempt = NULL,
               alternate_titles_fetch_error = NULL,
               alternate_titles_permanently_failed = false
           WHERE tmdb_id = $3`,
          [originalTitle, JSON.stringify(alternateTitles), movie.tmdb_id]
        )
      }

      updated++
      consecutiveFailures = 0

      const altCount = alternateTitles.length
      if (originalTitle !== movie.title) {
        console.log(
          `${dryRun ? "would set: " : ""}original="${originalTitle}", ${altCount} alternates`
        )
      } else {
        console.log(`${dryRun ? "would set: " : ""}same as title, ${altCount} alternates`)
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

      // Circuit breaker
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
          await resetPool()
        }
        process.exit(2)
      }

      // Update retry tracking
      if (!dryRun) {
        const willMarkPermanent = attemptNum >= 3 || isPermanentError(error)
        await db.query(
          `UPDATE movies
           SET alternate_titles_fetch_attempts = $1,
               alternate_titles_last_fetch_attempt = NOW(),
               alternate_titles_fetch_error = $2,
               alternate_titles_permanently_failed = $3
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
  if (skipped > 0) {
    console.log(`Skipped: ${skipped}`)
  }
  if (errors > 0) {
    console.log(`Errors: ${errors}`)
  }

  await resetPool()

  return { processed, updated, skipped, failed, errors }
}

const program = new Command()
  .name("backfill-movie-alternate-titles")
  .description("Backfill original_title and alternate_titles for movies from TMDB")
  .option("-l, --limit <number>", "Limit number of movies to process", parsePositiveInt, 100)
  .option(
    "--min-popularity <number>",
    "Only process movies with popularity >= n",
    parseNonNegativeNumber
  )
  .option("-n, --dry-run", "Preview without writing to database")
  .option(
    "--max-consecutive-failures <number>",
    "Stop after N consecutive failures (circuit breaker)",
    parsePositiveInt,
    5
  )
  .action(async (options) => {
    if (options.dryRun) {
      await backfillAlternateTitles(options)
    } else {
      await withNewRelicTransaction("backfill-movie-alternate-titles", async (recordMetrics) => {
        const stats = await backfillAlternateTitles(options)
        recordMetrics({
          recordsProcessed: stats.processed,
          recordsUpdated: stats.updated,
          recordsFailed: stats.failed,
          errorsEncountered: stats.errors,
        })
      })
    }
  })

const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
