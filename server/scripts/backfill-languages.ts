#!/usr/bin/env tsx
/**
 * Backfill script to fetch missing original_language and popularity data from TMDB for movies.
 *
 * Usage:
 *   npm run backfill:languages                    # Process all movies without language
 *   npm run backfill:languages -- --batch-size 500  # Limit batch size
 *   npm run backfill:languages -- --dry-run       # Preview without writing
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getMoviesWithoutLanguage, updateMovieLanguage, getPool } from "../src/lib/db.js"
import { getMovieDetails } from "../src/lib/tmdb.js"

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("backfill-languages")
  .description("Fetch missing original_language and popularity data from TMDB for movies")
  .option("-n, --dry-run", "Preview changes without writing to database")
  .option("-b, --batch-size <number>", "Maximum number of movies to process", parsePositiveInt)
  .option("-d, --delay <ms>", "Delay between TMDB API calls in milliseconds", parsePositiveInt, 100)
  .action(async (options: { dryRun?: boolean; batchSize?: number; delay: number }) => {
    await runBackfill(options)
  })

interface BackfillOptions {
  dryRun?: boolean
  batchSize?: number
  delay: number
}

async function runBackfill({ dryRun, batchSize, delay }: BackfillOptions) {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  console.log("\nBackfilling missing language and popularity data for movies...")
  if (dryRun) {
    console.log("(DRY RUN - no changes will be made)\n")
  } else {
    console.log("")
  }

  const db = getPool()

  try {
    // Get all movies missing language data
    const movieIds = await getMoviesWithoutLanguage(batchSize)

    console.log(`Found ${movieIds.length} movies missing language data\n`)

    if (movieIds.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    let updated = 0
    let notAvailable = 0
    let errors = 0

    for (let i = 0; i < movieIds.length; i++) {
      const tmdbId = movieIds[i]
      const progress = `[${i + 1}/${movieIds.length}]`

      try {
        const details = await getMovieDetails(tmdbId)

        if (details.original_language) {
          if (!dryRun) {
            await updateMovieLanguage(tmdbId, details.original_language, details.popularity)
          }
          const popularityStr = details.popularity
            ? ` (popularity: ${details.popularity.toFixed(1)})`
            : ""
          console.log(`${progress} ${details.title}: ${details.original_language}${popularityStr}`)
          updated++
        } else {
          console.log(`${progress} Movie ${tmdbId}: No language available`)
          notAvailable++
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`${progress} Movie ${tmdbId}: Error - ${errorMessage}`)
        errors++
      }

      // Rate limit - TMDB API has limits (around 40 requests/10 seconds)
      if (i < movieIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    console.log("\nSummary:")
    console.log(`  Updated: ${updated}${dryRun ? " (dry run)" : ""}`)
    console.log(`  No language on TMDB: ${notAvailable}`)
    console.log(`  Errors: ${errors}`)
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

program.parse()
