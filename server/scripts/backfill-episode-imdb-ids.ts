#!/usr/bin/env tsx
/**
 * Backfill IMDb episode IDs for episodes in the database.
 *
 * This script matches episodes to IMDb's episode dataset by (season_number, episode_number)
 * for shows that have an IMDb ID. Having IMDb episode IDs enables OMDb rating lookups.
 *
 * Data source: IMDb non-commercial datasets (title.episode.tsv.gz)
 * - Downloaded on-demand and cached locally for 24 hours
 * - No API rate limits (local file processing)
 *
 * Usage:
 *   npm run backfill:episode-imdb-ids -- [options]
 *
 * Options:
 *   --limit <n>      Limit number of shows to process
 *   --show <id>      Process a single show by TMDB ID
 *   --dry-run        Preview without writing to database
 *
 * Examples:
 *   npm run backfill:episode-imdb-ids                    # All shows with IMDb IDs
 *   npm run backfill:episode-imdb-ids -- --limit 10      # First 10 shows
 *   npm run backfill:episode-imdb-ids -- --show 1399     # Game of Thrones only
 *   npm run backfill:episode-imdb-ids -- --dry-run       # Preview only
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { getShowEpisodes } from "../src/lib/imdb.js"

function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface ShowInfo {
  tmdb_id: number
  name: string
  imdb_id: string
}

interface EpisodeInfo {
  id: number
  show_tmdb_id: number
  season_number: number
  episode_number: number
  name: string | null
  imdb_episode_id: string | null
}

interface BackfillStats {
  showsProcessed: number
  showsWithMatches: number
  episodesUpdated: number
  episodesAlreadyHaveId: number
  episodesNoMatch: number
  errors: number
}

const program = new Command()
  .name("backfill-episode-imdb-ids")
  .description("Backfill IMDb episode IDs using IMDb datasets")
  .option("-l, --limit <number>", "Limit number of shows to process", parsePositiveInt)
  .option("--show <id>", "Process a single show by TMDB ID", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing to database")
  .action(async (options: { limit?: number; show?: number; dryRun?: boolean }) => {
    await runBackfill(options)
  })

async function runBackfill(options: {
  limit?: number
  show?: number
  dryRun?: boolean
}): Promise<BackfillStats> {
  const { limit, show: showTmdbId, dryRun } = options

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  const db = getPool()

  const stats: BackfillStats = {
    showsProcessed: 0,
    showsWithMatches: 0,
    episodesUpdated: 0,
    episodesAlreadyHaveId: 0,
    episodesNoMatch: 0,
    errors: 0,
  }

  console.log(`\nBackfilling IMDb episode IDs${dryRun ? " (DRY RUN)" : ""}`)
  if (showTmdbId) console.log(`Processing single show: TMDB ID ${showTmdbId}`)
  if (limit) console.log(`Limit: ${limit} shows`)
  console.log()

  try {
    // Get shows with IMDb IDs
    let query = `
      SELECT tmdb_id, name, imdb_id
      FROM shows
      WHERE imdb_id IS NOT NULL
    `
    const params: (number | string)[] = []

    if (showTmdbId) {
      params.push(showTmdbId)
      query += ` AND tmdb_id = $${params.length}`
    }

    query += " ORDER BY popularity DESC NULLS LAST"

    if (limit && !showTmdbId) {
      params.push(limit)
      query += ` LIMIT $${params.length}`
    }

    const showsResult = await db.query<ShowInfo>(query, params)
    const shows = showsResult.rows

    console.log(`Found ${shows.length} shows with IMDb IDs\n`)

    if (shows.length === 0) {
      console.log("No shows to process.")
      return stats
    }

    // Process each show
    for (const show of shows) {
      stats.showsProcessed++
      console.log(
        `[${stats.showsProcessed}/${shows.length}] ${show.name} (TMDB: ${show.tmdb_id}, IMDb: ${show.imdb_id})`
      )

      try {
        // Get all episodes for this show from the database
        const episodesResult = await db.query<EpisodeInfo>(
          `SELECT id, show_tmdb_id, season_number, episode_number, name, imdb_episode_id
           FROM episodes
           WHERE show_tmdb_id = $1
           ORDER BY season_number, episode_number`,
          [show.tmdb_id]
        )
        const dbEpisodes = episodesResult.rows

        if (dbEpisodes.length === 0) {
          console.log("  No episodes in database, skipping")
          continue
        }

        // Count how many already have IMDb IDs
        const alreadyHaveId = dbEpisodes.filter((e) => e.imdb_episode_id !== null).length
        const needId = dbEpisodes.length - alreadyHaveId

        if (needId === 0) {
          console.log(`  All ${dbEpisodes.length} episodes already have IMDb IDs`)
          stats.episodesAlreadyHaveId += alreadyHaveId
          continue
        }

        console.log(`  ${dbEpisodes.length} episodes in DB, ${needId} need IMDb IDs`)

        // Get episodes from IMDb dataset
        const imdbEpisodes = await getShowEpisodes(show.imdb_id)

        if (imdbEpisodes.length === 0) {
          console.log("  No episodes found in IMDb dataset")
          stats.episodesNoMatch += needId
          continue
        }

        console.log(`  Found ${imdbEpisodes.length} episodes in IMDb dataset`)

        // Build lookup map: (season, episode) -> IMDb ID
        const imdbLookup = new Map<string, string>()
        for (const ep of imdbEpisodes) {
          if (ep.seasonNumber !== null && ep.episodeNumber !== null) {
            const key = `${ep.seasonNumber}-${ep.episodeNumber}`
            imdbLookup.set(key, ep.tconst)
          }
        }

        // Match and update episodes
        let matchedCount = 0
        let updatedCount = 0
        const updates: { id: number; imdbId: string }[] = []

        for (const dbEp of dbEpisodes) {
          // Skip if already has IMDb ID
          if (dbEp.imdb_episode_id !== null) {
            stats.episodesAlreadyHaveId++
            continue
          }

          const key = `${dbEp.season_number}-${dbEp.episode_number}`
          const imdbId = imdbLookup.get(key)

          if (imdbId) {
            matchedCount++
            updates.push({ id: dbEp.id, imdbId })
          } else {
            stats.episodesNoMatch++
          }
        }

        if (matchedCount > 0) {
          stats.showsWithMatches++

          if (!dryRun) {
            // Batch update episodes
            for (const update of updates) {
              await db.query(`UPDATE episodes SET imdb_episode_id = $1 WHERE id = $2`, [
                update.imdbId,
                update.id,
              ])
              updatedCount++
            }
            stats.episodesUpdated += updatedCount
            console.log(`  Updated ${updatedCount} episodes with IMDb IDs`)
          } else {
            stats.episodesUpdated += matchedCount
            console.log(`  Would update ${matchedCount} episodes with IMDb IDs`)
          }
        } else {
          console.log("  No matches found (season/episode numbers may differ)")
        }
      } catch (error) {
        stats.errors++
        console.error(`  Error processing show: ${error instanceof Error ? error.message : error}`)
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60))
    console.log("Summary:")
    console.log(`  Shows processed: ${stats.showsProcessed}`)
    console.log(`  Shows with matches: ${stats.showsWithMatches}`)
    console.log(`  Episodes updated: ${stats.episodesUpdated}`)
    console.log(`  Episodes already had ID: ${stats.episodesAlreadyHaveId}`)
    console.log(`  Episodes with no match: ${stats.episodesNoMatch}`)
    console.log(`  Errors: ${stats.errors}`)
    console.log("=".repeat(60))

    return stats
  } finally {
    await resetPool()
  }
}

program.parse()
