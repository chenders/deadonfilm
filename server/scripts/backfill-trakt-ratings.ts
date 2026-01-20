#!/usr/bin/env tsx
/**
 * Backfill Trakt ratings for movies and shows
 *
 * This script fetches user ratings, watch counts, and trending data from Trakt.tv API.
 * Movies use IMDb IDs, shows use TheTVDB IDs.
 *
 * Usage:
 *   npm run backfill:trakt -- [options]
 *
 * Options:
 *   -l, --limit <n>           Process only N items
 *   --movies-only             Only backfill movies
 *   --shows-only              Only backfill shows
 *   -n, --dry-run             Preview without writing
 *   --min-popularity <n>      Skip items below popularity threshold
 *   --trending-only           Only fetch trending content
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db/pool.js"
import { getTraktStats, getTrending } from "../src/lib/trakt.js"
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

function parseNonNegativeFloat(value: string): number {
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
  dryRun?: boolean
  minPopularity?: number
  trendingOnly?: boolean
}

interface BackfillStats {
  totalProcessed: number
  successful: number
  failed: number
  moviesUpdated: number
  showsUpdated: number
}

const program = new Command()
  .name("backfill-trakt-ratings")
  .description("Backfill Trakt ratings for movies and shows")
  .option("-l, --limit <n>", "Process only N items", parsePositiveInt)
  .option("--movies-only", "Only backfill movies")
  .option("--shows-only", "Only backfill shows")
  .option("-n, --dry-run", "Preview without writing")
  .option("--min-popularity <n>", "Skip items below popularity threshold", parseNonNegativeFloat)
  .option("--trending-only", "Only fetch trending content")

program.parse()

const options = program.opts<BackfillOptions>()

async function backfillMovies(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean,
  trendingOnly: boolean
): Promise<{ processed: number; successful: number; failed: number }> {
  const db = getPool()

  if (trendingOnly) {
    console.log("\nFetching trending movies from Trakt...")
    const trendingItems = await getTrending("movie", limit || 100)
    console.log(`Found ${trendingItems.length} trending movies`)

    let processed = 0
    let successful = 0
    let failed = 0

    for (let i = 0; i < trendingItems.length; i++) {
      const item = trendingItems[i]
      const movie = item.movie
      if (!movie) continue

      processed++

      try {
        // Find movie in our database by IMDb ID
        const result = await db.query<MovieRecord>("SELECT * FROM movies WHERE imdb_id = $1", [
          movie.ids.imdb,
        ])

        if (result.rows.length === 0) {
          console.log(`  ⚠️  Movie not in database: ${movie.title} (${movie.ids.imdb})`)
          failed++
          continue
        }

        const dbMovie = result.rows[0]

        if (dryRun) {
          console.log(
            `  [DRY RUN] Would update "${movie.title}": ` +
              `${item.watchers} watchers, trending rank ${i + 1}`
          )
        } else {
          await upsertMovie({
            ...dbMovie,
            trakt_watchers: item.watchers,
            trakt_trending_rank: i + 1,
            trakt_updated_at: new Date(),
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

  // Regular backfill (non-trending)
  const conditions: string[] = ["imdb_id IS NOT NULL", "trakt_updated_at IS NULL"]

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
    SELECT tmdb_id, title, imdb_id, popularity,
           release_date, release_year, poster_path, genres,
           original_language, production_countries, vote_average,
           cast_count, deceased_count, living_count,
           expected_deaths, mortality_surprise_score
    FROM movies
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

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
      const stats = await getTraktStats("movie", movie.imdb_id!)

      if (!stats) {
        console.log(`  ⚠️  No stats found for "${movie.title}" (${movie.imdb_id})`)
        failed++
        continue
      }

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would update "${movie.title}": ` +
            `rating ${stats.rating}/10 (${stats.votes} votes), ` +
            `${stats.watchers} watchers, ${stats.plays} plays`
        )
      } else {
        await upsertMovie({
          ...movie,
          trakt_rating: stats.rating,
          trakt_votes: stats.votes,
          trakt_watchers: stats.watchers,
          trakt_plays: stats.plays,
          trakt_updated_at: new Date(),
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
  dryRun: boolean,
  trendingOnly: boolean
): Promise<{ processed: number; successful: number; failed: number }> {
  const db = getPool()

  if (trendingOnly) {
    console.log("\nFetching trending shows from Trakt...")
    const trendingItems = await getTrending("show", limit || 100)
    console.log(`Found ${trendingItems.length} trending shows`)

    let processed = 0
    let successful = 0
    let failed = 0

    for (let i = 0; i < trendingItems.length; i++) {
      const item = trendingItems[i]
      const show = item.show
      if (!show || !show.ids.tvdb) continue

      processed++

      try {
        // Find show in our database by TheTVDB ID
        const result = await db.query<ShowRecord>("SELECT * FROM shows WHERE thetvdb_id = $1", [
          show.ids.tvdb,
        ])

        if (result.rows.length === 0) {
          console.log(`  ⚠️  Show not in database: ${show.title} (${show.ids.tvdb})`)
          failed++
          continue
        }

        const dbShow = result.rows[0]

        if (dryRun) {
          console.log(
            `  [DRY RUN] Would update "${show.title}": ` +
              `${item.watchers} watchers, trending rank ${i + 1}`
          )
        } else {
          await upsertShow({
            ...dbShow,
            trakt_watchers: item.watchers,
            trakt_trending_rank: i + 1,
            trakt_updated_at: new Date(),
          })
        }

        successful++
      } catch (error) {
        console.error(`  ❌ Error processing "${show.title}":`, error)
        failed++
      }
    }

    return { processed, successful, failed }
  }

  // Regular backfill (non-trending)
  const conditions: string[] = ["thetvdb_id IS NOT NULL", "trakt_updated_at IS NULL"]

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
    SELECT tmdb_id, name, thetvdb_id, popularity,
           first_air_date, last_air_date, poster_path, backdrop_path,
           genres, status, number_of_seasons, number_of_episodes,
           vote_average, origin_country, original_language,
           cast_count, deceased_count, living_count,
           expected_deaths, mortality_surprise_score,
           tvmaze_id, imdb_id
    FROM shows
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

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
      const stats = await getTraktStats("show", show.thetvdb_id!.toString())

      if (!stats) {
        console.log(`  ⚠️  No stats found for "${show.name}" (${show.thetvdb_id})`)
        failed++
        continue
      }

      if (dryRun) {
        console.log(
          `  [DRY RUN] Would update "${show.name}": ` +
            `rating ${stats.rating}/10 (${stats.votes} votes), ` +
            `${stats.watchers} watchers, ${stats.plays} plays`
        )
      } else {
        await upsertShow({
          ...show,
          trakt_rating: stats.rating,
          trakt_votes: stats.votes,
          trakt_watchers: stats.watchers,
          trakt_plays: stats.plays,
          trakt_updated_at: new Date(),
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
    moviesUpdated: 0,
    showsUpdated: 0,
  }

  const pool = getPool()

  try {
    console.log("🎬 Trakt Ratings Backfill Script")
    console.log("=================================")
    console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
    console.log(`Limit: ${options.limit || "unlimited"}`)
    console.log(`Min popularity: ${options.minPopularity || "none"}`)
    console.log(`Movies only: ${options.moviesOnly ? "YES" : "NO"}`)
    console.log(`Shows only: ${options.showsOnly ? "YES" : "NO"}`)
    console.log(`Trending only: ${options.trendingOnly ? "YES" : "NO"}`)

    // Backfill movies
    if (!options.showsOnly) {
      const movieResults = await backfillMovies(
        options.limit,
        options.minPopularity,
        options.dryRun || false,
        options.trendingOnly || false
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
        options.dryRun || false,
        options.trendingOnly || false
      )
      stats.totalProcessed += showResults.processed
      stats.successful += showResults.successful
      stats.failed += showResults.failed
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
