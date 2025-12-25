#!/usr/bin/env tsx
/**
 * Import script to populate the shows and show_actor_appearances tables.
 * Supports phased imports with checkpointing for large-scale imports.
 *
 * Usage:
 *   npm run import:shows -- [options]
 *
 * Options:
 *   --phase <phase>     Import phase: popular (>50 popularity), standard (10-50), obscure (<10)
 *   --max-shows <n>     Maximum shows to import (default: 500)
 *   --batch-size <n>    Shows per batch before checkpoint (default: 50)
 *   --resume            Resume from last checkpoint
 *   --dry-run           Preview without writing to database
 *
 * Examples:
 *   npm run import:shows -- --phase popular --max-shows 500
 *   npm run import:shows -- --phase standard --max-shows 1000
 *   npm run import:shows -- --resume
 *   npm run import:shows -- --phase popular --dry-run
 */

import "dotenv/config"
import { Command } from "commander"
import {
  discoverTVShows,
  getTVShowDetails,
  getTVShowAggregateCredits,
  batchGetPersonDetails,
  type TMDBTVShow,
} from "../src/lib/tmdb.js"
import { calculateMovieMortality } from "../src/lib/mortality-stats.js"
import {
  upsertShow,
  batchUpsertShowActorAppearances,
  getSyncState,
  updateSyncState,
  type ShowRecord,
  type ShowActorAppearanceRecord,
} from "../src/lib/db.js"
import {
  PHASE_THRESHOLDS,
  parsePositiveInt,
  parsePhase,
  type ImportPhase,
} from "../src/lib/import-phases.js"

// Re-export for backwards compatibility with tests
export { PHASE_THRESHOLDS, parsePositiveInt, parsePhase, type ImportPhase }

// Sync state key for import tracking
const SYNC_TYPE = "show_import"

// Cast limit per show
const CAST_LIMIT = 50

// Rate limiting delays (in milliseconds)
const API_CALL_DELAY_MS = 50
const SHOW_PROCESSING_DELAY_MS = 100

// Number of pages to search before warning about missing resume ID
const RESUME_ID_SEARCH_LIMIT = 20

// Estimated shows matching each phase per TMDB page (for resume page estimation)
// These are conservative estimates to ensure we don't skip past the resume point
const ESTIMATED_MATCHES_PER_PAGE: Record<ImportPhase, number> = {
  popular: 15, // High popularity shows are common at the top
  standard: 8, // Medium popularity shows are moderately common
  obscure: 3, // Low popularity shows are rare per page
}

// Buffer pages to search before the estimated resume page (in case estimates are off)
const RESUME_PAGE_BUFFER = 10

/**
 * Calculate the starting page for resume based on shows already processed.
 * Uses conservative estimates to ensure we don't skip past the resume point.
 */
export function calculateResumeStartPage(phase: ImportPhase, phaseCompleted: number): number {
  if (phaseCompleted === 0) return 1

  const matchesPerPage = ESTIMATED_MATCHES_PER_PAGE[phase]
  const estimatedPage = Math.floor(phaseCompleted / matchesPerPage)

  // Start a few pages before the estimate to ensure we find the resume ID
  return Math.max(1, estimatedPage - RESUME_PAGE_BUFFER)
}

/**
 * Checks if error threshold has been exceeded.
 * Returns true if import should abort due to too many errors.
 */
export function shouldAbortDueToErrors(
  errorCount: number,
  totalShowsSaved: number,
  minShowsForRateCheck: number = 10
): boolean {
  return (
    errorCount > 10 && totalShowsSaved >= minShowsForRateCheck && errorCount > totalShowsSaved * 0.1
  )
}

/**
 * Filters shows by popularity threshold for a given phase.
 */
export function filterShowsByPopularity(
  shows: Array<{ popularity?: number }>,
  phase: ImportPhase
): Array<{ popularity?: number }> {
  const threshold = PHASE_THRESHOLDS[phase]
  return shows.filter((show) => {
    const popularity = show.popularity || 0
    return popularity >= threshold.min && popularity < threshold.max
  })
}

/**
 * Processes a page of shows for the resume logic.
 * Returns the shows to include and whether the afterId was found.
 */
export function processShowsPage<T extends { id: number; popularity?: number }>(
  shows: T[],
  phase: ImportPhase,
  afterId: number | null,
  foundAfterId: boolean,
  seenIds: Set<number>,
  limit: number,
  currentCount: number
): { includedShows: T[]; foundAfterId: boolean } {
  const threshold = PHASE_THRESHOLDS[phase]
  const includedShows: T[] = []
  let found = foundAfterId

  for (const show of shows) {
    // Skip if we haven't reached our resume point yet
    if (!found) {
      if (show.id === afterId) {
        found = true
      }
      continue
    }

    // Skip already seen shows
    if (seenIds.has(show.id)) continue

    // Stop if we've already reached the limit
    if (currentCount + includedShows.length >= limit) break

    // Check popularity threshold
    const popularity = show.popularity || 0
    if (popularity >= threshold.min && popularity < threshold.max) {
      seenIds.add(show.id)
      includedShows.push(show)
    }
  }

  return { includedShows, foundAfterId: found }
}

interface ImportOptions {
  phase?: ImportPhase
  maxShows: number
  batchSize: number
  resume: boolean
  dryRun: boolean
}

const program = new Command()
  .name("import-shows")
  .description("Import TV shows with checkpointing and phase support")
  .option("-p, --phase <phase>", "Import phase: popular, standard, obscure", parsePhase)
  .option("-m, --max-shows <number>", "Maximum shows to import", parsePositiveInt, 500)
  .option("-b, --batch-size <number>", "Shows per batch before checkpoint", parsePositiveInt, 50)
  .option("-r, --resume", "Resume from last checkpoint", false)
  .option("-n, --dry-run", "Preview without writing to database", false)
  .action(async (options: ImportOptions) => {
    // Validate options
    if (options.resume && options.phase) {
      console.error("Error: Cannot specify both --resume and --phase")
      console.error("Use --resume alone to continue from last checkpoint")
      process.exit(1)
    }

    if (!options.resume && !options.phase) {
      console.error("Error: Must specify either --phase or --resume")
      process.exit(1)
    }

    await runImport(options)
  })

async function runImport(options: ImportOptions) {
  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL && !options.dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  const { phase, maxShows, batchSize, resume, dryRun } = options

  // Determine phase from resume or options
  let currentPhase: ImportPhase
  let startFromId: number | null = null
  let phaseCompleted = 0

  if (resume) {
    // Load checkpoint
    const syncState = await getSyncState(SYNC_TYPE)
    if (!syncState || !syncState.current_phase) {
      console.error("No checkpoint found. Start a new import with --phase")
      process.exit(1)
    }
    currentPhase = syncState.current_phase as ImportPhase
    startFromId = syncState.last_processed_id
    phaseCompleted = syncState.phase_completed || 0
    console.log(`\nResuming ${currentPhase} phase from show ID ${startFromId}`)
    console.log(`Already completed: ${phaseCompleted} shows`)
  } else {
    currentPhase = phase!

    // Check if a checkpoint exists for a different phase
    if (!dryRun) {
      const existingState = await getSyncState(SYNC_TYPE)
      if (existingState?.current_phase && existingState.current_phase !== currentPhase) {
        console.error(
          `\nWarning: Existing checkpoint found for '${existingState.current_phase}' phase.`
        )
        console.error(`Starting '${currentPhase}' phase will overwrite the previous checkpoint.`)
        console.error("Use --resume to continue the previous phase, or proceed to start fresh.\n")
        // Continue anyway - the user explicitly specified a new phase
      }
    }

    console.log(`\nStarting ${currentPhase} phase import`)
  }

  const threshold = PHASE_THRESHOLDS[currentPhase]
  console.log(
    `Popularity range: ${threshold.min} - ${threshold.max === Infinity ? "∞" : threshold.max}`
  )
  console.log(`Max shows: ${maxShows}, Batch size: ${batchSize}`)
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}\n`)

  try {
    // Fetch shows for this phase
    console.log("Fetching TV shows from TMDB...")
    const shows = await fetchShowsForPhase(currentPhase, maxShows, startFromId, phaseCompleted)
    console.log(`Found ${shows.length} shows to process\n`)

    if (shows.length === 0) {
      console.log("No shows to process. Phase may be complete.")
      return
    }

    // Initialize checkpoint
    if (!dryRun && !resume) {
      await updateSyncState({
        sync_type: SYNC_TYPE,
        last_sync_date: new Date().toISOString().split("T")[0],
        current_phase: currentPhase,
        phase_total: shows.length,
        phase_completed: 0,
        items_processed: 0,
        errors_count: 0,
      })
    }

    let totalShowsSaved = 0
    let totalActorAppearances = 0
    let errorCount = 0
    const currentYear = new Date().getFullYear()

    // Process shows in batches
    for (let i = 0; i < shows.length; i++) {
      const show = shows[i]
      const firstAirYear = show.first_air_date?.split("-")[0] || "?"
      const progress = `[${i + 1 + phaseCompleted}/${shows.length + phaseCompleted}]`
      console.log(`${progress} ${show.name} (${firstAirYear}) - ID: ${show.id}`)

      try {
        // Get full show details
        const details = await getTVShowDetails(show.id)
        await delay(API_CALL_DELAY_MS)

        // Get aggregate credits
        const credits = await getTVShowAggregateCredits(show.id)
        const topCast = credits.cast.slice(0, CAST_LIMIT)
        await delay(API_CALL_DELAY_MS)

        // Get person details for cast
        const personIds = topCast.map((c) => c.id)
        const personDetails = await batchGetPersonDetails(personIds, 10, 100)

        // Prepare actors for mortality calculation
        const actorsForMortality = topCast.map((castMember) => {
          const person = personDetails.get(castMember.id)
          return {
            tmdbId: castMember.id,
            name: castMember.name,
            birthday: person?.birthday || null,
            deathday: person?.deathday || null,
          }
        })

        // Calculate mortality statistics
        const firstAirYearNum = parseInt(show.first_air_date?.split("-")[0] || "0", 10)
        const mortalityStats = await calculateMovieMortality(
          firstAirYearNum,
          actorsForMortality,
          currentYear
        )

        // Prepare show record
        const showRecord: ShowRecord = {
          tmdb_id: show.id,
          name: show.name,
          first_air_date: show.first_air_date || null,
          last_air_date: details.last_air_date || null,
          poster_path: show.poster_path,
          backdrop_path: details.backdrop_path || null,
          genres: details.genres?.map((g) => g.name) || [],
          status: details.status || null,
          number_of_seasons: details.number_of_seasons || null,
          number_of_episodes: details.number_of_episodes || null,
          popularity: show.popularity || null,
          vote_average: details.vote_average || null,
          origin_country: show.origin_country || [],
          original_language: show.original_language || null,
          cast_count: topCast.length,
          deceased_count: mortalityStats.actualDeaths,
          living_count: topCast.length - mortalityStats.actualDeaths,
          expected_deaths: mortalityStats.expectedDeaths,
          mortality_surprise_score: mortalityStats.mortalitySurpriseScore,
        }

        if (!dryRun) {
          await upsertShow(showRecord)
        }
        totalShowsSaved++

        console.log(
          `  ${mortalityStats.actualDeaths} deceased, ${mortalityStats.expectedDeaths.toFixed(1)} expected`
        )

        // Prepare actor appearances
        const appearances: ShowActorAppearanceRecord[] = topCast.map((castMember, index) => {
          const person = personDetails.get(castMember.id)
          const birthday = person?.birthday
          let ageAtFilming: number | null = null

          if (birthday && firstAirYearNum) {
            const birthYear = parseInt(birthday.split("-")[0], 10)
            ageAtFilming = firstAirYearNum - birthYear
          }

          const mainRole = castMember.roles?.[0]
          const characterName = mainRole?.character || null

          return {
            actor_tmdb_id: castMember.id,
            show_tmdb_id: show.id,
            // Placeholder values - aggregate credits don't track per-episode appearances.
            // These represent "appeared in the show" rather than a specific episode.
            season_number: 1,
            episode_number: 1,
            actor_name: castMember.name,
            character_name: characterName,
            appearance_type: "regular" as const,
            billing_order: index,
            age_at_filming: ageAtFilming,
            is_deceased: !!person?.deathday,
          }
        })

        if (!dryRun) {
          await batchUpsertShowActorAppearances(appearances)
        }
        totalActorAppearances += appearances.length

        // Checkpoint after each batch
        if (!dryRun && (i + 1) % batchSize === 0) {
          await saveCheckpoint({
            phase: currentPhase,
            lastProcessedId: show.id,
            phaseCompleted: phaseCompleted + i + 1,
            itemsProcessed: totalShowsSaved,
            errorCount,
          })
          console.log(`\n💾 Checkpoint saved at show ${i + 1 + phaseCompleted}\n`)
        }

        // Rate limiting between shows
        await delay(SHOW_PROCESSING_DELAY_MS)
      } catch (error) {
        errorCount++
        console.error(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`)

        // Continue to next show on non-fatal errors
        // Abort if >10 errors AND >10% failure rate (with minimum of 10 shows processed)
        if (shouldAbortDueToErrors(errorCount, totalShowsSaved)) {
          console.error("\nToo many errors (>10% failure rate). Aborting.")
          await saveCheckpoint({
            phase: currentPhase,
            lastProcessedId: show.id,
            phaseCompleted: phaseCompleted + i,
            itemsProcessed: totalShowsSaved,
            errorCount,
          })
          process.exit(1)
        }
      }
    }

    // Final checkpoint
    if (!dryRun) {
      await saveCheckpoint({
        phase: currentPhase,
        lastProcessedId: shows[shows.length - 1]?.id || null,
        phaseCompleted: phaseCompleted + shows.length,
        itemsProcessed: totalShowsSaved,
        errorCount,
      })
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log(`${dryRun ? "DRY RUN " : ""}IMPORT COMPLETE`)
    console.log(`  Phase: ${currentPhase}`)
    console.log(`  Shows saved: ${totalShowsSaved}`)
    console.log(`  Actor appearances: ${totalActorAppearances}`)
    console.log(`  Errors: ${errorCount}`)
    console.log("=".repeat(60))
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

async function fetchShowsForPhase(
  phase: ImportPhase,
  limit: number,
  afterId: number | null,
  phaseCompleted: number = 0
): Promise<TMDBTVShow[]> {
  const threshold = PHASE_THRESHOLDS[phase]
  const shows: TMDBTVShow[] = []
  const seenIds = new Set<number>()
  let foundAfterId = afterId === null

  // Fetch more pages for lower popularity tiers
  const maxPages = phase === "popular" ? 50 : phase === "standard" ? 100 : 200

  // Calculate starting page based on how many shows we've already processed
  const startPage = afterId !== null ? calculateResumeStartPage(phase, phaseCompleted) : 1
  if (startPage > 1) {
    console.log(`Resuming from estimated page ${startPage} (based on ${phaseCompleted} shows processed)`)
  }

  for (let page = startPage; page <= maxPages && shows.length < limit; page++) {
    try {
      const response = await discoverTVShows(page)

      for (const show of response.results) {
        // Skip if we haven't reached our resume point yet
        if (!foundAfterId) {
          if (show.id === afterId) {
            foundAfterId = true
          }
          continue
        }

        // Skip already seen shows
        if (seenIds.has(show.id)) continue

        // Check popularity threshold
        const popularity = show.popularity || 0
        if (popularity >= threshold.min && popularity < threshold.max) {
          seenIds.add(show.id)
          shows.push(show)

          if (shows.length >= limit) break
        }
      }

      // Warn if we've searched many pages without finding the resume ID
      const pagesSearched = page - startPage + 1
      if (!foundAfterId && pagesSearched === RESUME_ID_SEARCH_LIMIT) {
        console.error(`\n⚠️  Warning: Resume show ID ${afterId} not found after searching pages ${startPage}-${page}.`)
        console.error("The show may have been removed from TMDB or its popularity changed.")
        console.error("Skipping resume point and continuing from current results.\n")
        foundAfterId = true // Continue without the resume point
      }

      // Stop if no more results
      if (response.results.length === 0) break

      await delay(API_CALL_DELAY_MS)
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error)
      break
    }
  }

  // Final warning if we never found the ID (happens if maxPages < RESUME_ID_SEARCH_LIMIT)
  if (!foundAfterId && afterId !== null) {
    console.error(`\n⚠️  Warning: Resume show ID ${afterId} not found in ${phase} phase results.`)
    console.error("The show may have been removed from TMDB or its popularity changed.\n")
  }

  return shows
}

interface CheckpointData {
  phase: ImportPhase
  lastProcessedId: number | null
  phaseCompleted: number
  itemsProcessed: number
  errorCount: number
}

async function saveCheckpoint(data: CheckpointData): Promise<void> {
  await updateSyncState({
    sync_type: SYNC_TYPE,
    last_sync_date: new Date().toISOString().split("T")[0],
    current_phase: data.phase,
    last_processed_id: data.lastProcessedId,
    phase_completed: data.phaseCompleted,
    items_processed: data.itemsProcessed,
    errors_count: data.errorCount,
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Only run when executed directly (not when imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
