#!/usr/bin/env tsx
/**
 * Backfill episodes using fallback data sources (TVmaze/TheTVDB).
 *
 * This script detects shows with TMDB data gaps and backfills episode data
 * from alternative sources. Useful for older shows like soap operas where
 * TMDB lacks episode data.
 *
 * The script automatically saves progress to a checkpoint file and resumes
 * from where it left off if interrupted. Use --fresh to start over.
 *
 * Usage:
 *   npm run backfill:episodes:fallback -- [options]
 *
 * Options:
 *   --detect-gaps    Scan shows and report which have TMDB data gaps
 *   --show <id>      Process a single show by TMDB ID
 *   --all-gaps       Process all shows with detected gaps (default)
 *   --source <src>   Force a specific source (tvmaze or thetvdb)
 *   --dry-run        Preview without writing to database
 *   --fresh          Start fresh (ignore checkpoint)
 *
 * Examples:
 *   npm run backfill:episodes:fallback                       # Backfill all shows with gaps (default)
 *   npm run backfill:episodes:fallback -- --detect-gaps      # Find shows with gaps (report only)
 *   npm run backfill:episodes:fallback -- --show 987         # Backfill General Hospital only
 *   npm run backfill:episodes:fallback -- --show 987 --source tvmaze
 *   npm run backfill:episodes:fallback -- --fresh            # Start fresh, ignore checkpoint
 */

import "dotenv/config"
import path from "path"
import { Command, InvalidArgumentError } from "commander"
import {
  getPool,
  resetPool,
  upsertEpisode,
  updateShowExternalIds,
  type EpisodeRecord,
} from "../src/lib/db.js"
import { getTVShowDetails } from "../src/lib/tmdb.js"
import {
  detectTmdbDataGaps,
  getExternalIds,
  fetchEpisodesWithFallback,
  type DataSource,
} from "../src/lib/episode-data-source.js"
import {
  loadCheckpoint as loadCheckpointGeneric,
  saveCheckpoint as saveCheckpointGeneric,
  deleteCheckpoint as deleteCheckpointGeneric,
} from "../src/lib/checkpoint-utils.js"

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join(process.cwd(), ".backfill-episodes-fallback-checkpoint.json")

export interface Checkpoint {
  // For --all-gaps mode: track processed shows
  processedShowIds: number[]
  // For single show mode: track processed seasons within a show
  currentShowId: number | null
  processedSeasons: number[]
  startedAt: string
  lastUpdated: string
  stats: {
    showsProcessed: number
    seasonsProcessed: number
    episodesSaved: number
    errors: number
  }
}

export function loadCheckpoint(filePath: string = CHECKPOINT_FILE): Checkpoint | null {
  return loadCheckpointGeneric<Checkpoint>(filePath)
}

export function saveCheckpoint(checkpoint: Checkpoint, filePath: string = CHECKPOINT_FILE): void {
  saveCheckpointGeneric(filePath, checkpoint, (cp) => {
    cp.lastUpdated = new Date().toISOString()
  })
}

export function deleteCheckpoint(filePath: string = CHECKPOINT_FILE): void {
  deleteCheckpointGeneric(filePath)
}

export function parsePositiveInt(value: string): number {
  // Validate the entire string is a positive integer (no decimals, no trailing chars)
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

export function parseSource(value: string): DataSource {
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
  .option("--all-gaps", "Process all shows with detected gaps (this is the default mode)")
  .option("--source <source>", "Force a specific source (tvmaze or thetvdb)", parseSource)
  .option("-n, --dry-run", "Preview without writing to database")
  .option("--fresh", "Start fresh (ignore checkpoint)")
  .action(
    async (options: {
      detectGaps?: boolean
      show?: number
      allGaps?: boolean
      source?: DataSource
      dryRun?: boolean
      fresh?: boolean
    }) => {
      await runBackfill(options)
    }
  )

async function runBackfill(options: {
  detectGaps?: boolean
  show?: number
  allGaps?: boolean
  source?: DataSource
  dryRun?: boolean
  fresh?: boolean
}) {
  const { detectGaps, show: showId, allGaps, source: forcedSource, dryRun, fresh } = options

  // Default to --all-gaps if no mode specified
  const effectiveAllGaps = allGaps ?? (!detectGaps && !showId)

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
    await resetPool()
    return
  }

  // Load or create checkpoint
  let checkpoint: Checkpoint | null = null
  if (!fresh && !dryRun) {
    checkpoint = loadCheckpoint()
    if (checkpoint) {
      console.log(`\nResuming from checkpoint (started ${checkpoint.startedAt})`)
      console.log(`  Shows processed: ${checkpoint.stats.showsProcessed}`)
      console.log(`  Episodes saved: ${checkpoint.stats.episodesSaved}`)
      console.log(`  Errors: ${checkpoint.stats.errors}`)
    }
  }

  if (!checkpoint) {
    checkpoint = {
      processedShowIds: [],
      currentShowId: null,
      processedSeasons: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: { showsProcessed: 0, seasonsProcessed: 0, episodesSaved: 0, errors: 0 },
    }
  }

  if (effectiveAllGaps) {
    await backfillAllGaps(db, forcedSource, dryRun ?? false, checkpoint)
  } else if (showId) {
    await backfillShow(db, showId, forcedSource, dryRun ?? false, checkpoint)
  }

  // Close database pool to allow process to exit
  await resetPool()
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

async function backfillAllGaps(
  db: ReturnType<typeof getPool>,
  forcedSource: DataSource | undefined,
  dryRun: boolean,
  checkpoint: Checkpoint
) {
  console.log(`\nBackfilling all shows with TMDB data gaps${dryRun ? " (DRY RUN)" : ""}`)

  const result = await db.query<ShowInfo>(
    "SELECT tmdb_id, name, tvmaze_id, thetvdb_id FROM shows ORDER BY popularity DESC NULLS LAST"
  )

  const processedSet = new Set(checkpoint.processedShowIds)
  const showsToCheck = result.rows.filter((show) => !processedSet.has(show.tmdb_id))

  console.log(
    `Checking ${showsToCheck.length} shows for gaps (${processedSet.size} already processed)\n`
  )

  let showsWithGaps = 0

  for (const show of showsToCheck) {
    // Check for gaps
    const gapResult = await detectTmdbDataGaps(show.tmdb_id)

    if (!gapResult.hasGaps) {
      // No gaps, mark as processed and continue
      checkpoint.processedShowIds.push(show.tmdb_id)
      if (!dryRun) saveCheckpoint(checkpoint)
      continue
    }

    showsWithGaps++
    console.log(`\n${"=".repeat(60)}`)
    console.log(`Found gaps in: ${show.name} (${show.tmdb_id})`)

    // Backfill this show
    await backfillShow(db, show.tmdb_id, forcedSource, dryRun, checkpoint)

    // Mark show as processed
    checkpoint.processedShowIds.push(show.tmdb_id)
    checkpoint.stats.showsProcessed++
    if (!dryRun) saveCheckpoint(checkpoint)

    // Small delay between shows
    await delay(500)
  }

  console.log("\n" + "=".repeat(60))
  console.log("Summary:")
  console.log(`  Shows checked: ${showsToCheck.length}`)
  console.log(`  Shows with gaps: ${showsWithGaps}`)
  console.log(`  Total shows processed: ${checkpoint.stats.showsProcessed}`)
  console.log(`  Total episodes saved: ${checkpoint.stats.episodesSaved}`)
  if (checkpoint.stats.errors > 0) {
    console.log(`  Errors: ${checkpoint.stats.errors}`)
  }

  // Determine whether all shows in this run were actually processed
  const finalProcessedSet = new Set(checkpoint.processedShowIds)
  const allShowsProcessed = showsToCheck.every((show) => finalProcessedSet.has(show.tmdb_id))

  // Delete checkpoint on successful completion (all shows processed, no errors)
  if (!dryRun && showsToCheck.length > 0 && allShowsProcessed && checkpoint.stats.errors === 0) {
    console.log("\nAll shows processed with no errors. Deleting checkpoint.")
    deleteCheckpoint()
  } else if (
    !dryRun &&
    showsToCheck.length > 0 &&
    allShowsProcessed &&
    checkpoint.stats.errors > 0
  ) {
    console.log(
      "\nAll shows were attempted, but some errors occurred. " +
        "Progress saved to checkpoint - failed items will not be retried automatically."
    )
    console.log("To start fresh and retry all items, use the --fresh flag.")
  }
}

async function backfillShow(
  db: ReturnType<typeof getPool>,
  showTmdbId: number,
  forcedSource: DataSource | undefined,
  dryRun: boolean,
  checkpoint: Checkpoint
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

  // Check if we're resuming this specific show
  const isResumingSameShow = checkpoint.currentShowId === showTmdbId
  const processedSeasonSet = new Set(isResumingSameShow ? checkpoint.processedSeasons : [])

  if (isResumingSameShow && processedSeasonSet.size > 0) {
    console.log(`  Resuming - already processed seasons: ${checkpoint.processedSeasons.join(", ")}`)
  }

  // Update checkpoint to track current show
  checkpoint.currentShowId = showTmdbId
  if (!isResumingSameShow) {
    checkpoint.processedSeasons = []
  }
  if (!dryRun) saveCheckpoint(checkpoint)

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

  // Filter out already processed seasons
  const seasonsToProcess = gapResult.missingSeasons.filter((s) => !processedSeasonSet.has(s))

  if (seasonsToProcess.length === 0) {
    console.log("  All missing seasons already processed")
    return
  }

  console.log(`  Missing seasons to process: ${seasonsToProcess.join(", ")}`)

  // Get show details for context
  const showDetails = await getTVShowDetails(showTmdbId)

  let showEpisodeCount = 0

  for (const seasonNumber of seasonsToProcess) {
    console.log(`\n  Processing Season ${seasonNumber}...`)

    const seasonSummary = showDetails.seasons.find((s) => s.season_number === seasonNumber)
    const expectedCount = seasonSummary?.episode_count ?? 0

    try {
      const { episodes, source } = await fetchEpisodesWithFallback(
        showTmdbId,
        seasonNumber,
        externalIds
      )

      if (episodes.length === 0) {
        console.log(`    No episodes found from any source`)
        // Mark season as processed even if no episodes found
        checkpoint.processedSeasons.push(seasonNumber)
        checkpoint.stats.seasonsProcessed++
        if (!dryRun) saveCheckpoint(checkpoint)
        continue
      }

      if (forcedSource && source !== forcedSource) {
        console.log(
          `    Found ${episodes.length} episodes from ${source}, but --source ${forcedSource} was specified`
        )
        continue
      }

      console.log(
        `    Found ${episodes.length} episodes from ${source} (expected ${expectedCount})`
      )

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
        showEpisodeCount++
        checkpoint.stats.episodesSaved++

        if (dryRun) {
          console.log(
            `      Would save: S${ep.seasonNumber}E${ep.episodeNumber} - ${ep.name ?? "(no title)"}`
          )
        }
      }

      // Mark season as processed
      checkpoint.processedSeasons.push(seasonNumber)
      checkpoint.stats.seasonsProcessed++
      if (!dryRun) saveCheckpoint(checkpoint)
    } catch (error) {
      checkpoint.stats.errors++
      console.log(`    Error: ${error instanceof Error ? error.message : "unknown"}`)
      // Mark season as processed even on error to avoid infinite retry loops
      if (!checkpoint.processedSeasons.includes(seasonNumber)) {
        checkpoint.processedSeasons.push(seasonNumber)
        checkpoint.stats.seasonsProcessed++
      }
      if (!dryRun) saveCheckpoint(checkpoint)
    }
  }

  console.log(`\n  ${dryRun ? "Would save" : "Saved"} ${showEpisodeCount} episodes for this show`)

  // Clear current show tracking since we're done with this show
  checkpoint.currentShowId = null
  checkpoint.processedSeasons = []
  if (!dryRun) saveCheckpoint(checkpoint)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Only run when executed directly, not when imported for testing
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
