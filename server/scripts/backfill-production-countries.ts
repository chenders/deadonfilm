#!/usr/bin/env tsx
/**
 * Backfill script to fetch missing production_countries data from TMDB for movies.
 *
 * Prioritizes English-language movies sorted by popularity and release date.
 *
 * Usage:
 *   npx tsx scripts/backfill-production-countries.ts                    # Process all movies
 *   npx tsx scripts/backfill-production-countries.ts --limit 100        # Limit to 100 movies
 *   npx tsx scripts/backfill-production-countries.ts --dry-run          # Preview without writing
 *   npx tsx scripts/backfill-production-countries.ts --all-languages    # Include non-English movies
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"
import { getMovieDetails } from "../src/lib/tmdb.js"

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface BackfillOptions {
  dryRun: boolean
  limit?: number
  delay: number
  allLanguages: boolean
}

interface MovieToBackfill {
  tmdb_id: number
  title: string
  original_language: string | null
  popularity: number | null
  release_year: number | null
}

/**
 * Get movies that don't have production_countries set.
 * Sorted by: English first, then popularity DESC, then release_year DESC.
 */
async function getMoviesWithoutProductionCountries(
  pool: Pool,
  options: { limit?: number; allLanguages: boolean }
): Promise<MovieToBackfill[]> {
  const { limit, allLanguages } = options

  let query = `
    SELECT tmdb_id, title, original_language, popularity, release_year
    FROM movies
    WHERE production_countries IS NULL
  `

  if (!allLanguages) {
    query += ` AND original_language = 'en'`
  }

  query += `
    ORDER BY
      CASE WHEN original_language = 'en' THEN 0 ELSE 1 END,
      popularity DESC NULLS LAST,
      release_year DESC NULLS LAST
  `

  const params: number[] = []
  if (limit) {
    params.push(limit)
    query += ` LIMIT $1`
  }

  const result = await pool.query<MovieToBackfill>(query, params)
  return result.rows
}

/**
 * Update a movie's production_countries
 */
async function updateMovieProductionCountries(
  pool: Pool,
  tmdbId: number,
  productionCountries: string[]
): Promise<void> {
  await pool.query(
    `UPDATE movies SET production_countries = $1, updated_at = NOW() WHERE tmdb_id = $2`,
    [productionCountries, tmdbId]
  )
}

async function runBackfill(options: BackfillOptions): Promise<void> {
  const { dryRun, limit, delay, allLanguages } = options

  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  console.log("\nBackfilling production_countries for movies...")
  console.log(`  Language filter: ${allLanguages ? "all languages" : "English only"}`)
  console.log(`  Limit: ${limit ?? "none"}`)
  console.log(`  Delay: ${delay}ms between requests`)
  if (dryRun) {
    console.log("  Mode: DRY RUN (no changes will be made)")
  }
  console.log("")

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // Get movies missing production_countries
    const movies = await getMoviesWithoutProductionCountries(pool, { limit, allLanguages })

    console.log(`Found ${movies.length} movies missing production_countries\n`)

    if (movies.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    // Show sample of movies to be processed
    console.log("Sample movies (first 5):")
    for (const movie of movies.slice(0, 5)) {
      const popStr =
        movie.popularity != null ? `pop: ${Number(movie.popularity).toFixed(1)}` : "pop: N/A"
      const yearStr = movie.release_year ?? "N/A"
      console.log(`  - ${movie.title} (${yearStr}) [${movie.original_language || "?"}] ${popStr}`)
    }
    if (movies.length > 5) {
      console.log(`  ... and ${movies.length - 5} more`)
    }
    console.log("")

    let updated = 0
    let noCountries = 0
    let errors = 0
    const countryCounts: Record<string, number> = {}

    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i]
      const progress = `[${i + 1}/${movies.length}]`

      try {
        const details = await getMovieDetails(movie.tmdb_id)

        if (details.production_countries && details.production_countries.length > 0) {
          const countries = details.production_countries.map((c) => c.iso_3166_1)

          if (!dryRun) {
            await updateMovieProductionCountries(pool, movie.tmdb_id, countries)
          }

          // Track country distribution
          for (const country of countries) {
            countryCounts[country] = (countryCounts[country] || 0) + 1
          }

          const countryStr = countries.join(", ")
          console.log(`${progress} ${movie.title}: ${countryStr}`)
          updated++
        } else {
          console.log(`${progress} ${movie.title}: No production countries available`)
          noCountries++
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        // Check for 404 errors (movie deleted from TMDB)
        if (errorMessage.includes("404")) {
          console.log(`${progress} ${movie.title}: Movie not found on TMDB (deleted?)`)
        } else {
          console.error(`${progress} ${movie.title}: Error - ${errorMessage}`)
        }
        errors++
      }

      // Rate limit - TMDB API has limits (around 40 requests/10 seconds)
      if (i < movies.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60))
    console.log("Summary")
    console.log("=".repeat(60))
    console.log(`  Updated: ${updated}${dryRun ? " (dry run)" : ""}`)
    console.log(`  No countries on TMDB: ${noCountries}`)
    console.log(`  Errors: ${errors}`)

    // Print country distribution
    if (Object.keys(countryCounts).length > 0) {
      console.log("\nCountry distribution (top 10):")
      const sortedCountries = Object.entries(countryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
      for (const [country, count] of sortedCountries) {
        const percentage = ((count / updated) * 100).toFixed(1)
        console.log(`  ${country}: ${count} (${percentage}%)`)
      }
    }

    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

const program = new Command()
  .name("backfill-production-countries")
  .description("Fetch missing production_countries data from TMDB for movies")
  .option("-n, --dry-run", "Preview changes without writing to database", false)
  .option("-l, --limit <number>", "Maximum number of movies to process", parsePositiveInt)
  .option("-d, --delay <ms>", "Delay between TMDB API calls in milliseconds", parsePositiveInt, 100)
  .option("-a, --all-languages", "Include non-English movies (default: English only)", false)
  .action(async (options) => {
    await runBackfill({
      dryRun: options.dryRun,
      limit: options.limit,
      delay: options.delay,
      allLanguages: options.allLanguages,
    })
  })

program.parse()
