#!/usr/bin/env tsx
/**
 * Backfill missing movie popularity scores from TMDB.
 *
 * Movies added via actor filmography imports often lack popularity scores.
 * This script fetches movie details from TMDB and updates the popularity field.
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

function parsePositiveInt(value: string): number {
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
}

async function backfillMoviePopularity(options: BackfillOptions): Promise<void> {
  const { limit, year, dryRun } = options

  const db = getPool()

  try {
    // Find movies with NULL popularity
    const params: (number | string)[] = []
    let query = `
      SELECT tmdb_id, title, release_year
      FROM movies
      WHERE popularity IS NULL
        AND tmdb_id IS NOT NULL
    `

    if (year) {
      params.push(year)
      query += ` AND release_year = $${params.length}`
    }

    query += ` ORDER BY release_year DESC NULLS LAST, tmdb_id`

    params.push(limit)
    query += ` LIMIT $${params.length}`

    const result = await db.query<{
      tmdb_id: number
      title: string
      release_year: number | null
    }>(query, params)

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
    let errors = 0

    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i]
      const progress = `[${i + 1}/${movies.length}]`

      try {
        const details = await getMovieDetails(movie.tmdb_id)

        if (details.popularity !== undefined && details.popularity !== null) {
          if (dryRun) {
            console.log(
              `${progress} ${movie.title} (${movie.release_year}) -> popularity: ${details.popularity}`
            )
          } else {
            await db.query(
              `UPDATE movies SET popularity = $1, updated_at = CURRENT_TIMESTAMP WHERE tmdb_id = $2`,
              [details.popularity, movie.tmdb_id]
            )
            console.log(
              `${progress} Updated: ${movie.title} (${movie.release_year}) -> ${details.popularity}`
            )
          }
          updated++
        } else {
          console.log(`${progress} No popularity for: ${movie.title}`)
        }

        // Rate limiting - small delay between requests
        if (i < movies.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`${progress} Error fetching ${movie.title}: ${message}`)
        errors++
      }
    }

    console.log()
    console.log("=".repeat(50))
    console.log(`Complete!`)
    console.log(`  Processed: ${movies.length}`)
    console.log(`  Updated: ${updated}`)
    console.log(`  Errors: ${errors}`)
    if (dryRun) {
      console.log(`  (Dry run - no changes made)`)
    }
  } finally {
    await resetPool()
  }
}

const program = new Command()
  .name("backfill-movie-popularity")
  .description("Backfill missing movie popularity scores from TMDB")
  .option("-l, --limit <number>", "Limit number of movies to process", parsePositiveInt, 100)
  .option("-y, --year <year>", "Only process movies from a specific year", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing to database")
  .action(async (options) => {
    await backfillMoviePopularity({
      limit: options.limit,
      year: options.year,
      dryRun: options.dryRun || false,
    })
  })

program.parse()
