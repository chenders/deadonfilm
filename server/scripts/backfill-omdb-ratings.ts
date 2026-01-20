#!/usr/bin/env tsx
/**
 * Backfill OMDb ratings for movies, shows, and episodes
 *
 * This script fetches IMDb ratings, Rotten Tomatoes scores, and Metacritic scores
 * from the OMDb API for all content with IMDb IDs.
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

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be positive integer")
  }
  return n
}

function parseFloat(value: string): number {
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
}

interface BackfillStats {
  totalProcessed: number
  successful: number
  failed: number
  skipped: number
  moviesUpdated: number
  showsUpdated: number
  episodesUpdated: number
}

const program = new Command()
  .name("backfill-omdb-ratings")
  .description("Backfill OMDb ratings for movies, shows, and episodes")
  .option("-l, --limit <n>", "Process only N items", parsePositiveInt)
  .option("--movies-only", "Only backfill movies")
  .option("--shows-only", "Only backfill shows")
  .option("--episodes", "Include episodes (default: false)")
  .option("-n, --dry-run", "Preview without writing")
  .option("--min-popularity <n>", "Skip items below popularity threshold", parseFloat)

program.parse()

const options = program.opts<BackfillOptions>()

async function backfillMovies(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean
): Promise<{ processed: number; successful: number; failed: number }> {
  const db = getPool()

  const query = `
    SELECT tmdb_id, title, imdb_id, popularity
    FROM movies
    WHERE imdb_id IS NOT NULL
      AND omdb_updated_at IS NULL
      ${minPopularity ? `AND popularity >= $2` : ""}
    ORDER BY popularity DESC NULLS LAST
    ${limit ? `LIMIT $1` : ""}
  `

  const params = []
  if (limit) params.push(limit)
  if (minPopularity) params.push(minPopularity)

  const result = await db.query<MovieRecord>(query, params)
  const movies = result.rows

  console.log(`\nFound ${movies.length} movies to backfill`)

  let processed = 0
  let successful = 0
  let failed = 0

  for (const movie of movies) {
    processed++

    if (processed % 10 === 0) {
      console.log(`Progress: ${processed}/${movies.length} movies processed...`)
    }

    try {
      const ratings = await getOMDbRatings(movie.imdb_id!)

      if (!ratings) {
        console.log(`  ⚠️  No ratings found for "${movie.title}" (${movie.imdb_id})`)
        failed++
        continue
      }

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would update "${movie.title}": IMDb ${ratings.imdbRating}/10 ` +
            `(${ratings.imdbVotes} votes), RT ${ratings.rottenTomatoesScore}%`
        )
      } else {
        await upsertMovie({
          ...movie,
          omdb_imdb_rating: ratings.imdbRating,
          omdb_imdb_votes: ratings.imdbVotes,
          omdb_rotten_tomatoes_score: ratings.rottenTomatoesScore,
          omdb_rotten_tomatoes_audience: ratings.rottenTomatoesAudience,
          omdb_metacritic_score: ratings.metacriticScore,
          omdb_updated_at: new Date(),
        })
      }

      successful++
    } catch (error) {
      console.error(`  ❌ Error processing "${movie.title}":`, error)
      failed++
    }
  }

  return { processed, successful, failed }
}

async function backfillShows(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean
): Promise<{ processed: number; successful: number; failed: number }> {
  const db = getPool()

  const query = `
    SELECT tmdb_id, name, imdb_id, popularity,
           first_air_date, last_air_date, poster_path, backdrop_path,
           genres, status, number_of_seasons, number_of_episodes,
           vote_average, origin_country, original_language,
           cast_count, deceased_count, living_count,
           expected_deaths, mortality_surprise_score,
           tvmaze_id, thetvdb_id
    FROM shows
    WHERE imdb_id IS NOT NULL
      AND omdb_updated_at IS NULL
      ${minPopularity ? `AND popularity >= $2` : ""}
    ORDER BY popularity DESC NULLS LAST
    ${limit ? `LIMIT $1` : ""}
  `

  const params = []
  if (limit) params.push(limit)
  if (minPopularity) params.push(minPopularity)

  const result = await db.query<ShowRecord>(query, params)
  const shows = result.rows

  console.log(`\nFound ${shows.length} shows to backfill`)

  let processed = 0
  let successful = 0
  let failed = 0

  for (const show of shows) {
    processed++

    if (processed % 10 === 0) {
      console.log(`Progress: ${processed}/${shows.length} shows processed...`)
    }

    try {
      const ratings = await getOMDbRatings(show.imdb_id!)

      if (!ratings) {
        console.log(`  ⚠️  No ratings found for "${show.name}" (${show.imdb_id})`)
        failed++
        continue
      }

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would update "${show.name}": IMDb ${ratings.imdbRating}/10 ` +
            `(${ratings.imdbVotes} votes), RT ${ratings.rottenTomatoesScore}%`
        )
      } else {
        await upsertShow({
          ...show,
          omdb_imdb_rating: ratings.imdbRating,
          omdb_imdb_votes: ratings.imdbVotes,
          omdb_rotten_tomatoes_score: ratings.rottenTomatoesScore,
          omdb_rotten_tomatoes_audience: ratings.rottenTomatoesAudience,
          omdb_metacritic_score: ratings.metacriticScore,
          omdb_updated_at: new Date(),
        })
      }

      successful++
    } catch (error) {
      console.error(`  ❌ Error processing "${show.name}":`, error)
      failed++
    }
  }

  return { processed, successful, failed }
}

async function run(options: BackfillOptions) {
  const stats: BackfillStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
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
        options.dryRun || false
      )
      stats.totalProcessed += movieResults.processed
      stats.successful += movieResults.successful
      stats.failed += movieResults.failed
      stats.moviesUpdated = movieResults.successful
    }

    // Backfill shows
    if (!options.moviesOnly) {
      const showResults = await backfillShows(
        options.limit,
        options.minPopularity,
        options.dryRun || false
      )
      stats.totalProcessed += showResults.processed
      stats.successful += showResults.successful
      stats.failed += showResults.failed
      stats.showsUpdated = showResults.successful
    }

    // Print summary
    console.log("\n")
    console.log("=" .repeat(50))
    console.log("📊 Summary")
    console.log("=" .repeat(50))
    console.log(`Total processed: ${stats.totalProcessed}`)
    console.log(`Successful: ${stats.successful}`)
    console.log(`Failed: ${stats.failed}`)
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
