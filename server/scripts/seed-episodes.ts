#!/usr/bin/env tsx
/**
 * Seed script to populate the seasons and episodes tables with metadata.
 * This is a "basic" version that only saves metadata - no guest stars or mortality stats.
 * Use seed-episodes-full.ts for complete data including guest stars.
 *
 * Usage:
 *   npm run seed:episodes -- [options]
 *
 * Options:
 *   --active-only    Only process shows with status "Returning Series"
 *   --show <id>      Process a single show by TMDB ID
 *   --limit <n>      Limit number of shows to process
 *   --dry-run        Preview without writing to database
 *
 * Examples:
 *   npm run seed:episodes                        # Seed all shows
 *   npm run seed:episodes -- --active-only       # Only active shows (for cron)
 *   npm run seed:episodes -- --show 1400         # Only Seinfeld
 *   npm run seed:episodes -- --limit 10          # First 10 shows
 *   npm run seed:episodes -- --dry-run           # Preview what would be seeded
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import {
  getPool,
  upsertSeason,
  upsertEpisode,
  type SeasonRecord,
  type EpisodeRecord,
} from "../src/lib/db.js"
import { getSeasonDetails, getTVShowDetails } from "../src/lib/tmdb.js"

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("seed-episodes")
  .description("Seed seasons and episodes tables with metadata from TMDB")
  .option("-a, --active-only", "Only process shows with status 'Returning Series'")
  .option("-s, --show <id>", "Process a single show by TMDB ID", parsePositiveInt)
  .option("-l, --limit <number>", "Limit number of shows to process", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing to database")
  .action(
    async (options: { activeOnly?: boolean; show?: number; limit?: number; dryRun?: boolean }) => {
      await runSeeding(options)
    }
  )

interface SeedOptions {
  activeOnly?: boolean
  show?: number
  limit?: number
  dryRun?: boolean
}

interface ShowInfo {
  tmdb_id: number
  name: string
  number_of_seasons: number | null
  status: string | null
}

async function runSeeding(options: SeedOptions) {
  const { activeOnly, show: showId, limit, dryRun } = options

  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  const modeDesc = showId ? `show ${showId}` : activeOnly ? "active shows only" : "all shows"

  console.log(`\nSeeding episodes for ${modeDesc}${dryRun ? " (DRY RUN)" : ""}`)
  if (limit) console.log(`Limit: ${limit} shows`)
  console.log()

  try {
    const db = getPool()

    // Build query based on options
    let query = "SELECT tmdb_id, name, number_of_seasons, status FROM shows"
    const params: (number | string)[] = []

    if (showId) {
      query += " WHERE tmdb_id = $1"
      params.push(showId)
    } else if (activeOnly) {
      query += " WHERE status = $1"
      params.push("Returning Series")
    }

    query += " ORDER BY popularity DESC NULLS LAST"

    if (limit) {
      query += ` LIMIT $${params.length + 1}`
      params.push(limit)
    }

    const result = await db.query<ShowInfo>(query, params)
    const shows = result.rows

    if (shows.length === 0) {
      console.log("No shows found matching criteria")
      return
    }

    console.log(`Found ${shows.length} shows to process\n`)

    let totalSeasons = 0
    let totalEpisodes = 0
    let showsProcessed = 0
    let errors = 0

    for (let i = 0; i < shows.length; i++) {
      const showInfo = shows[i]
      console.log(`[${i + 1}/${shows.length}] ${showInfo.name} (${showInfo.tmdb_id})`)

      try {
        // Get fresh show details from TMDB to get current season list
        const showDetails = await getTVShowDetails(showInfo.tmdb_id)
        await delay(50)

        const seasons = showDetails.seasons || []
        console.log(`  Found ${seasons.length} seasons`)

        let showSeasonCount = 0
        let showEpisodeCount = 0

        for (const seasonSummary of seasons) {
          // Skip season 0 (specials) for now - often has inconsistent data
          if (seasonSummary.season_number === 0) {
            continue
          }

          try {
            // Fetch full season details (includes episodes)
            const seasonDetails = await getSeasonDetails(
              showInfo.tmdb_id,
              seasonSummary.season_number
            )
            await delay(50)

            // Prepare season record (metadata only - no mortality stats)
            const seasonRecord: SeasonRecord = {
              show_tmdb_id: showInfo.tmdb_id,
              season_number: seasonSummary.season_number,
              name: seasonSummary.name,
              air_date: seasonSummary.air_date,
              episode_count: seasonSummary.episode_count,
              poster_path: seasonSummary.poster_path,
              cast_count: null,
              deceased_count: null,
              expected_deaths: null,
              mortality_surprise_score: null,
            }

            if (!dryRun) {
              await upsertSeason(seasonRecord)
            }
            showSeasonCount++
            totalSeasons++

            // Process episodes in this season
            const episodes = seasonDetails.episodes || []
            for (const ep of episodes) {
              const episodeRecord: EpisodeRecord = {
                show_tmdb_id: showInfo.tmdb_id,
                season_number: ep.season_number,
                episode_number: ep.episode_number,
                name: ep.name,
                air_date: ep.air_date,
                runtime: ep.runtime,
                cast_count: null,
                deceased_count: null,
                guest_star_count: ep.guest_stars?.length || null,
                expected_deaths: null,
                mortality_surprise_score: null,
              }

              if (!dryRun) {
                await upsertEpisode(episodeRecord)
              }
              showEpisodeCount++
              totalEpisodes++
            }
          } catch (seasonError) {
            console.error(
              `  Error processing season ${seasonSummary.season_number}: ${seasonError}`
            )
            errors++
          }
        }

        console.log(
          `  ${dryRun ? "Would save" : "Saved"} ${showSeasonCount} seasons, ${showEpisodeCount} episodes`
        )
        showsProcessed++

        // Small delay between shows
        await delay(100)
      } catch (showError) {
        console.error(`  Error processing show: ${showError}`)
        errors++
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log(`${dryRun ? "DRY RUN " : ""}SUMMARY:`)
    console.log(`  Shows processed: ${showsProcessed}`)
    console.log(`  Total seasons ${dryRun ? "would be " : ""}saved: ${totalSeasons}`)
    console.log(`  Total episodes ${dryRun ? "would be " : ""}saved: ${totalEpisodes}`)
    if (errors > 0) {
      console.log(`  Errors: ${errors}`)
    }
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
