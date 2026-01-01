#!/usr/bin/env tsx
/**
 * Backfill episodes using fallback data sources (TVmaze/TheTVDB).
 *
 * This script detects shows with TMDB data gaps and backfills episode data
 * from alternative sources. Useful for older shows like soap operas where
 * TMDB lacks episode data.
 *
 * Usage:
 *   npm run backfill:episodes:fallback -- [options]
 *
 * Options:
 *   --detect-gaps    Scan shows and report which have TMDB data gaps
 *   --show <id>      Process a single show by TMDB ID
 *   --source <src>   Force a specific source (tvmaze or thetvdb)
 *   --dry-run        Preview without writing to database
 *
 * Examples:
 *   npm run backfill:episodes:fallback -- --detect-gaps      # Find shows with gaps
 *   npm run backfill:episodes:fallback -- --show 987         # Backfill General Hospital
 *   npm run backfill:episodes:fallback -- --show 987 --source tvmaze
 *   npm run backfill:episodes:fallback -- --show 987 --dry-run
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, upsertEpisode, updateShowExternalIds, type EpisodeRecord } from "../src/lib/db.js"
import { getTVShowDetails } from "../src/lib/tmdb.js"
import {
  detectTmdbDataGaps,
  getExternalIds,
  fetchEpisodesWithFallback,
  type DataSource,
} from "../src/lib/episode-data-source.js"

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function parseSource(value: string): DataSource {
  if (value !== "tvmaze" && value !== "thetvdb") {
    throw new InvalidArgumentError("Source must be 'tvmaze' or 'thetvdb'")
  }
  return value
}

interface ShowInfo {
  tmdb_id: number
  name: string
  tvmaze_id: number | null
  thetvdb_id: number | null
}

const program = new Command()
  .name("backfill-episodes-fallback")
  .description("Backfill episodes from TVmaze/TheTVDB for shows with TMDB data gaps")
  .option("--detect-gaps", "Scan shows and report which have TMDB data gaps")
  .option("-s, --show <id>", "Process a single show by TMDB ID", parsePositiveInt)
  .option("--source <source>", "Force a specific source (tvmaze or thetvdb)", parseSource)
  .option("-n, --dry-run", "Preview without writing to database")
  .action(
    async (options: {
      detectGaps?: boolean
      show?: number
      source?: DataSource
      dryRun?: boolean
    }) => {
      await runBackfill(options)
    }
  )

async function runBackfill(options: {
  detectGaps?: boolean
  show?: number
  source?: DataSource
  dryRun?: boolean
}) {
  const { detectGaps, show: showId, source: forcedSource, dryRun } = options

  if (!detectGaps && !showId) {
    console.error("Error: Must specify either --detect-gaps or --show <id>")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  const db = getPool()

  if (detectGaps) {
    await detectDataGaps(db)
    return
  }

  if (showId) {
    await backfillShow(db, showId, forcedSource, dryRun ?? false)
  }
}

async function detectDataGaps(db: ReturnType<typeof getPool>) {
  console.log("Scanning shows for TMDB data gaps...\n")

  const result = await db.query<ShowInfo>(
    "SELECT tmdb_id, name, tvmaze_id, thetvdb_id FROM shows ORDER BY popularity DESC NULLS LAST"
  )

  let showsWithGaps = 0
  let totalMissingSeasons = 0

  for (const show of result.rows) {
    const gapResult = await detectTmdbDataGaps(show.tmdb_id)

    if (gapResult.hasGaps) {
      showsWithGaps++
      totalMissingSeasons += gapResult.missingSeasons.length

      console.log(`${show.name} (${show.tmdb_id}):`)
      console.log(`  Missing seasons: ${gapResult.missingSeasons.join(", ")}`)
      console.log(
        `  External IDs: TVmaze=${show.tvmaze_id ?? "none"}, TheTVDB=${show.thetvdb_id ?? "none"}`
      )
      for (const detail of gapResult.details) {
        console.log(`  - ${detail}`)
      }
      console.log()
    }

    // Small delay to avoid rate limits
    await delay(100)
  }

  console.log("=".repeat(60))
  console.log(`Shows with TMDB gaps: ${showsWithGaps}`)
  console.log(`Total missing seasons: ${totalMissingSeasons}`)
  console.log()
  console.log("To backfill a specific show, run:")
  console.log("  npm run backfill:episodes:fallback -- --show <tmdb_id>")
}

async function backfillShow(
  db: ReturnType<typeof getPool>,
  showTmdbId: number,
  forcedSource: DataSource | undefined,
  dryRun: boolean
) {
  // Get show info from database
  const showResult = await db.query<ShowInfo>(
    "SELECT tmdb_id, name, tvmaze_id, thetvdb_id FROM shows WHERE tmdb_id = $1",
    [showTmdbId]
  )

  if (showResult.rows.length === 0) {
    console.error(`Show not found in database: ${showTmdbId}`)
    process.exit(1)
  }

  const show = showResult.rows[0]
  console.log(`\nBackfilling: ${show.name} (${show.tmdb_id})${dryRun ? " (DRY RUN)" : ""}`)

  // Get external IDs if not already stored
  let externalIds = {
    tvmazeId: show.tvmaze_id,
    thetvdbId: show.thetvdb_id,
    imdbId: null as string | null,
  }

  if (!externalIds.tvmazeId && !externalIds.thetvdbId) {
    console.log("  Fetching external IDs...")
    externalIds = await getExternalIds(showTmdbId)

    if (!dryRun && (externalIds.tvmazeId || externalIds.thetvdbId)) {
      await updateShowExternalIds(showTmdbId, externalIds.tvmazeId, externalIds.thetvdbId)
    }
  }

  console.log(
    `  External IDs: TVmaze=${externalIds.tvmazeId ?? "none"}, TheTVDB=${externalIds.thetvdbId ?? "none"}`
  )

  // Detect gaps
  const gapResult = await detectTmdbDataGaps(showTmdbId)

  if (!gapResult.hasGaps) {
    console.log("  No TMDB data gaps detected for this show")
    return
  }

  console.log(`  Missing seasons: ${gapResult.missingSeasons.join(", ")}`)

  // Get show details for context
  const showDetails = await getTVShowDetails(showTmdbId)

  let totalEpisodes = 0

  for (const seasonNumber of gapResult.missingSeasons) {
    console.log(`\n  Processing Season ${seasonNumber}...`)

    const seasonSummary = showDetails.seasons.find((s) => s.season_number === seasonNumber)
    const expectedCount = seasonSummary?.episode_count ?? 0

    const { episodes, source } = await fetchEpisodesWithFallback(
      showTmdbId,
      seasonNumber,
      externalIds
    )

    if (episodes.length === 0) {
      console.log(`    No episodes found from any source`)
      continue
    }

    if (forcedSource && source !== forcedSource) {
      console.log(
        `    Found ${episodes.length} episodes from ${source}, but --source ${forcedSource} was specified`
      )
      // Try the forced source directly
      // For now, skip if the forced source didn't provide data
      continue
    }

    console.log(`    Found ${episodes.length} episodes from ${source} (expected ${expectedCount})`)

    for (const ep of episodes) {
      const episodeRecord: EpisodeRecord = {
        show_tmdb_id: showTmdbId,
        season_number: ep.seasonNumber,
        episode_number: ep.episodeNumber,
        name: ep.name,
        air_date: ep.airDate,
        runtime: ep.runtime,
        cast_count: 0, // Cast not yet available from fallback sources
        deceased_count: 0,
        guest_star_count: 0,
        expected_deaths: 0,
        mortality_surprise_score: 0,
        episode_data_source: source,
        cast_data_source: null,
        tvmaze_episode_id: ep.tvmazeEpisodeId ?? null,
        thetvdb_episode_id: ep.thetvdbEpisodeId ?? null,
      }

      if (!dryRun) {
        await upsertEpisode(episodeRecord)
      }
      totalEpisodes++

      if (dryRun) {
        console.log(
          `      Would save: S${ep.seasonNumber}E${ep.episodeNumber} - ${ep.name ?? "(no title)"}`
        )
      }
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log(`${dryRun ? "Would save" : "Saved"} ${totalEpisodes} episodes`)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
