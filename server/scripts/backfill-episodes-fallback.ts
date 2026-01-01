#!/usr/bin/env tsx
/**
 * Backfill episodes using fallback data sources (TVmaze/TheTVDB/IMDb).
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
 *   --source <src>   Force a specific source (tvmaze, thetvdb, or imdb)
 *   --include-cast   Also fetch cast from IMDb and look up death causes
 *   --dry-run        Preview without writing to database
 *   --fresh          Start fresh (ignore checkpoint)
 *
 * Examples:
 *   npm run backfill:episodes:fallback                       # Backfill all shows with gaps (default)
 *   npm run backfill:episodes:fallback -- --detect-gaps      # Find shows with gaps (report only)
 *   npm run backfill:episodes:fallback -- --show 987         # Backfill General Hospital only
 *   npm run backfill:episodes:fallback -- --show 987 --source tvmaze
 *   npm run backfill:episodes:fallback -- --show 879 --source imdb  # Use IMDb datasets
 *   npm run backfill:episodes:fallback -- --show 879 --include-cast # Include cast with death lookups
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
  upsertActor,
  batchUpsertShowActorAppearances,
  updateDeathInfoByActorId,
  getActorById,
  type EpisodeRecord,
  type ActorInput,
  type ShowActorAppearanceRecord,
} from "../src/lib/db.js"
import { getTVShowDetails } from "../src/lib/tmdb.js"
import {
  detectShowDataGaps,
  getExternalIds,
  fetchEpisodesWithFallback,
  type DataSource,
} from "../src/lib/episode-data-source.js"
import {
  loadCheckpoint as loadCheckpointGeneric,
  saveCheckpoint as saveCheckpointGeneric,
  deleteCheckpoint as deleteCheckpointGeneric,
} from "../src/lib/checkpoint-utils.js"
import { getEpisodeCastWithDetails } from "../src/lib/imdb.js"
import { getCauseOfDeath } from "../src/lib/wikidata.js"
import { calculateMovieMortality } from "../src/lib/mortality-stats.js"

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
    actorsSaved: number
    appearancesSaved: number
    deathCauseLookups: number
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
  if (value !== "tvmaze" && value !== "thetvdb" && value !== "imdb") {
    throw new InvalidArgumentError("Source must be 'tvmaze', 'thetvdb', or 'imdb'")
  }
  return value
}

interface ShowInfo {
  tmdb_id: number
  name: string
  tvmaze_id: number | null
  thetvdb_id: number | null
  imdb_id: string | null
}

const program = new Command()
  .name("backfill-episodes-fallback")
  .description("Backfill episodes from TVmaze/TheTVDB/IMDb for shows with TMDB data gaps")
  .option("--detect-gaps", "Scan shows and report which have data gaps")
  .option("-s, --show <id>", "Process a single show by TMDB ID", parsePositiveInt)
  .option("--all-gaps", "Process all shows with detected gaps (this is the default mode)")
  .option("--source <source>", "Force a specific source (tvmaze, thetvdb, or imdb)", parseSource)
  .option("--include-cast", "Also fetch cast for episodes (from IMDb) and look up death causes")
  .option("-n, --dry-run", "Preview without writing to database")
  .option("--fresh", "Start fresh (ignore checkpoint)")
  .action(
    async (options: {
      detectGaps?: boolean
      show?: number
      allGaps?: boolean
      source?: DataSource
      includeCast?: boolean
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
  includeCast?: boolean
  dryRun?: boolean
  fresh?: boolean
}) {
  const {
    detectGaps,
    show: showId,
    allGaps,
    source: forcedSource,
    includeCast,
    dryRun,
    fresh,
  } = options

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
      stats: {
        showsProcessed: 0,
        seasonsProcessed: 0,
        episodesSaved: 0,
        actorsSaved: 0,
        appearancesSaved: 0,
        deathCauseLookups: 0,
        errors: 0,
      },
    }
  }

  // Migrate older checkpoints that don't have new stats fields
  if (checkpoint.stats.actorsSaved === undefined) checkpoint.stats.actorsSaved = 0
  if (checkpoint.stats.appearancesSaved === undefined) checkpoint.stats.appearancesSaved = 0
  if (checkpoint.stats.deathCauseLookups === undefined) checkpoint.stats.deathCauseLookups = 0

  if (effectiveAllGaps) {
    await backfillAllGaps(db, forcedSource, includeCast ?? false, dryRun ?? false, checkpoint)
  } else if (showId) {
    await backfillShow(db, showId, forcedSource, includeCast ?? false, dryRun ?? false, checkpoint)
  }

  // Close database pool to allow process to exit
  await resetPool()
}

async function detectDataGaps(db: ReturnType<typeof getPool>) {
  console.log("Scanning shows for TMDB data gaps...\n")

  const result = await db.query<ShowInfo>(
    "SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id FROM shows ORDER BY popularity DESC NULLS LAST"
  )

  let showsWithGaps = 0
  let totalMissingSeasons = 0

  for (const show of result.rows) {
    const gapResult = await detectShowDataGaps(show.tmdb_id)

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
  includeCast: boolean,
  dryRun: boolean,
  checkpoint: Checkpoint
) {
  console.log(
    `\nBackfilling all shows with TMDB data gaps${includeCast ? " (including cast)" : ""}${dryRun ? " (DRY RUN)" : ""}`
  )

  const result = await db.query<ShowInfo>(
    "SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id FROM shows ORDER BY popularity DESC NULLS LAST"
  )

  const processedSet = new Set(checkpoint.processedShowIds)
  const showsToCheck = result.rows.filter((show) => !processedSet.has(show.tmdb_id))

  console.log(
    `Checking ${showsToCheck.length} shows for gaps (${processedSet.size} already processed)\n`
  )

  let showsWithGaps = 0

  for (const show of showsToCheck) {
    // Check for gaps
    const gapResult = await detectShowDataGaps(show.tmdb_id)

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
    await backfillShow(db, show.tmdb_id, forcedSource, includeCast, dryRun, checkpoint)

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
  if (checkpoint.stats.actorsSaved > 0) {
    console.log(`  Total actors saved: ${checkpoint.stats.actorsSaved}`)
    console.log(`  Total appearances saved: ${checkpoint.stats.appearancesSaved}`)
    console.log(`  Death cause lookups: ${checkpoint.stats.deathCauseLookups}`)
  }
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
  includeCast: boolean,
  dryRun: boolean,
  checkpoint: Checkpoint
) {
  // Get show info from database
  const showResult = await db.query<ShowInfo>(
    "SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id FROM shows WHERE tmdb_id = $1",
    [showTmdbId]
  )

  if (showResult.rows.length === 0) {
    console.error(`Show not found in database: ${showTmdbId}`)
    process.exit(1)
  }

  const show = showResult.rows[0]
  const castSuffix = includeCast ? " (including cast)" : ""
  console.log(
    `\nBackfilling: ${show.name} (${show.tmdb_id})${castSuffix}${dryRun ? " (DRY RUN)" : ""}`
  )

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
    imdbId: show.imdb_id,
  }

  // Fetch external IDs if any are missing (especially IMDb for fallback)
  const needsFetch = !externalIds.tvmazeId || !externalIds.thetvdbId || !externalIds.imdbId
  if (needsFetch) {
    console.log("  Fetching external IDs...")
    const fetched = await getExternalIds(showTmdbId)

    // Merge fetched IDs with existing (keep existing if already set)
    externalIds = {
      tvmazeId: externalIds.tvmazeId ?? fetched.tvmazeId,
      thetvdbId: externalIds.thetvdbId ?? fetched.thetvdbId,
      imdbId: externalIds.imdbId ?? fetched.imdbId,
    }

    if (!dryRun && (fetched.tvmazeId || fetched.thetvdbId || fetched.imdbId)) {
      await updateShowExternalIds(showTmdbId, fetched.tvmazeId, fetched.thetvdbId, fetched.imdbId)
    }
  }

  console.log(
    `  External IDs: TVmaze=${externalIds.tvmazeId ?? "none"}, TheTVDB=${externalIds.thetvdbId ?? "none"}, IMDb=${externalIds.imdbId ?? "none"}`
  )

  // Detect gaps - automatically checks TMDB and IMDb when available
  const gapResult = await detectShowDataGaps(showTmdbId, externalIds.imdbId)

  if (!gapResult.hasGaps) {
    console.log("  No data gaps detected for this show")
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

      // Collect episodes with IMDb IDs for cast processing
      const episodesWithImdb: Array<{
        seasonNumber: number
        episodeNumber: number
        imdbEpisodeId: string
        airDate: string | null
      }> = []

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
          imdb_episode_id: ep.imdbEpisodeId ?? null,
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

        // Track episodes with IMDb IDs for cast processing
        if (ep.imdbEpisodeId) {
          episodesWithImdb.push({
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            imdbEpisodeId: ep.imdbEpisodeId,
            airDate: ep.airDate,
          })
        }
      }

      // Process cast if requested and we have IMDb episode IDs
      if (includeCast && episodesWithImdb.length > 0) {
        console.log(`    Processing cast for ${episodesWithImdb.length} episodes with IMDb IDs...`)
        await processEpisodeCast(showTmdbId, episodesWithImdb, source, dryRun, checkpoint)
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

/**
 * Process cast for episodes with IMDb IDs.
 * - Fetches cast from IMDb datasets
 * - Creates/updates actors
 * - Looks up death causes for deceased actors
 * - Creates actor_show_appearances records
 * - Updates episode with cast_count, deceased_count, and mortality stats
 */
async function processEpisodeCast(
  showTmdbId: number,
  episodes: Array<{
    seasonNumber: number
    episodeNumber: number
    imdbEpisodeId: string
    airDate: string | null
  }>,
  source: DataSource,
  dryRun: boolean,
  checkpoint: Checkpoint
): Promise<void> {
  const currentYear = new Date().getFullYear()
  // Track unique actors across all episodes in this batch
  const seenActorIds = new Set<number>()

  for (const ep of episodes) {
    try {
      // Fetch cast from IMDb
      const cast = await getEpisodeCastWithDetails(ep.imdbEpisodeId)

      if (cast.length === 0) {
        continue
      }

      console.log(`      S${ep.seasonNumber}E${ep.episodeNumber}: ${cast.length} cast members`)

      // Get filming year from air date (approximate)
      const filmingYear = ep.airDate ? parseInt(ep.airDate.split("-")[0], 10) : null

      // Process each cast member
      const appearances: ShowActorAppearanceRecord[] = []
      const mortalityInputs: Array<{
        tmdbId: number
        name: string
        birthday: string | null
        deathday: string | null
      }> = []
      let deceasedCount = 0

      for (const castMember of cast) {
        // Create actor input
        const actorInput: ActorInput = {
          name: castMember.name,
          imdb_person_id: castMember.imdbPersonId,
          // IMDb only has birth/death years, not full dates
          // We'll create placeholder dates using January 1st
          birthday: castMember.birthYear ? `${castMember.birthYear}-01-01` : null,
          deathday: castMember.deathYear ? `${castMember.deathYear}-01-01` : null,
        }

        let actorId: number
        if (!dryRun) {
          actorId = await upsertActor(actorInput)
          // Only count unique actors (not duplicate upserts)
          if (!seenActorIds.has(actorId)) {
            seenActorIds.add(actorId)
            checkpoint.stats.actorsSaved++
          }

          // If actor is deceased and we don't have cause of death, look it up
          if (castMember.deathYear) {
            const actor = await getActorById(actorId)
            if (actor && !actor.cause_of_death) {
              console.log(`        Looking up death cause for ${castMember.name}...`)
              const deathResult = await getCauseOfDeath(
                castMember.name,
                actorInput.birthday ?? null,
                actorInput.deathday!
              )

              if (deathResult.causeOfDeath) {
                checkpoint.stats.deathCauseLookups++
                await updateDeathInfoByActorId(
                  actorId,
                  deathResult.causeOfDeath,
                  deathResult.causeOfDeathSource,
                  deathResult.causeOfDeathDetails,
                  deathResult.causeOfDeathDetailsSource,
                  deathResult.wikipediaUrl
                )
                console.log(`          Found: ${deathResult.causeOfDeath}`)
              }

              // Small delay to avoid rate limiting Claude API
              await delay(500)
            }
          }
        } else {
          actorId = 0 // Placeholder for dry run
          console.log(
            `        Would save actor: ${castMember.name}${castMember.deathYear ? ` (d. ${castMember.deathYear})` : ""}`
          )
        }

        // Calculate age at filming
        let ageAtFilming: number | null = null
        if (castMember.birthYear && filmingYear) {
          ageAtFilming = filmingYear - castMember.birthYear
        }

        // Create appearance record
        appearances.push({
          actor_id: actorId,
          show_tmdb_id: showTmdbId,
          season_number: ep.seasonNumber,
          episode_number: ep.episodeNumber,
          character_name: castMember.characterName,
          appearance_type: castMember.appearanceType,
          billing_order: castMember.billingOrder,
          age_at_filming: ageAtFilming,
        })

        // Track mortality data
        if (castMember.deathYear) {
          deceasedCount++
        }
        mortalityInputs.push({
          tmdbId: 0, // Not used for calculation
          name: castMember.name,
          birthday: actorInput.birthday ?? null,
          deathday: actorInput.deathday ?? null,
        })
      }

      // Save appearances
      if (!dryRun && appearances.length > 0) {
        await batchUpsertShowActorAppearances(appearances)
        checkpoint.stats.appearancesSaved += appearances.length
      }

      // Calculate mortality statistics
      const mortalityStats = await calculateMovieMortality(
        filmingYear ?? currentYear,
        mortalityInputs,
        currentYear
      )

      // Update episode with cast statistics
      if (!dryRun) {
        const episodeRecord: EpisodeRecord = {
          show_tmdb_id: showTmdbId,
          season_number: ep.seasonNumber,
          episode_number: ep.episodeNumber,
          name: null, // Will be preserved by COALESCE in upsert
          air_date: ep.airDate,
          runtime: null,
          cast_count: cast.length,
          deceased_count: deceasedCount,
          guest_star_count: cast.filter((c) => c.appearanceType === "guest").length,
          expected_deaths: mortalityStats.expectedDeaths,
          mortality_surprise_score: mortalityStats.mortalitySurpriseScore,
          cast_data_source: source,
        }
        await upsertEpisode(episodeRecord)
      }

      // Save checkpoint periodically
      if (!dryRun) saveCheckpoint(checkpoint)
    } catch (error) {
      checkpoint.stats.errors++
      console.log(
        `      Error processing cast for S${ep.seasonNumber}E${ep.episodeNumber}: ${error instanceof Error ? error.message : "unknown"}`
      )
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Only run when executed directly, not when imported for testing
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
