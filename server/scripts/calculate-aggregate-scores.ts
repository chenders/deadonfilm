#!/usr/bin/env tsx
/**
 * Calculate aggregate scores for movies and TV shows
 *
 * This script computes a weighted "Dead on Film Score" from multiple rating sources
 * (IMDb, Rotten Tomatoes, Metacritic, Trakt, TMDB, TheTVDB) and stores the results
 * in the database for efficient querying and sorting.
 *
 * Usage:
 *   npm run calculate:aggregate-scores                    # Calculate for all content with ratings
 *   npm run calculate:aggregate-scores -- --movies-only   # Only calculate for movies
 *   npm run calculate:aggregate-scores -- --shows-only    # Only calculate for shows
 *   npm run calculate:aggregate-scores -- --dry-run       # Preview without updating database
 *   npm run calculate:aggregate-scores -- --limit 100     # Process only first 100 records
 *
 * This script should be run:
 * - After backfilling ratings from OMDb, Trakt, or TheTVDB
 * - Periodically to keep aggregate scores up to date
 * - After adding a new rating source
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db.js"
import {
  buildMovieRatingInputs,
  buildShowRatingInputs,
  calculateAggregateScore,
} from "../src/lib/aggregate-score.js"

interface Options {
  dryRun: boolean
  moviesOnly: boolean
  showsOnly: boolean
  limit: number | null
}

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

const program = new Command()
  .name("calculate-aggregate-scores")
  .description("Calculate weighted aggregate scores for movies and TV shows")
  .option("-n, --dry-run", "Preview changes without updating database")
  .option("-m, --movies-only", "Only calculate for movies")
  .option("-s, --shows-only", "Only calculate for shows")
  .option("-l, --limit <n>", "Limit to N records", parsePositiveInt)
  .action(async (options: Options) => {
    await run(options)
  })

async function run(options: Options): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (options.moviesOnly && options.showsOnly) {
    console.error("Cannot specify both --movies-only and --shows-only")
    process.exit(1)
  }

  const db = getPool()

  try {
    console.log("\nCalculating aggregate scores...")
    console.log(`Mode: ${options.dryRun ? "DRY RUN (no changes will be made)" : "LIVE"}`)
    if (options.limit) {
      console.log(`Limit: ${options.limit} records per type`)
    }
    console.log()

    let totalMovies = 0
    let totalShows = 0
    let updatedMovies = 0
    let updatedShows = 0
    let skippedMovies = 0
    let skippedShows = 0

    // Process movies
    if (!options.showsOnly) {
      console.log("Processing movies...")
      const limitClause = options.limit ? `LIMIT ${options.limit}` : ""
      const moviesResult = await db.query<{
        tmdb_id: number
        title: string
        vote_average: number | null
        omdb_imdb_rating: number | null
        omdb_imdb_votes: number | null
        omdb_rotten_tomatoes_score: number | null
        omdb_metacritic_score: number | null
        trakt_rating: number | null
        trakt_votes: number | null
      }>(`
        SELECT
          tmdb_id, title, vote_average,
          omdb_imdb_rating, omdb_imdb_votes,
          omdb_rotten_tomatoes_score, omdb_metacritic_score,
          trakt_rating, trakt_votes
        FROM movies
        WHERE vote_average IS NOT NULL
           OR omdb_imdb_rating IS NOT NULL
           OR omdb_rotten_tomatoes_score IS NOT NULL
           OR omdb_metacritic_score IS NOT NULL
           OR trakt_rating IS NOT NULL
        ORDER BY popularity DESC NULLS LAST
        ${limitClause}
      `)

      totalMovies = moviesResult.rows.length
      console.log(`Found ${totalMovies} movies with rating data\n`)

      for (let i = 0; i < moviesResult.rows.length; i++) {
        const movie = moviesResult.rows[i]
        const inputs = buildMovieRatingInputs(movie)
        const result = calculateAggregateScore(inputs)

        if (result.score !== null) {
          if (!options.dryRun) {
            await db.query(
              `UPDATE movies
               SET aggregate_score = $1,
                   aggregate_confidence = $2,
                   aggregate_updated_at = CURRENT_TIMESTAMP
               WHERE tmdb_id = $3`,
              [result.score, result.confidence, movie.tmdb_id]
            )
          }
          updatedMovies++

          // Log progress every 100 movies or for interesting cases
          if ((i + 1) % 100 === 0 || result.sourcesUsed >= 4) {
            const controversyNote =
              result.controversy !== null && result.controversy >= 1.5 ? " (controversial)" : ""
            console.log(
              `  [${i + 1}/${totalMovies}] "${movie.title}" -> ${result.score.toFixed(2)} (${result.sourcesUsed} sources, ${(result.confidence * 100).toFixed(0)}% confidence)${controversyNote}`
            )
          }
        } else {
          skippedMovies++
        }
      }

      console.log(`\nMovies: ${updatedMovies} updated, ${skippedMovies} skipped\n`)
    }

    // Process shows
    if (!options.moviesOnly) {
      console.log("Processing TV shows...")
      const limitClause = options.limit ? `LIMIT ${options.limit}` : ""
      const showsResult = await db.query<{
        tmdb_id: number
        name: string
        vote_average: number | null
        omdb_imdb_rating: number | null
        omdb_imdb_votes: number | null
        omdb_rotten_tomatoes_score: number | null
        omdb_metacritic_score: number | null
        trakt_rating: number | null
        trakt_votes: number | null
        thetvdb_score: number | null
      }>(`
        SELECT
          tmdb_id, name, vote_average,
          omdb_imdb_rating, omdb_imdb_votes,
          omdb_rotten_tomatoes_score, omdb_metacritic_score,
          trakt_rating, trakt_votes,
          thetvdb_score
        FROM shows
        WHERE vote_average IS NOT NULL
           OR omdb_imdb_rating IS NOT NULL
           OR omdb_rotten_tomatoes_score IS NOT NULL
           OR omdb_metacritic_score IS NOT NULL
           OR trakt_rating IS NOT NULL
           OR thetvdb_score IS NOT NULL
        ORDER BY popularity DESC NULLS LAST
        ${limitClause}
      `)

      totalShows = showsResult.rows.length
      console.log(`Found ${totalShows} shows with rating data\n`)

      for (let i = 0; i < showsResult.rows.length; i++) {
        const show = showsResult.rows[i]
        const inputs = buildShowRatingInputs(show)
        const result = calculateAggregateScore(inputs)

        if (result.score !== null) {
          if (!options.dryRun) {
            await db.query(
              `UPDATE shows
               SET aggregate_score = $1,
                   aggregate_confidence = $2,
                   aggregate_updated_at = CURRENT_TIMESTAMP
               WHERE tmdb_id = $3`,
              [result.score, result.confidence, show.tmdb_id]
            )
          }
          updatedShows++

          // Log progress every 100 shows or for interesting cases
          if ((i + 1) % 100 === 0 || result.sourcesUsed >= 5) {
            const controversyNote =
              result.controversy !== null && result.controversy >= 1.5 ? " (controversial)" : ""
            console.log(
              `  [${i + 1}/${totalShows}] "${show.name}" -> ${result.score.toFixed(2)} (${result.sourcesUsed} sources, ${(result.confidence * 100).toFixed(0)}% confidence)${controversyNote}`
            )
          }
        } else {
          skippedShows++
        }
      }

      console.log(`\nShows: ${updatedShows} updated, ${skippedShows} skipped\n`)
    }

    // Summary
    console.log("=" + "=".repeat(50))
    console.log("Summary")
    console.log("=" + "=".repeat(50))
    if (!options.showsOnly) {
      console.log(
        `Movies: ${updatedMovies} of ${totalMovies} calculated (${skippedMovies} skipped)`
      )
    }
    if (!options.moviesOnly) {
      console.log(`Shows:  ${updatedShows} of ${totalShows} calculated (${skippedShows} skipped)`)
    }
    console.log(
      `Total:  ${updatedMovies + updatedShows} aggregate scores ${options.dryRun ? "would be " : ""}updated`
    )

    if (options.dryRun) {
      console.log("\n(No changes made - dry run mode)")
    }

    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

program.parse()
