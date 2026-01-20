#!/usr/bin/env tsx
/**
 * Backfill TheTVDB scores for TV shows
 *
 * This script fetches community scores from TheTVDB API for all shows
 * that have a TheTVDB ID.
 *
 * Usage:
 *   npm run backfill:thetvdb-scores -- [options]
 *
 * Options:
 *   -l, --limit <n>           Process only N shows
 *   -n, --dry-run             Preview without writing
 *   --min-popularity <n>      Skip shows below popularity threshold
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db/pool.js"
import { getSeriesExtended } from "../src/lib/thetvdb.js"
import { upsertShow } from "../src/lib/db/shows.js"
import type { ShowRecord } from "../src/lib/db/types.js"

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
  dryRun?: boolean
  minPopularity?: number
}

interface BackfillStats {
  totalProcessed: number
  successful: number
  failed: number
  skipped: number
}

const program = new Command()
  .name("backfill-thetvdb-scores")
  .description("Backfill TheTVDB community scores for TV shows")
  .option("-l, --limit <n>", "Process only N shows", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing")
  .option("--min-popularity <n>", "Skip shows below popularity threshold", parseFloat)

program.parse()

const options = program.opts<BackfillOptions>()

async function run(options: BackfillOptions) {
  const stats: BackfillStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
  }

  const pool = getPool()

  try {
    console.log("📺 TheTVDB Scores Backfill Script")
    console.log("==================================")
    console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
    console.log(`Limit: ${options.limit || "unlimited"}`)
    console.log(`Min popularity: ${options.minPopularity || "none"}`)

    // Query shows that need TheTVDB scores
    const query = `
      SELECT tmdb_id, name, thetvdb_id, popularity,
             first_air_date, last_air_date, poster_path, backdrop_path,
             genres, status, number_of_seasons, number_of_episodes,
             vote_average, origin_country, original_language,
             cast_count, deceased_count, living_count,
             expected_deaths, mortality_surprise_score,
             tvmaze_id, imdb_id
      FROM shows
      WHERE thetvdb_id IS NOT NULL
        AND thetvdb_score IS NULL
        ${options.minPopularity ? `AND popularity >= $2` : ""}
      ORDER BY popularity DESC NULLS LAST
      ${options.limit ? `LIMIT $1` : ""}
    `

    const params = []
    if (options.limit) params.push(options.limit)
    if (options.minPopularity) params.push(options.minPopularity)

    const result = await pool.query<ShowRecord>(query, params)
    const shows = result.rows

    console.log(`\nFound ${shows.length} shows to backfill`)

    for (const show of shows) {
      stats.totalProcessed++

      if (stats.totalProcessed % 10 === 0) {
        console.log(`Progress: ${stats.totalProcessed}/${shows.length} shows processed...`)
      }

      try {
        const seriesData = await getSeriesExtended(show.thetvdb_id!)

        if (!seriesData) {
          console.log(`  ⚠️  No data found for "${show.name}" (TheTVDB ID: ${show.thetvdb_id})`)
          stats.failed++
          continue
        }

        if (seriesData.score === null || seriesData.score === undefined) {
          console.log(`  ⚠️  No score available for "${show.name}"`)
          stats.skipped++
          continue
        }

        if (options.dryRun) {
          console.log(
            `  [DRY RUN] Would update "${show.name}": TheTVDB score ${seriesData.score}/10`
          )
        } else {
          await upsertShow({
            ...show,
            thetvdb_score: seriesData.score,
          })
        }

        stats.successful++
      } catch (error) {
        console.error(`  ❌ Error processing "${show.name}":`, error)
        stats.failed++
      }
    }

    // Print summary
    console.log("\n")
    console.log("=".repeat(50))
    console.log("📊 Summary")
    console.log("=".repeat(50))
    console.log(`Total processed: ${stats.totalProcessed}`)
    console.log(`Successful: ${stats.successful}`)
    console.log(`Failed: ${stats.failed}`)
    console.log(`Skipped (no score): ${stats.skipped}`)

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
