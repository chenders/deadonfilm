#!/usr/bin/env tsx
/**
 * Backfill OMDb ratings for movies, shows, and episodes
 *
 * This script fetches IMDb ratings, Rotten Tomatoes scores, and Metacritic scores
 * from the OMDb API for all content with IMDb IDs.
 *
 * Features:
 * - Exponential backoff retry logic (max 3 attempts)
 * - Marks permanently failed items after 3 attempts
 * - Classifies errors as permanent (404, 400, 401) vs transient (500, 503, timeouts)
 * - Respects rate limits with 200ms delay between requests
 *
 * Usage:
 *   npm run backfill:omdb -- [options]
 *
 * Options:
 *   -l, --limit <n>           Process only N items
 *   --movies-only             Only backfill movies
 *   --shows-only              Only backfill shows
 *   --episodes                Include episodes (default: false)
 *   -n, --dry-run             Preview without writing
 *   --min-popularity <n>      Skip items below popularity threshold
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db/pool.js"
import { getOMDbRatings } from "../src/lib/omdb.js"
import { upsertMovie } from "../src/lib/db/movies.js"
import { upsertShow } from "../src/lib/db/shows.js"
import type { MovieRecord, ShowRecord } from "../src/lib/db/types.js"
import { isPermanentError } from "../src/lib/backfill-utils.js"

const RATE_LIMIT_DELAY_MS = 200

export function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be positive integer")
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
  moviesOnly?: boolean
  showsOnly?: boolean
  episodes?: boolean
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
  moviesUpdated: number
  showsUpdated: number
  episodesUpdated: number
}

interface MovieInfo extends MovieRecord {
  omdb_fetch_attempts: number
}

interface ShowInfo extends ShowRecord {
  omdb_fetch_attempts: number
}

const program = new Command()
  .name("backfill-omdb-ratings")
  .description("Backfill OMDb ratings for movies, shows, and episodes")
  .option("-l, --limit <n>", "Process only N items", parsePositiveInt)
  .option("--movies-only", "Only backfill movies")
  .option("--shows-only", "Only backfill shows")
  .option("--episodes", "Include episodes (default: false)")
  .option("-n, --dry-run", "Preview without writing")
  .option("--min-popularity <n>", "Skip items below popularity threshold", parseNonNegativeFloat)
  .option(
    "--max-consecutive-failures <number>",
    "Stop processing after N consecutive failures (circuit breaker)",
    parsePositiveInt,
    3
  )

program.parse()

const options = program.opts<BackfillOptions>()

async function backfillMovies(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean,
  maxConsecutiveFailures: number
): Promise<{ processed: number; successful: number; failed: number; permanentlyFailed: number }> {
  const db = getPool()

  const conditions: string[] = [
    "imdb_id IS NOT NULL",
    "omdb_updated_at IS NULL",
    "omdb_permanently_failed = false",
    "omdb_fetch_attempts < 3",
    `(
      omdb_last_fetch_attempt IS NULL
      OR omdb_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, omdb_fetch_attempts)
    )`,
  ]

  const params: number[] = []
  let paramIndex = 1

  if (minPopularity !== undefined) {
    conditions.push(`popularity >= $${paramIndex}`)
    params.push(minPopularity)
    paramIndex += 1
  }

  let limitClause = ""
  if (limit !== undefined) {
    limitClause = `LIMIT $${paramIndex}`
    params.push(limit)
    paramIndex += 1
  }

  const query = `
    SELECT tmdb_id, title, imdb_id, popularity, omdb_fetch_attempts
    FROM movies
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

  const result = await db.query<MovieInfo>(query, params)
  const movies = result.rows

  console.log(`\nFound ${movies.length} movies to backfill`)

  let processed = 0
  let successful = 0
  let failed = 0
  let permanentlyFailed = 0
  let consecutiveFailures = 0

  for (const movie of movies) {
    processed++

    const attemptNum = movie.omdb_fetch_attempts + 1
    const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""

    if (processed % 10 === 0) {
      console.log(`Progress: ${processed}/${movies.length} movies processed...`)
    }

    try {
      const ratings = await getOMDbRatings(movie.imdb_id!)

      if (!ratings) {
        console.log(`  ⚠️  No ratings found for "${movie.title}" (${movie.imdb_id})${retryLabel}`)
        failed++

        // No ratings is a permanent condition
        if (!dryRun) {
          const willMarkPermanent = attemptNum >= 3
          await db.query(
            `UPDATE movies
             SET omdb_fetch_attempts = $1,
                 omdb_last_fetch_attempt = NOW(),
                 omdb_fetch_error = 'No ratings found',
                 omdb_permanently_failed = $2
             WHERE tmdb_id = $3`,
            [attemptNum, willMarkPermanent, movie.tmdb_id]
          )
          if (willMarkPermanent) permanentlyFailed++
        }

        // Rate limit - apply after both success and error to respect API limits
        if (processed < movies.length) {
          await delay(RATE_LIMIT_DELAY_MS)
        }
        continue
      }

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would update "${movie.title}": IMDb ${ratings.imdbRating}/10 ` +
            `(${ratings.imdbVotes} votes), RT ${ratings.rottenTomatoesScore}%${retryLabel}`
        )
      } else {
        // Success - update ratings and reset retry counters
        await upsertMovie({
          ...movie,
          omdb_imdb_rating: ratings.imdbRating,
          omdb_imdb_votes: ratings.imdbVotes,
          omdb_rotten_tomatoes_score: ratings.rottenTomatoesScore,
          omdb_rotten_tomatoes_audience: ratings.rottenTomatoesAudience,
          omdb_metacritic_score: ratings.metacriticScore,
          omdb_updated_at: new Date(),
        })

        // Reset retry tracking
        await db.query(
          `UPDATE movies
           SET omdb_fetch_attempts = 0,
               omdb_last_fetch_attempt = NULL,
               omdb_fetch_error = NULL
           WHERE tmdb_id = $1`,
          [movie.tmdb_id]
        )
      }

      successful++
      consecutiveFailures = 0 // Reset circuit breaker on success
    } catch (error) {
      console.error(`  ❌ Error processing "${movie.title}"${retryLabel}:`, error)
      failed++
      consecutiveFailures++

      // Circuit breaker: stop if too many consecutive failures (API likely down)
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.error(
          `\n❌ Circuit breaker tripped: ${consecutiveFailures} consecutive failures detected`
        )
        console.error(
          "   The OMDb API may be experiencing an outage. Stopping to prevent futile requests."
        )
        console.error(
          `   Processed ${processed}/${movies.length} movies before stopping (${successful} successful, ${failed} errors)\n`
        )

        await db.end()
        process.exit(2) // Exit code 2 indicates circuit breaker trip
      }

      if (!dryRun) {
        const errorMsg = error instanceof Error ? error.message : "unknown error"
        const permanent = isPermanentError(error)
        const willMarkPermanent = permanent || attemptNum >= 3

        await db.query(
          `UPDATE movies
           SET omdb_fetch_attempts = $1,
               omdb_last_fetch_attempt = NOW(),
               omdb_fetch_error = $2,
               omdb_permanently_failed = $3
           WHERE tmdb_id = $4`,
          [attemptNum, errorMsg.substring(0, 500), willMarkPermanent, movie.tmdb_id]
        )

        if (willMarkPermanent) permanentlyFailed++
      }
    }

    // Rate limit - apply after both success and error to respect API limits
    if (processed < movies.length) {
      await delay(RATE_LIMIT_DELAY_MS)
    }
  }

  return { processed, successful, failed, permanentlyFailed }
}

async function backfillShows(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean,
  maxConsecutiveFailures: number
): Promise<{ processed: number; successful: number; failed: number; permanentlyFailed: number }> {
  const db = getPool()

  const conditions: string[] = [
    "imdb_id IS NOT NULL",
    "omdb_updated_at IS NULL",
    "omdb_permanently_failed = false",
    "omdb_fetch_attempts < 3",
    `(
      omdb_last_fetch_attempt IS NULL
      OR omdb_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, omdb_fetch_attempts)
    )`,
  ]

  const params: number[] = []
  let paramIndex = 1

  if (minPopularity !== undefined) {
    conditions.push(`popularity >= $${paramIndex}`)
    params.push(minPopularity)
    paramIndex += 1
  }

  let limitClause = ""
  if (limit !== undefined) {
    limitClause = `LIMIT $${paramIndex}`
    params.push(limit)
    paramIndex += 1
  }

  const query = `
    SELECT tmdb_id, name, imdb_id, popularity,
           first_air_date, last_air_date, poster_path, backdrop_path,
           genres, status, number_of_seasons, number_of_episodes,
           vote_average, origin_country, original_language,
           cast_count, deceased_count, living_count,
           expected_deaths, mortality_surprise_score,
           tvmaze_id, thetvdb_id, omdb_fetch_attempts
    FROM shows
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

  const result = await db.query<ShowInfo>(query, params)
  const shows = result.rows

  console.log(`\nFound ${shows.length} shows to backfill`)

  let processed = 0
  let successful = 0
  let failed = 0
  let permanentlyFailed = 0
  let consecutiveFailures = 0

  for (const show of shows) {
    processed++

    const attemptNum = show.omdb_fetch_attempts + 1
    const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""

    if (processed % 10 === 0) {
      console.log(`Progress: ${processed}/${shows.length} shows processed...`)
    }

    try {
      const ratings = await getOMDbRatings(show.imdb_id!)

      if (!ratings) {
        console.log(`  ⚠️  No ratings found for "${show.name}" (${show.imdb_id})${retryLabel}`)
        failed++

        // No ratings is a permanent condition
        if (!dryRun) {
          const willMarkPermanent = attemptNum >= 3
          await db.query(
            `UPDATE shows
             SET omdb_fetch_attempts = $1,
                 omdb_last_fetch_attempt = NOW(),
                 omdb_fetch_error = 'No ratings found',
                 omdb_permanently_failed = $2
             WHERE tmdb_id = $3`,
            [attemptNum, willMarkPermanent, show.tmdb_id]
          )
          if (willMarkPermanent) permanentlyFailed++
        }

        // Rate limit - apply after both success and error to respect API limits
        if (processed < shows.length) {
          await delay(RATE_LIMIT_DELAY_MS)
        }
        continue
      }

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would update "${show.name}": IMDb ${ratings.imdbRating}/10 ` +
            `(${ratings.imdbVotes} votes), RT ${ratings.rottenTomatoesScore}%${retryLabel}`
        )
      } else {
        // Success - update ratings and reset retry counters
        await upsertShow({
          ...show,
          omdb_imdb_rating: ratings.imdbRating,
          omdb_imdb_votes: ratings.imdbVotes,
          omdb_rotten_tomatoes_score: ratings.rottenTomatoesScore,
          omdb_rotten_tomatoes_audience: ratings.rottenTomatoesAudience,
          omdb_metacritic_score: ratings.metacriticScore,
          omdb_updated_at: new Date(),
        })

        // Reset retry tracking
        await db.query(
          `UPDATE shows
           SET omdb_fetch_attempts = 0,
               omdb_last_fetch_attempt = NULL,
               omdb_fetch_error = NULL
           WHERE tmdb_id = $1`,
          [show.tmdb_id]
        )
      }

      successful++
      consecutiveFailures = 0 // Reset circuit breaker on success
    } catch (error) {
      console.error(`  ❌ Error processing "${show.name}"${retryLabel}:`, error)
      failed++
      consecutiveFailures++

      // Circuit breaker: stop if too many consecutive failures (API likely down)
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.error(
          `\n❌ Circuit breaker tripped: ${consecutiveFailures} consecutive failures detected`
        )
        console.error(
          "   The OMDb API may be experiencing an outage. Stopping to prevent futile requests."
        )
        console.error(
          `   Processed ${processed}/${shows.length} shows before stopping (${successful} successful, ${failed} errors)\n`
        )

        await db.end()
        process.exit(2) // Exit code 2 indicates circuit breaker trip
      }

      if (!dryRun) {
        const errorMsg = error instanceof Error ? error.message : "unknown error"
        const permanent = isPermanentError(error)
        const willMarkPermanent = permanent || attemptNum >= 3

        await db.query(
          `UPDATE shows
           SET omdb_fetch_attempts = $1,
               omdb_last_fetch_attempt = NOW(),
               omdb_fetch_error = $2,
               omdb_permanently_failed = $3
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

  return { processed, successful, failed, permanentlyFailed }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run(options: BackfillOptions) {
  const stats: BackfillStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    permanentlyFailed: 0,
    skipped: 0,
    moviesUpdated: 0,
    showsUpdated: 0,
    episodesUpdated: 0,
  }

  const pool = getPool()

  try {
    console.log("🎬 OMDb Ratings Backfill Script")
    console.log("================================")
    console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
    console.log(`Limit: ${options.limit || "unlimited"}`)
    console.log(`Min popularity: ${options.minPopularity || "none"}`)
    console.log(`Movies only: ${options.moviesOnly ? "YES" : "NO"}`)
    console.log(`Shows only: ${options.showsOnly ? "YES" : "NO"}`)
    console.log(`Include episodes: ${options.episodes ? "YES" : "NO"}`)

    // Backfill movies
    if (!options.showsOnly) {
      const movieResults = await backfillMovies(
        options.limit,
        options.minPopularity,
        options.dryRun || false,
        options.maxConsecutiveFailures || 3
      )
      stats.totalProcessed += movieResults.processed
      stats.successful += movieResults.successful
      stats.failed += movieResults.failed
      stats.permanentlyFailed += movieResults.permanentlyFailed
      stats.moviesUpdated = movieResults.successful
    }

    // Backfill shows
    if (!options.moviesOnly) {
      const showResults = await backfillShows(
        options.limit,
        options.minPopularity,
        options.dryRun || false,
        options.maxConsecutiveFailures || 3
      )
      stats.totalProcessed += showResults.processed
      stats.successful += showResults.successful
      stats.failed += showResults.failed
      stats.permanentlyFailed += showResults.permanentlyFailed
      stats.showsUpdated = showResults.successful
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
    console.log(`Movies updated: ${stats.moviesUpdated}`)
    console.log(`Shows updated: ${stats.showsUpdated}`)

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

run(options)
