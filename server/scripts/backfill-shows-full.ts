#!/usr/bin/env tsx
/**
 * All-in-one TV show backfill script.
 *
 * This script backfills episodes, cast, and death causes for TV shows in a single session.
 * It uses session-wide caching to eliminate duplicate lookups across shows.
 *
 * Usage:
 *   npm run backfill:shows:full -- --shows 987,879,910
 *   npm run backfill:shows:full -- --shows 987 --source imdb
 *   npm run backfill:shows:full -- --detect-gaps --limit 10
 *
 * Options:
 *   --shows <ids>       Comma-separated TMDB show IDs to process
 *   --detect-gaps       Process shows with detected data gaps
 *   --limit <n>         Limit to first N shows (with --detect-gaps)
 *   --source <src>      Force a specific source (tvmaze, thetvdb, or imdb)
 *   --include-cast      Also fetch cast and look up death causes
 *   --dry-run           Preview without writing to database
 *   --fresh             Start fresh (ignore checkpoint)
 *
 * Examples:
 *   npm run backfill:shows:full -- --shows 987,879,910
 *   npm run backfill:shows:full -- --detect-gaps --limit 5 --include-cast
 *   npm run backfill:shows:full -- --shows 987 --source imdb --include-cast
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
  type ExternalShowIds,
} from "../src/lib/episode-data-source.js"
import {
  loadCheckpoint as loadCheckpointGeneric,
  saveCheckpoint as saveCheckpointGeneric,
  deleteCheckpoint as deleteCheckpointGeneric,
} from "../src/lib/checkpoint-utils.js"
import { getEpisodeCastWithDetails } from "../src/lib/imdb.js"
import { getCauseOfDeath } from "../src/lib/wikidata.js"
import { calculateMovieMortality } from "../src/lib/mortality-stats.js"
import { initNewRelic, recordCustomEvent } from "../src/lib/newrelic.js"

// Initialize New Relic for monitoring
initNewRelic()

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join(process.cwd(), ".backfill-shows-full-checkpoint.json")

export interface Checkpoint {
  startedAt: string
  lastUpdated: string
  showsToProcess: number[]
  showsCompleted: number[]
  currentShow: number | null
  currentSeason: number | null
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

interface BackfillSession {
  // Session-wide caches to eliminate duplicate lookups
  externalIdsCache: Map<number, ExternalShowIds>
  deathCauseLookedUp: Set<number>
  processedEpisodes: Set<string>
  checkpoint: Checkpoint
  dryRun: boolean
}

interface ShowInfo {
  tmdb_id: number
  name: string
  tvmaze_id: number | null
  thetvdb_id: number | null
  imdb_id: string | null
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
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

export function parseShowIds(value: string): number[] {
  const ids = value.split(",").map((id) => {
    const trimmed = id.trim()
    if (!/^\d+$/.test(trimmed)) {
      throw new InvalidArgumentError(`Invalid show ID: ${trimmed}`)
    }
    return parseInt(trimmed, 10)
  })
  if (ids.length === 0) {
    throw new InvalidArgumentError("At least one show ID is required")
  }
  return ids
}

export function parseSource(value: string): DataSource {
  // Note: 'tmdb' is excluded because it's the primary source, not a fallback.
  // The --source flag forces fetching from a specific *fallback* source.
  if (value !== "tvmaze" && value !== "thetvdb" && value !== "imdb") {
    throw new InvalidArgumentError("Source must be 'tvmaze', 'thetvdb', or 'imdb'")
  }
  return value
}

const program = new Command()
  .name("backfill-shows-full")
  .description("All-in-one TV show backfill with session-wide caching and New Relic monitoring")
  .option("-s, --shows <ids>", "Comma-separated TMDB show IDs", parseShowIds)
  .option("--detect-gaps", "Process shows with detected data gaps")
  .option("-l, --limit <n>", "Limit to first N shows (with --detect-gaps)", parsePositiveInt)
  .option("--source <source>", "Force a specific source (tvmaze, thetvdb, or imdb)", parseSource)
  .option("--include-cast", "Also fetch cast and look up death causes")
  .option("-n, --dry-run", "Preview without writing to database")
  .option("--fresh", "Start fresh (ignore checkpoint)")
  .action(
    async (options: {
      shows?: number[]
      detectGaps?: boolean
      limit?: number
      source?: DataSource
      includeCast?: boolean
      dryRun?: boolean
      fresh?: boolean
    }) => {
      await runBackfill(options)
    }
  )

async function runBackfill(options: {
  shows?: number[]
  detectGaps?: boolean
  limit?: number
  source?: DataSource
  includeCast?: boolean
  dryRun?: boolean
  fresh?: boolean
}) {
  const {
    shows: showIds,
    detectGaps,
    limit,
    source: forcedSource,
    includeCast,
    dryRun,
    fresh,
  } = options

  if (!showIds && !detectGaps) {
    console.error("Error: Either --shows or --detect-gaps is required")
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
  const startTime = Date.now()

  // Get shows to process
  let showsToProcess: number[] = []

  if (showIds) {
    showsToProcess = showIds
  } else if (detectGaps) {
    console.log("Scanning for shows with data gaps...")
    const result = await db.query<ShowInfo>(
      "SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id FROM shows ORDER BY popularity DESC NULLS LAST"
    )

    for (const show of result.rows) {
      const gaps = await detectShowDataGaps(show.tmdb_id, show.imdb_id)
      if (gaps.hasGaps) {
        showsToProcess.push(show.tmdb_id)
        console.log(
          `  Found gaps: ${show.name} (${show.tmdb_id}) - ${gaps.missingSeasons.length} seasons`
        )
        if (limit && showsToProcess.length >= limit) {
          console.log(`  Reached limit of ${limit} shows`)
          break
        }
      }
      await delay(100)
    }
    console.log(`Found ${showsToProcess.length} shows with gaps\n`)
  }

  if (showsToProcess.length === 0) {
    console.log("No shows to process")
    await resetPool()
    return
  }

  // Load or create checkpoint
  let checkpoint: Checkpoint | null = null
  if (!fresh && !dryRun) {
    checkpoint = loadCheckpoint()
    if (checkpoint) {
      console.log(`\nResuming from checkpoint (started ${checkpoint.startedAt})`)
      console.log(`  Shows completed: ${checkpoint.showsCompleted.length}`)
      console.log(`  Episodes saved: ${checkpoint.stats.episodesSaved}`)
      console.log(`  Errors: ${checkpoint.stats.errors}`)
    }
  }

  if (!checkpoint) {
    checkpoint = {
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      showsToProcess,
      showsCompleted: [],
      currentShow: null,
      currentSeason: null,
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

  // Create session with caches
  const session: BackfillSession = {
    externalIdsCache: new Map(),
    deathCauseLookedUp: new Set(),
    processedEpisodes: new Set(),
    checkpoint,
    dryRun: dryRun ?? false,
  }

  console.log(
    `\nProcessing ${showsToProcess.length} shows${includeCast ? " (including cast)" : ""}${dryRun ? " (DRY RUN)" : ""}\n`
  )

  // Record session start event
  recordCustomEvent("BackfillSessionStarted", {
    showsCount: showsToProcess.length,
    includeCast: includeCast ?? false,
    forcedSource: forcedSource ?? "cascade",
    dryRun: dryRun ?? false,
  })

  // Process each show
  for (const showTmdbId of showsToProcess) {
    // Skip already completed shows
    if (checkpoint.showsCompleted.includes(showTmdbId)) {
      continue
    }

    await processShow(db, showTmdbId, forcedSource, includeCast ?? false, session)
  }

  const totalDuration = Date.now() - startTime

  // Print summary
  console.log("\n" + "=".repeat(60))
  console.log("Summary:")
  console.log(`  Shows processed: ${checkpoint.stats.showsProcessed}`)
  console.log(`  Seasons processed: ${checkpoint.stats.seasonsProcessed}`)
  console.log(`  Episodes saved: ${checkpoint.stats.episodesSaved}`)
  if (checkpoint.stats.actorsSaved > 0) {
    console.log(`  Actors saved: ${checkpoint.stats.actorsSaved}`)
    console.log(`  Appearances saved: ${checkpoint.stats.appearancesSaved}`)
    console.log(`  Death cause lookups: ${checkpoint.stats.deathCauseLookups}`)
  }
  if (checkpoint.stats.errors > 0) {
    console.log(`  Errors: ${checkpoint.stats.errors}`)
  }
  console.log(`  Duration: ${Math.round(totalDuration / 1000)}s`)

  // Record session complete event
  recordCustomEvent("BackfillSessionCompleted", {
    showsProcessed: checkpoint.stats.showsProcessed,
    seasonsProcessed: checkpoint.stats.seasonsProcessed,
    totalEpisodesSaved: checkpoint.stats.episodesSaved,
    totalActorsSaved: checkpoint.stats.actorsSaved,
    totalDeathCauseLookups: checkpoint.stats.deathCauseLookups,
    totalErrors: checkpoint.stats.errors,
    totalDurationMs: totalDuration,
  })

  // Delete checkpoint on successful completion
  const allCompleted = showsToProcess.every((id) => checkpoint!.showsCompleted.includes(id))
  if (!dryRun && allCompleted && checkpoint.stats.errors === 0) {
    console.log("\nAll shows processed with no errors. Deleting checkpoint.")
    deleteCheckpoint()
  } else if (!dryRun && allCompleted && checkpoint.stats.errors > 0) {
    console.log(
      "\nAll shows processed but some errors occurred. Keeping checkpoint so you can resume or investigate."
    )
    console.log(
      "If you've fixed the issues and want to start fresh, rerun with --fresh or manually delete the checkpoint file."
    )
  }

  await resetPool()
}

async function processShow(
  db: ReturnType<typeof getPool>,
  showTmdbId: number,
  forcedSource: DataSource | undefined,
  includeCast: boolean,
  session: BackfillSession
): Promise<void> {
  const { checkpoint, dryRun } = session
  const showStartTime = Date.now()

  // Get show info
  const showResult = await db.query<ShowInfo>(
    "SELECT tmdb_id, name, tvmaze_id, thetvdb_id, imdb_id FROM shows WHERE tmdb_id = $1",
    [showTmdbId]
  )

  if (showResult.rows.length === 0) {
    console.error(`Show not found in database: ${showTmdbId}`)
    checkpoint.stats.errors++
    recordCustomEvent("BackfillError", {
      showTmdbId,
      errorType: "ShowNotFound",
      errorMessage: "Show not found in database",
    })
    if (!dryRun) saveCheckpoint(checkpoint)
    return
  }

  const show = showResult.rows[0]
  console.log(`\n${"=".repeat(60)}`)
  console.log(`Processing: ${show.name} (${show.tmdb_id})`)

  checkpoint.currentShow = showTmdbId

  // Get external IDs (cached)
  let externalIds = session.externalIdsCache.get(showTmdbId)
  if (!externalIds) {
    externalIds = {
      tvmazeId: show.tvmaze_id,
      thetvdbId: show.thetvdb_id,
      imdbId: show.imdb_id,
    }

    // Fetch missing IDs
    if (!externalIds.tvmazeId || !externalIds.thetvdbId || !externalIds.imdbId) {
      console.log("  Fetching external IDs...")
      const fetched = await getExternalIds(showTmdbId)
      externalIds = {
        tvmazeId: externalIds.tvmazeId ?? fetched.tvmazeId,
        thetvdbId: externalIds.thetvdbId ?? fetched.thetvdbId,
        imdbId: externalIds.imdbId ?? fetched.imdbId,
      }

      if (!dryRun && (fetched.tvmazeId || fetched.thetvdbId || fetched.imdbId)) {
        await updateShowExternalIds(showTmdbId, fetched.tvmazeId, fetched.thetvdbId, fetched.imdbId)
      }
    }

    session.externalIdsCache.set(showTmdbId, externalIds)
  }

  console.log(
    `  External IDs: TVmaze=${externalIds.tvmazeId ?? "none"}, TheTVDB=${externalIds.thetvdbId ?? "none"}, IMDb=${externalIds.imdbId ?? "none"}`
  )

  // Detect gaps
  const gapResult = await detectShowDataGaps(showTmdbId, externalIds.imdbId)

  if (!gapResult.hasGaps) {
    console.log("  No data gaps detected")
    checkpoint.showsCompleted.push(showTmdbId)
    checkpoint.stats.showsProcessed++
    if (!dryRun) saveCheckpoint(checkpoint)
    return
  }

  console.log(`  Missing seasons: ${gapResult.missingSeasons.join(", ")}`)

  // Record show started event
  recordCustomEvent("BackfillShowStarted", {
    showTmdbId,
    showName: show.name,
    imdbId: externalIds.imdbId ?? "none",
    missingSeasonsCount: gapResult.missingSeasons.length,
  })

  // Get show details for context
  const showDetails = await getTVShowDetails(showTmdbId)
  let showEpisodeCount = 0
  let showCastCount = 0

  // Process each missing season
  for (const seasonNumber of gapResult.missingSeasons) {
    console.log(`\n  Processing Season ${seasonNumber}...`)
    checkpoint.currentSeason = seasonNumber
    const seasonStartTime = Date.now()

    const seasonSummary = showDetails.seasons.find((s) => s.season_number === seasonNumber)
    const expectedCount = seasonSummary?.episode_count ?? 0

    try {
      const { episodes, source } = await fetchEpisodesWithFallback(
        showTmdbId,
        seasonNumber,
        externalIds,
        forcedSource
      )

      if (episodes.length === 0) {
        console.log(
          `    No episodes found${forcedSource ? ` from ${forcedSource}` : " from any source"}`
        )
        checkpoint.stats.seasonsProcessed++
        if (!dryRun) saveCheckpoint(checkpoint)
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
        // Skip if already processed
        const epKey = `${showTmdbId}:${ep.seasonNumber}:${ep.episodeNumber}`
        if (session.processedEpisodes.has(epKey)) {
          continue
        }
        session.processedEpisodes.add(epKey)

        const episodeRecord: EpisodeRecord = {
          show_tmdb_id: showTmdbId,
          season_number: ep.seasonNumber,
          episode_number: ep.episodeNumber,
          name: ep.name,
          air_date: ep.airDate,
          runtime: ep.runtime,
          cast_count: 0,
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

        if (ep.imdbEpisodeId) {
          episodesWithImdb.push({
            seasonNumber: ep.seasonNumber,
            episodeNumber: ep.episodeNumber,
            imdbEpisodeId: ep.imdbEpisodeId,
            airDate: ep.airDate,
          })
        }
      }

      // Process cast if requested
      let seasonCastCount = 0
      if (includeCast && episodesWithImdb.length > 0) {
        console.log(`    Processing cast for ${episodesWithImdb.length} episodes with IMDb IDs...`)
        seasonCastCount = await processEpisodeCast(showTmdbId, episodesWithImdb, source, session)
        showCastCount += seasonCastCount
      }

      // Record season completion
      const seasonDuration = Date.now() - seasonStartTime
      recordCustomEvent("BackfillSeasonCompleted", {
        showTmdbId,
        seasonNumber,
        episodesSaved: episodes.length,
        castMembersSaved: seasonCastCount,
        durationMs: seasonDuration,
      })

      checkpoint.stats.seasonsProcessed++
      if (!dryRun) saveCheckpoint(checkpoint)
    } catch (error) {
      checkpoint.stats.errors++
      const errorMessage = error instanceof Error ? error.message : "unknown error"
      console.log(`    Error: ${errorMessage}`)
      recordCustomEvent("BackfillError", {
        showTmdbId,
        seasonNumber,
        errorType: "SeasonProcessingError",
        errorMessage,
      })
      if (!dryRun) saveCheckpoint(checkpoint)
    }
  }

  // Mark show complete
  checkpoint.showsCompleted.push(showTmdbId)
  checkpoint.stats.showsProcessed++
  checkpoint.currentShow = null
  checkpoint.currentSeason = null
  if (!dryRun) saveCheckpoint(checkpoint)

  const showDuration = Date.now() - showStartTime
  console.log(
    `\n  Saved ${showEpisodeCount} episodes${showCastCount > 0 ? `, ${showCastCount} cast members` : ""} in ${Math.round(showDuration / 1000)}s`
  )
}

async function processEpisodeCast(
  showTmdbId: number,
  episodes: Array<{
    seasonNumber: number
    episodeNumber: number
    imdbEpisodeId: string
    airDate: string | null
  }>,
  source: DataSource,
  session: BackfillSession
): Promise<number> {
  const { checkpoint, dryRun, deathCauseLookedUp } = session
  const currentYear = new Date().getFullYear()
  let castSaved = 0
  const seenActorIds = new Set<number>()
  let episodesProcessedSinceCheckpoint = 0
  const CHECKPOINT_INTERVAL = 10 // Save checkpoint every N episodes

  for (const ep of episodes) {
    try {
      const cast = await getEpisodeCastWithDetails(ep.imdbEpisodeId)

      if (cast.length === 0) {
        continue
      }

      console.log(`      S${ep.seasonNumber}E${ep.episodeNumber}: ${cast.length} cast members`)

      const filmingYear = ep.airDate ? parseInt(ep.airDate.split("-")[0], 10) : null
      const appearances: ShowActorAppearanceRecord[] = []
      const mortalityInputs: Array<{
        tmdbId: number
        name: string
        birthday: string | null
        deathday: string | null
      }> = []
      let deceasedCount = 0

      for (const castMember of cast) {
        const actorInput: ActorInput = {
          name: castMember.name,
          imdb_person_id: castMember.imdbPersonId,
          birthday: castMember.birthYear ? `${castMember.birthYear}-01-01` : null,
          deathday: castMember.deathYear ? `${castMember.deathYear}-01-01` : null,
        }

        let actorId: number
        if (!dryRun) {
          actorId = await upsertActor(actorInput)
          if (!seenActorIds.has(actorId)) {
            seenActorIds.add(actorId)
            checkpoint.stats.actorsSaved++
            castSaved++
          }

          // Session-wide deduplication for death cause lookups
          // Note: We add to the Set early (before checking cause_of_death) to prevent
          // both redundant database queries AND redundant API lookups within this session.
          // deathCauseLookups counter only tracks actual API calls that found results.
          if (castMember.deathYear && !deathCauseLookedUp.has(actorId)) {
            deathCauseLookedUp.add(actorId)

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

              await delay(500)
            }
          }
        } else {
          actorId = 0
          console.log(
            `        Would save actor: ${castMember.name}${castMember.deathYear ? ` (d. ${castMember.deathYear})` : ""}`
          )
        }

        let ageAtFilming: number | null = null
        if (castMember.birthYear && filmingYear) {
          ageAtFilming = filmingYear - castMember.birthYear
        }

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

        if (castMember.deathYear) {
          deceasedCount++
        }
        mortalityInputs.push({
          tmdbId: 0,
          name: castMember.name,
          birthday: actorInput.birthday ?? null,
          deathday: actorInput.deathday ?? null,
        })
      }

      if (!dryRun && appearances.length > 0) {
        await batchUpsertShowActorAppearances(appearances)
        checkpoint.stats.appearancesSaved += appearances.length
      }

      const mortalityStats = await calculateMovieMortality(
        filmingYear ?? currentYear,
        mortalityInputs,
        currentYear
      )

      if (!dryRun) {
        const episodeRecord: EpisodeRecord = {
          show_tmdb_id: showTmdbId,
          season_number: ep.seasonNumber,
          episode_number: ep.episodeNumber,
          name: null,
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

      // Batch checkpoint saves for performance (every N episodes instead of every single one)
      episodesProcessedSinceCheckpoint++
      if (!dryRun && episodesProcessedSinceCheckpoint >= CHECKPOINT_INTERVAL) {
        saveCheckpoint(checkpoint)
        episodesProcessedSinceCheckpoint = 0
      }
    } catch (error) {
      checkpoint.stats.errors++
      console.log(
        `      Error processing cast for S${ep.seasonNumber}E${ep.episodeNumber}: ${error instanceof Error ? error.message : "unknown"}`
      )
    }
  }

  // Final checkpoint save for any remaining episodes
  if (!dryRun && episodesProcessedSinceCheckpoint > 0) {
    saveCheckpoint(checkpoint)
  }

  return castSaved
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Only run when executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
