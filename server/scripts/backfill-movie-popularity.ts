#!/usr/bin/env tsx
import { fileURLToPath } from "node:url"
/**
 * Backfill missing movie popularity scores from TMDB.
 *
 * Movies added via actor filmography imports often lack popularity scores.
 * This script fetches movie details from TMDB and updates the popularity field.
 *
 * Features:
 * - Exponential backoff retry logic (max 3 attempts)
 * - Marks permanently failed items after 3 attempts
 * - Classifies errors as permanent (404, 400, 401) vs transient (500, 503, timeouts)
 * - Respects rate limits with 50ms delay between requests
 *
 * Usage:
 *   npx tsx scripts/backfill-movie-popularity.ts [options]
 *
 * Options:
 *   -l, --limit <n>     Limit number of movies to process (default: 100)
 *   -y, --year <year>   Only process movies from a specific year
 *   -n, --dry-run       Preview without writing to database
 *
 * Examples:
 *   npx tsx scripts/backfill-movie-popularity.ts --limit 50 --dry-run
 *   npx tsx scripts/backfill-movie-popularity.ts --year 2020 --limit 500
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { getMovieDetails } from "../src/lib/tmdb.js"
import { isPermanentError } from "../src/lib/backfill-utils.js"

const RATE_LIMIT_DELAY_MS = 50

export function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface BackfillOptions {
  limit: number
  year?: number
  dryRun: boolean
  maxConsecutiveFailures: number
}

interface MovieInfo {
  tmdb_id: number
  title: string
  release_year: number | null
  popularity_fetch_attempts: number
}

async function backfillMoviePopularity(options: BackfillOptions): Promise<void> {
  const { limit, year, dryRun, maxConsecutiveFailures } = options

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set")
    process.exit(1)
  }

  const db = getPool()

  try {
    // Find movies with NULL popularity, with retry logic
    const params: (number | string)[] = []
    let query = `
      SELECT tmdb_id, title, release_year, popularity_fetch_attempts
      FROM movies
      WHERE popularity IS NULL
        AND tmdb_id IS NOT NULL
        AND popularity_permanently_failed = false
        AND popularity_fetch_attempts < 3
        AND (
          popularity_last_fetch_attempt IS NULL
          OR popularity_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, popularity_fetch_attempts)
        )
    `

    if (year) {
      params.push(year)
      query += ` AND release_year = $${params.length}`
    }

    query += ` ORDER BY release_year DESC NULLS LAST, tmdb_id`

    params.push(limit)
    query += ` LIMIT $${params.length}`

    const result = await db.query<MovieInfo>(query, params)
    const movies = result.rows

    if (movies.length === 0) {
      console.log("No movies with NULL popularity found.")
      await resetPool()
      return
    }

    console.log(`Found ${movies.length} movies with NULL popularity`)
    if (year) {
      console.log(`  Filtering by year: ${year}`)
    }
    console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`)
    console.log()

    let updated = 0
    let permanentlyFailed = 0
    let errors = 0
    let consecutiveFailures = 0

    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i]
      const attemptNum = movie.popularity_fetch_attempts + 1
      const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""
      const progress = `[${i + 1}/${movies.length}]`

      try {
        const details = await getMovieDetails(movie.tmdb_id)

        if (details.popularity !== undefined && details.popularity !== null) {
          if (dryRun) {
            console.log(
              `${progress} ${movie.title} (${movie.release_year}) -> popularity: ${details.popularity}${retryLabel}`
            )
          } else {
            await db.query(
              `UPDATE movies
               SET popularity = $1,
                   updated_at = CURRENT_TIMESTAMP,
                   popularity_fetch_attempts = 0,
                   popularity_last_fetch_attempt = NULL,
                   popularity_fetch_error = NULL
               WHERE tmdb_id = $2`,
              [details.popularity, movie.tmdb_id]
            )
            console.log(
              `${progress} Updated: ${movie.title} (${movie.release_year}) -> ${details.popularity}${retryLabel}`
            )
          }
          updated++
          consecutiveFailures = 0 // Reset circuit breaker on success
        } else {
          console.log(`${progress} No popularity for: ${movie.title}${retryLabel}`)

          // No popularity is a permanent condition
          if (!dryRun) {
            const willMarkPermanent = attemptNum >= 3
            await db.query(
              `UPDATE movies
               SET popularity_fetch_attempts = $1,
                   popularity_last_fetch_attempt = NOW(),
                   popularity_fetch_error = 'No popularity available',
                   popularity_permanently_failed = $2
               WHERE tmdb_id = $3`,
              [attemptNum, willMarkPermanent, movie.tmdb_id]
            )
            if (willMarkPermanent) permanentlyFailed++
          }
        }

        // Rate limiting
        if (i < movies.length - 1) {
          await delay(RATE_LIMIT_DELAY_MS)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`${progress} Error fetching ${movie.title}${retryLabel}: ${message}`)
        errors++
        consecutiveFailures++

        // Circuit breaker: stop if too many consecutive failures (API likely down)
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.error(
            `\n❌ Circuit breaker tripped: ${consecutiveFailures} consecutive failures detected`
          )
          console.error(
            "   The TMDB API may be experiencing an outage. Stopping to prevent futile requests."
          )
          console.error(
            `   Processed ${i + 1}/${movies.length} movies before stopping (${updated} updated, ${errors} errors)\n`
          )

          await resetPool()
          process.exit(2) // Exit code 2 indicates circuit breaker trip
        }

        if (!dryRun) {
          const permanent = isPermanentError(error)
          const willMarkPermanent = permanent || attemptNum >= 3

          await db.query(
            `UPDATE movies
             SET popularity_fetch_attempts = $1,
                 popularity_last_fetch_attempt = NOW(),
                 popularity_fetch_error = $2,
                 popularity_permanently_failed = $3
             WHERE tmdb_id = $4`,
            [attemptNum, message.substring(0, 500), willMarkPermanent, movie.tmdb_id]
          )

          if (willMarkPermanent) permanentlyFailed++
        }
      }

      // Rate limit - apply after both success and error to respect API limits
      if (i < movies.length - 1) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
    }

    console.log()
    console.log("=".repeat(50))
    console.log(`Complete!`)
    console.log(`  Processed: ${movies.length}`)
    console.log(`  Updated: ${updated}`)
    console.log(`  Errors: ${errors}`)
    if (permanentlyFailed > 0) {
      console.log(`  Permanently failed: ${permanentlyFailed}`)
    }
    if (dryRun) {
      console.log(`  (Dry run - no changes made)`)
    }
  } finally {
    await resetPool()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const program = new Command()
  .name("backfill-movie-popularity")
  .description("Backfill missing movie popularity scores from TMDB")
  .option("-l, --limit <number>", "Limit number of movies to process", parsePositiveInt, 100)
  .option("-y, --year <year>", "Only process movies from a specific year", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing to database")
  .option(
    "--max-consecutive-failures <number>",
    "Stop processing after N consecutive failures (circuit breaker)",
    parsePositiveInt,
    3
  )
  .action(async (options) => {
    await backfillMoviePopularity({
      limit: options.limit,
      year: options.year,
      dryRun: options.dryRun || false,
      maxConsecutiveFailures: options.maxConsecutiveFailures,
    })
  })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parse()
}
