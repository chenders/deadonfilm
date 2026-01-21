#!/usr/bin/env tsx
import newrelic from "newrelic"
/**
 * Sync script to detect newly deceased actors, movie changes, and new show episodes from TMDB.
 *
 * This script:
 * 1. Fetches person/movie changes from TMDB since last sync
 * 2. Filters to people/movies in our database
 * 3. Detects newly deceased actors and updates them in the actors table
 * 4. Recalculates mortality stats for affected movies
 * 5. Checks active TV shows for new episodes
 *
 * Usage:
 *   npm run sync:tmdb                                   # Normal sync (since last run)
 *   npm run sync:tmdb -- --days 7                       # Sync specific number of days back
 *   npm run sync:tmdb -- --start-date 2026-01-01        # Sync from specific date to today
 *   npm run sync:tmdb -- --start-date 2026-01-01 --end-date 2026-01-15  # Sync specific date range
 *   npm run sync:tmdb -- --dry-run                      # Preview changes without writing
 *   npm run sync:tmdb -- --people-only                  # Only sync people changes
 *   npm run sync:tmdb -- --movies-only                  # Only sync movie changes
 *   npm run sync:tmdb -- --shows-only                   # Only sync active TV show episodes
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db.js"
import {
  getSyncState,
  updateSyncState,
  getAllActorTmdbIds,
  getDeceasedTmdbIds,
  getAllMovieTmdbIds,
  upsertActor,
  upsertMovie,
  upsertSeason,
  upsertEpisode,
  type ActorInput,
  type MovieRecord,
  type SeasonRecord,
  type EpisodeRecord,
} from "../src/lib/db.js"
import {
  getAllChangedPersonIds,
  getAllChangedMovieIds,
  batchGetPersonDetails,
  getMovieDetails,
  getMovieCredits,
  getTVShowDetails,
  getSeasonDetails,
  type TMDBPerson,
} from "../src/lib/tmdb.js"
import { getCauseOfDeath, verifyDeathDate } from "../src/lib/wikidata.js"
import { calculateYearsLost, calculateMovieMortality } from "../src/lib/mortality-stats.js"
import { formatDate, subtractDays, getDateRanges } from "../src/lib/date-utils.js"
import {
  invalidateDeathCaches,
  invalidateMovieCaches,
  invalidateActorCacheRequired,
} from "../src/lib/cache.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"

const SYNC_TYPE_PEOPLE = "person_changes"
const SYNC_TYPE_MOVIES = "movie_changes"
const SYNC_TYPE_SHOWS = "show_episodes"

/**
 * Conditional logging helper - logs via callback if provided, otherwise to console if not quiet
 * Usage: log("message", quiet, onLog) or log("message", false) or log("message")
 */
function log(...args: unknown[]): void {
  let onLog: ((msg: string) => void) | undefined
  let quiet = false
  let messages: unknown[] = args

  // Handle different argument patterns:
  // log("message") -> messages=["message"], quiet=false, onLog=undefined
  // log("message", false) -> messages=["message"], quiet=false, onLog=undefined
  // log("message", true) -> messages=["message"], quiet=true, onLog=undefined
  // log("message", false, fn) -> messages=["message"], quiet=false, onLog=fn
  // log("message", true, fn) -> messages=["message"], quiet=true, onLog=fn

  const lastArg = args[args.length - 1]
  const secondLastArg = args.length >= 2 ? args[args.length - 2] : undefined

  // Check if last arg is a function (onLog callback)
  if (typeof lastArg === "function") {
    onLog = lastArg as (msg: string) => void
    // Check if second-to-last is boolean (quiet flag)
    if (typeof secondLastArg === "boolean") {
      quiet = secondLastArg
      messages = args.slice(0, -2)
    } else {
      messages = args.slice(0, -1)
    }
  }
  // Otherwise check if last arg is boolean (quiet flag)
  else if (typeof lastArg === "boolean") {
    quiet = lastArg
    messages = args.slice(0, -1)
  }
  // Otherwise all args are message parts
  else {
    messages = args
  }

  const message = messages.join(" ")

  if (onLog) {
    // If onLog callback provided, always use it (even in quiet mode)
    onLog(message)
  } else if (!quiet) {
    // Otherwise, only log if not quiet
    console.log(message)
  }
}

/**
 * Draw a progress bar to show completion status
 */
function drawProgressBar(current: number, total: number, width: number = 40): string {
  const percentage = Math.round((current * 100) / total)
  const filled = Math.floor((width * current) / total)
  const empty = width - filled

  const bar = "[" + "█".repeat(filled) + "░".repeat(empty) + "]"
  return `${bar} ${percentage}% (${current}/${total})`
}

export interface DeceasedActor {
  tmdbId: number
  name: string
  deathday: string
}

export interface SyncResult {
  peopleChecked: number
  newDeathsFound: number
  newlyDeceasedActors: DeceasedActor[]
  moviesChecked: number
  moviesUpdated: number
  moviesSkipped: number
  showsChecked: number
  newEpisodesFound: number
  errors: string[]
}

/**
 * Progress callback for real-time status updates during sync operations.
 * Called periodically to report current progress.
 */
export type ProgressCallback = (progress: {
  /** Current operation (e.g., "Fetching TMDB changes", "Processing movies") */
  operation: string
  /** Current item being processed (index, 0-based) */
  current: number
  /** Total items to process */
  total: number
  /** Optional details about current item (e.g., movie title, actor name) */
  currentItem?: string
}) => void

export function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("sync-tmdb")
  .description(
    "Sync with TMDB Changes API to detect newly deceased actors, movie updates, and new episodes"
  )
  .option("-d, --days <number>", "Number of days back to sync", parsePositiveInt)
  .option("--start-date <date>", "Start date (YYYY-MM-DD) - mutually exclusive with --days")
  .option("--end-date <date>", "End date (YYYY-MM-DD) - defaults to today")
  .option("-n, --dry-run", "Preview changes without writing to database")
  .option("-p, --people-only", "Only sync people changes")
  .option("-m, --movies-only", "Only sync movie changes")
  .option("-s, --shows-only", "Only sync active TV show episodes")
  .option("-q, --quiet", "Suppress detailed output (only show summary)")
  .action(
    async (options: {
      days?: number
      startDate?: string
      endDate?: string
      dryRun?: boolean
      peopleOnly?: boolean
      moviesOnly?: boolean
      showsOnly?: boolean
      quiet?: boolean
    }) => {
      // Validate mutually exclusive date options
      if (options.days && options.startDate) {
        console.error("Error: Cannot specify both --days and --start-date")
        console.error(
          "Use --days for relative lookback or --start-date/--end-date for absolute range"
        )
        process.exit(1)
      }

      if (options.endDate && !options.startDate) {
        console.error("Error: --end-date requires --start-date")
        process.exit(1)
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (options.startDate && !dateRegex.test(options.startDate)) {
        console.error("Error: --start-date must be in YYYY-MM-DD format")
        process.exit(1)
      }
      if (options.endDate && !dateRegex.test(options.endDate)) {
        console.error("Error: --end-date must be in YYYY-MM-DD format")
        process.exit(1)
      }

      // Validate mutually exclusive options
      const exclusiveCount = [options.peopleOnly, options.moviesOnly, options.showsOnly].filter(
        Boolean
      ).length
      if (exclusiveCount > 1) {
        console.error("Error: Cannot specify multiple --*-only options")
        console.error("Use one or none to sync all")
        process.exit(1)
      }

      const result = await runSync({
        days: options.days,
        startDate: options.startDate,
        endDate: options.endDate,
        dryRun: options.dryRun ?? false,
        peopleOnly: options.peopleOnly ?? false,
        moviesOnly: options.moviesOnly ?? false,
        showsOnly: options.showsOnly ?? false,
        quiet: options.quiet ?? false,
      })

      // Record New Relic custom event for sync completion
      newrelic.recordCustomEvent("TmdbSyncCompleted", {
        dryRun: options.dryRun ?? false,
        peopleOnly: options.peopleOnly ?? false,
        moviesOnly: options.moviesOnly ?? false,
        showsOnly: options.showsOnly ?? false,
        peopleChecked: result.peopleChecked,
        newDeathsFound: result.newDeathsFound,
        moviesChecked: result.moviesChecked,
        moviesUpdated: result.moviesUpdated,
        moviesSkipped: result.moviesSkipped,
        showsChecked: result.showsChecked,
        newEpisodesFound: result.newEpisodesFound,
        errorsEncountered: result.errors.length,
      })

      // Exit cleanly
      await exitAfterCompletion()
    }
  )

export interface SyncOptions {
  days?: number
  startDate?: string
  endDate?: string
  dryRun: boolean
  peopleOnly: boolean
  moviesOnly: boolean
  showsOnly: boolean
  quiet?: boolean
  /** Optional callback for real-time progress updates */
  onProgress?: ProgressCallback
  /** Optional callback for log messages (used with status bar) */
  onLog?: (message: string) => void
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  const quiet = options.quiet ?? false

  if (!quiet) {
    console.log("TMDB Changes Sync")
    console.log("=================")
    if (options.dryRun) console.log("DRY RUN MODE - no changes will be written")
    if (options.peopleOnly) console.log("People only mode")
    if (options.moviesOnly) console.log("Movies only mode")
    if (options.showsOnly) console.log("Shows only mode")
  }

  const today = formatDate(new Date())
  const result: SyncResult = {
    peopleChecked: 0,
    newDeathsFound: 0,
    newlyDeceasedActors: [],
    moviesChecked: 0,
    moviesUpdated: 0,
    moviesSkipped: 0,
    showsChecked: 0,
    newEpisodesFound: 0,
    errors: [],
  }

  try {
    // Sync people changes
    if (!options.moviesOnly && !options.showsOnly) {
      const peopleState = await getSyncState(SYNC_TYPE_PEOPLE)

      // Determine date range based on options
      let peopleStartDate: string
      let peopleEndDate: string

      if (options.startDate) {
        // Use explicit date range
        peopleStartDate = options.startDate
        peopleEndDate = options.endDate || today
      } else if (options.days) {
        // Use relative lookback
        peopleStartDate = subtractDays(today, options.days)
        peopleEndDate = today
      } else {
        // Use last sync date or default to yesterday
        peopleStartDate = peopleState?.last_sync_date || subtractDays(today, 1)
        peopleEndDate = today
      }

      const peopleResult = await syncPeopleChanges(
        peopleStartDate,
        peopleEndDate,
        options.dryRun,
        quiet,
        options.onProgress,
        options.onLog
      )
      result.peopleChecked = peopleResult.checked
      result.newDeathsFound = peopleResult.newDeaths
      result.newlyDeceasedActors.push(...peopleResult.newlyDeceasedActors)
      result.errors.push(...peopleResult.errors)

      // Update sync state
      if (!options.dryRun) {
        await updateSyncState({
          sync_type: SYNC_TYPE_PEOPLE,
          last_sync_date: today,
          items_processed: peopleResult.checked,
          new_deaths_found: peopleResult.newDeaths,
          errors_count: peopleResult.errors.length,
        })
      }
    }

    // Sync movie changes
    if (!options.peopleOnly && !options.showsOnly) {
      const movieState = await getSyncState(SYNC_TYPE_MOVIES)

      // Determine date range based on options
      let movieStartDate: string
      let movieEndDate: string

      if (options.startDate) {
        // Use explicit date range
        movieStartDate = options.startDate
        movieEndDate = options.endDate || today
      } else if (options.days) {
        // Use relative lookback
        movieStartDate = subtractDays(today, options.days)
        movieEndDate = today
      } else {
        // Use last sync date or default to yesterday
        movieStartDate = movieState?.last_sync_date || subtractDays(today, 1)
        movieEndDate = today
      }

      const movieResult = await syncMovieChanges(
        movieStartDate,
        movieEndDate,
        options.dryRun,
        quiet,
        options.onProgress,
        options.onLog
      )
      result.moviesChecked = movieResult.checked
      result.moviesUpdated = movieResult.updated
      result.moviesSkipped = movieResult.skipped
      result.errors.push(...movieResult.errors)

      // Update sync state
      if (!options.dryRun) {
        await updateSyncState({
          sync_type: SYNC_TYPE_MOVIES,
          last_sync_date: today,
          items_processed: movieResult.checked,
          movies_updated: movieResult.updated,
          errors_count: movieResult.errors.length,
        })
      }
    }

    // Sync active TV show episodes
    if (!options.peopleOnly && !options.moviesOnly) {
      const showResult = await syncActiveShowEpisodes(
        options.dryRun,
        quiet,
        options.onProgress,
        options.onLog
      )
      result.showsChecked = showResult.checked
      result.newEpisodesFound = showResult.newEpisodes
      result.errors.push(...showResult.errors)

      // Update sync state
      if (!options.dryRun) {
        await updateSyncState({
          sync_type: SYNC_TYPE_SHOWS,
          last_sync_date: today,
          items_processed: showResult.checked,
          movies_updated: showResult.newEpisodes, // Reusing field for new episodes
          errors_count: showResult.errors.length,
        })
      }
    }

    // Invalidate caches after successful sync (if not dry run)
    if (!options.dryRun) {
      if (!quiet) console.log("\n=== Syncing System State ===")
      await initRedis()

      if (result.newDeathsFound > 0) {
        if (!quiet) {
          console.log(
            `Invalidating death-related caches (${result.newDeathsFound} new deaths found)...`
          )
        }
        await invalidateDeathCaches()
        if (!quiet) {
          console.log("  ✓ Death list caches cleared")
          console.log("  ✓ Death statistics caches cleared")
        }

        // Record cache invalidation event
        newrelic.recordCustomEvent("CacheInvalidation", {
          cacheType: "death-related",
          count: result.newDeathsFound,
        })
      }

      if (result.moviesUpdated > 0) {
        if (!quiet) {
          console.log(`Invalidating movie caches (${result.moviesUpdated} movies updated)...`)
        }
        await invalidateMovieCaches()
        if (!quiet) {
          console.log("  ✓ Movie list caches cleared")
          console.log("  ✓ Movie statistics caches cleared")
        }

        // Record cache invalidation event
        newrelic.recordCustomEvent("CacheInvalidation", {
          cacheType: "movie-related",
          count: result.moviesUpdated,
        })
      }

      if (result.moviesSkipped > 0 && !quiet) {
        console.log(`  → ${result.moviesSkipped} movies skipped (no cache invalidation needed)`)
      }

      await closeRedis()
      if (!quiet) console.log("System state synchronized")
    }

    // Print summary (skip if quiet mode)
    if (!quiet) {
      console.log("\n" + "=".repeat(60))
      console.log("SYNC SUMMARY")
      console.log("=".repeat(60))

      if (!options.moviesOnly && !options.showsOnly) {
        console.log(`\nPeople:`)
        console.log(`  - Checked: ${result.peopleChecked.toLocaleString()}`)
        console.log(
          `  - New deaths found: ${result.newDeathsFound.toLocaleString()}${result.newDeathsFound > 0 ? " ✓" : ""}`
        )
      }

      if (!options.peopleOnly && !options.showsOnly) {
        console.log(`\nMovies:`)
        console.log(`  - Checked: ${result.moviesChecked.toLocaleString()}`)
        console.log(
          `  - Updated: ${result.moviesUpdated.toLocaleString()}${result.moviesUpdated > 0 ? " ✓" : ""}`
        )
        if (result.moviesSkipped > 0) {
          console.log(`  - Skipped: ${result.moviesSkipped.toLocaleString()} (no changes detected)`)
        }
      }

      if (!options.peopleOnly && !options.moviesOnly) {
        console.log(`\nTV Shows:`)
        console.log(`  - Checked: ${result.showsChecked.toLocaleString()}`)
        console.log(
          `  - New episodes found: ${result.newEpisodesFound.toLocaleString()}${result.newEpisodesFound > 0 ? " ✓" : ""}`
        )
      }

      if (result.errors.length > 0) {
        console.log(`\nErrors: ${result.errors.length}`)
      } else {
        console.log(`\nErrors: 0`)
      }

      console.log("=".repeat(60))

      if (result.errors.length > 0) {
        console.log("\nErrors encountered:")
        for (const error of result.errors) {
          console.log(`  - ${error}`)
        }
      }
    }

    if (!quiet) console.log("\nDone!")
    return result
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

// Exit cleanly after completion
async function exitAfterCompletion() {
  // Close database pool before exiting
  const pool = getPool()
  await pool.end()
  // Give time for any pending async operations to complete
  await new Promise((resolve) => setTimeout(resolve, 100))
  process.exit(0)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Normalize a value for comparison and display
 * Handles dates, string numbers, etc.
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value

  // Normalize dates - extract just the date portion (YYYY-MM-DD)
  if (value instanceof Date || (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}/))) {
    const dateStr = value instanceof Date ? value.toISOString() : value
    return dateStr.substring(0, 10) // Extract YYYY-MM-DD
  }

  // Coerce string numbers to actual numbers for comparison
  if (typeof value === "string") {
    const num = parseFloat(value)
    if (!isNaN(num) && value.trim() !== "") {
      return num
    }
  }

  return value
}

/**
 * Format a value for display in logs
 */
function formatValue(value: unknown): string {
  const normalized = normalizeValue(value)

  if (normalized === null) return "null"
  if (normalized === undefined) return "undefined"
  if (typeof normalized === "string") return `"${normalized}"`
  if (typeof normalized === "number") {
    // Format numbers with up to 2 decimal places if they have decimals
    return Number.isInteger(normalized) ? normalized.toString() : normalized.toFixed(2)
  }
  if (typeof normalized === "boolean") return normalized.toString()
  if (Array.isArray(normalized)) {
    if (normalized.length === 0) return "[]"
    if (normalized.length <= 3) return `[${normalized.join(", ")}]`
    return `[${normalized.slice(0, 3).join(", ")}, ... (${normalized.length} items)]`
  }
  return JSON.stringify(normalized)
}

const CAST_LIMIT = 30

interface FieldChange {
  field: string
  oldValue: unknown
  newValue: unknown
}

// Helper to update a movie's mortality stats - used by both people and movie sync
async function updateMovieMortalityStats(
  movieId: number,
  currentYear: number,
  dryRun: boolean
): Promise<{
  updated: boolean
  skipped: boolean
  title?: string
  error?: string
  changedFields?: string[]
  fieldChanges?: FieldChange[]
}> {
  try {
    const pool = getPool()

    // Fetch existing movie record to compare changes
    const { rows: existingRows } = await pool.query<MovieRecord>(
      `SELECT * FROM movies WHERE tmdb_id = $1`,
      [movieId]
    )
    const existingMovie = existingRows[0] || null

    const [details, credits] = await Promise.all([
      getMovieDetails(movieId),
      getMovieCredits(movieId),
    ])

    const topCast = credits.cast.slice(0, CAST_LIMIT)
    const personIds = topCast.map((c) => c.id)
    const personDetails = await batchGetPersonDetails(personIds, 10, 100)

    const releaseYear = details.release_date ? parseInt(details.release_date.split("-")[0]) : null

    if (!releaseYear) {
      return { updated: false, skipped: false }
    }

    const actorsForMortality = topCast.map((castMember) => {
      const person = personDetails.get(castMember.id)
      return {
        tmdbId: castMember.id,
        name: castMember.name,
        birthday: person?.birthday || null,
        deathday: person?.deathday || null,
      }
    })

    const mortalityStats = await calculateMovieMortality(
      releaseYear,
      actorsForMortality,
      currentYear
    )

    const newRecord: MovieRecord = {
      tmdb_id: movieId,
      title: details.title,
      release_date: details.release_date || null,
      release_year: releaseYear,
      poster_path: details.poster_path,
      genres: details.genres?.map((g) => g.name) || [],
      original_language: details.original_language || null,
      production_countries: details.production_countries?.map((c) => c.iso_3166_1) ?? null,
      popularity: details.popularity || null,
      vote_average: details.vote_average || null,
      cast_count: topCast.length,
      deceased_count: mortalityStats.actualDeaths,
      living_count: topCast.length - mortalityStats.actualDeaths,
      expected_deaths: mortalityStats.expectedDeaths,
      mortality_surprise_score: mortalityStats.mortalitySurpriseScore,
    }

    // Track what fields changed (for logging)
    const changedFields: string[] = []
    const fieldChanges: FieldChange[] = []

    // If movie exists, compare to see what changed
    if (existingMovie) {
      // Check all fields for changes
      for (const field of Object.keys(newRecord) as Array<keyof MovieRecord>) {
        if (field === "tmdb_id") continue // Skip ID field

        const oldValue = existingMovie[field]
        const newValue = newRecord[field]

        // Normalize both values for comparison
        const normalizedOld = normalizeValue(oldValue)
        const normalizedNew = normalizeValue(newValue)

        let hasChanged = false

        // Handle array comparison
        if (Array.isArray(normalizedOld) && Array.isArray(normalizedNew)) {
          if (JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew)) {
            hasChanged = true
          }
        }
        // Handle number comparison (with tolerance matching display precision)
        else if (typeof normalizedOld === "number" && typeof normalizedNew === "number") {
          // Use 0.01 tolerance to match 2 decimal place display precision
          if (Math.abs(normalizedOld - normalizedNew) > 0.01) {
            hasChanged = true
          }
        }
        // Handle other comparisons
        else if (normalizedOld !== normalizedNew) {
          hasChanged = true
        }

        if (hasChanged) {
          changedFields.push(field)
          // Store normalized values for display
          fieldChanges.push({ field, oldValue: normalizedOld, newValue: normalizedNew })
        }
      }

      // If nothing changed, skip the update
      if (changedFields.length === 0) {
        return {
          updated: false,
          skipped: true,
          title: `${details.title} (${releaseYear})`,
          changedFields: [],
          fieldChanges: [],
        }
      }
    }

    // Update the movie
    if (!dryRun) {
      await upsertMovie(newRecord)
    }

    return {
      updated: true,
      skipped: false,
      title: `${details.title} (${releaseYear})`,
      changedFields: existingMovie ? changedFields : undefined,
      fieldChanges: existingMovie ? fieldChanges : undefined,
    }
  } catch (error) {
    return {
      updated: false,
      skipped: false,
      error: `Error updating movie ${movieId}: ${error}`,
    }
  }
}

async function syncPeopleChanges(
  startDate: string,
  endDate: string,
  dryRun: boolean,
  quiet: boolean = false,
  onProgress?: ProgressCallback,
  onLog?: (message: string) => void
): Promise<{
  checked: number
  newDeaths: number
  newlyDeceasedActors: DeceasedActor[]
  errors: string[]
}> {
  log(`\n=== Syncing People Changes (${startDate} to ${endDate}) ===\n`, quiet, onLog)

  const errors: string[] = []

  // Get all actors in our database and all deceased person IDs
  log("Loading actor IDs from database...", quiet, onLog)
  const [actorTmdbIds, deceasedTmdbIds] = await Promise.all([
    getAllActorTmdbIds(),
    getDeceasedTmdbIds(),
  ])
  log(`  Found ${actorTmdbIds.size} actors in actor_appearances`, quiet, onLog)
  log(`  Found ${deceasedTmdbIds.size} deceased actors`, quiet, onLog)

  // Split into date ranges if needed (max 14 days per query)
  const dateRanges = getDateRanges(startDate, endDate)
  log(`  Querying ${dateRanges.length} date range(s)`, quiet, onLog)

  // Fetch all changed person IDs from TMDB
  const allChangedIds: number[] = []
  for (let i = 0; i < dateRanges.length; i++) {
    const range = dateRanges[i]
    onProgress?.({
      operation: "Fetching people changes",
      current: i,
      total: dateRanges.length,
    })
    log(`  Fetching changes for ${range.start} to ${range.end}...`, quiet, onLog)
    const ids = await getAllChangedPersonIds(range.start, range.end)
    allChangedIds.push(...ids)
    await delay(100)
  }

  // Deduplicate
  const changedIds = [...new Set(allChangedIds)]
  log(`\nFound ${changedIds.length} unique changed person IDs on TMDB`, quiet, onLog)

  // Filter to people we care about (in our database)
  const relevantIds = changedIds.filter((id) => actorTmdbIds.has(id))
  log(`  ${relevantIds.length} are in our actor_appearances table`, quiet, onLog)

  if (relevantIds.length === 0) {
    log("\nNo relevant people changes found.", quiet, onLog)
    return { checked: 0, newDeaths: 0, newlyDeceasedActors: [], errors }
  }

  // Fetch person details from TMDB
  log("\nFetching person details from TMDB...", quiet, onLog)
  const personDetails = await batchGetPersonDetails(relevantIds, 10, 100)
  log(`  Got details for ${personDetails.size} people`, quiet, onLog)

  // Process each person
  let newDeaths = 0
  const newlyDeceasedIds: number[] = []
  const newlyDeceasedActors: DeceasedActor[] = []
  const totalPeople = personDetails.size
  let processedCount = 0

  log("\nProcessing people...", quiet, onLog)
  for (const [tmdbId, person] of personDetails) {
    onProgress?.({
      operation: "Processing people",
      current: processedCount,
      total: totalPeople,
      currentItem: person.name,
    })
    processedCount++
    const wasAlreadyDeceased = deceasedTmdbIds.has(tmdbId)

    if (person.deathday && !wasAlreadyDeceased) {
      // NEW DEATH DETECTED!
      log(`  [NEW DEATH] ${person.name} (${person.deathday})`, quiet, onLog)
      newlyDeceasedIds.push(tmdbId)
      newlyDeceasedActors.push({
        tmdbId: tmdbId,
        name: person.name,
        deathday: person.deathday,
      })

      if (!dryRun) {
        try {
          await processNewDeath(person)
          newDeaths++

          // Record New Relic event for new death detection
          newrelic.recordCustomEvent("NewDeathDetected", {
            actorName: person.name,
            tmdbId: tmdbId,
            deathday: person.deathday,
          })
        } catch (error) {
          const errorMsg = `Error processing ${person.name}: ${error}`
          console.error(`    ${errorMsg}`)
          errors.push(errorMsg)

          // Record error event
          newrelic.recordCustomEvent("NewDeathProcessingError", {
            actorName: person.name,
            tmdbId: tmdbId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      } else {
        newDeaths++
      }

      // Note: Claude rate limiting is handled internally by claude.ts
      // This delay is only for general pacing between person processing
      await delay(50)
    } else if (wasAlreadyDeceased) {
      // Existing deceased person - no updates needed for now
      // Future: could update profile_path if changed
    }

    // Show progress every 50 people or at completion
    if (!quiet && (processedCount % 50 === 0 || processedCount === totalPeople)) {
      const progressBar = drawProgressBar(processedCount, totalPeople)
      console.log(`  ${progressBar}`)
    }
  }

  // Post-processing for newly deceased actors
  if (!dryRun && newlyDeceasedIds.length > 0) {
    // Invalidate individual actor caches
    log(`\n=== Invalidating Actor Caches ===`, quiet, onLog)
    log(
      `Clearing individual actor profile caches for ${newlyDeceasedIds.length} newly deceased actors...`,
      quiet
    )
    await initRedis()
    let successCount = 0
    for (const tmdbId of newlyDeceasedIds) {
      try {
        await invalidateActorCacheRequired(tmdbId)
        successCount++
      } catch (error) {
        console.error(`  ✗ Error invalidating cache for actor ${tmdbId}: ${error}`)
      }
    }
    await closeRedis()
    log(`  ✓ Cleared ${successCount} actor profile caches`, quiet, onLog)

    // Recalculate mortality stats for movies
    log(`\n=== Updating Movie Mortality Statistics ===`, quiet, onLog)
    log(`Finding movies featuring ${newlyDeceasedIds.length} newly deceased actors...`, quiet)
    const pool = getPool()
    const { rows: affectedMovies } = await pool.query<{ movie_tmdb_id: number }>(
      `SELECT DISTINCT ama.movie_tmdb_id
       FROM actor_movie_appearances ama
       JOIN actors a ON ama.actor_id = a.id
       WHERE a.tmdb_id = ANY($1)`,
      [newlyDeceasedIds]
    )
    log(`  Found ${affectedMovies.length} movies requiring mortality stats update`, quiet)

    const currentYear = new Date().getFullYear()
    const totalMovies = affectedMovies.length
    let processedMovies = 0

    for (const { movie_tmdb_id: movieId } of affectedMovies) {
      processedMovies++
      const result = await updateMovieMortalityStats(movieId, currentYear, false)
      if (result.error) {
        console.error(`    ${result.error}`)
        errors.push(result.error)
      } else if (result.updated && result.title) {
        log(`    Updated: ${result.title}`, quiet)
      }

      // Show progress every 10 movies or at completion
      if (!quiet && (processedMovies % 10 === 0 || processedMovies === totalMovies)) {
        const progressBar = drawProgressBar(processedMovies, totalMovies)
        console.log(`    ${progressBar}`)
      }

      await delay(250)
    }

    log(`  ✓ Updated mortality stats for ${processedMovies} movies`, quiet)
  }

  return { checked: relevantIds.length, newDeaths, newlyDeceasedActors, errors }
}

async function processNewDeath(person: TMDBPerson): Promise<void> {
  const birthYear = person.birthday ? new Date(person.birthday).getFullYear() : null

  // Verify death date against Wikidata before storing
  const deathVerification = await verifyDeathDate(person.name, birthYear, person.deathday!)

  if (!deathVerification.verified) {
    if (deathVerification.confidence === "conflicting") {
      console.log(`  [CONFLICTING] ${person.name}: ${deathVerification.conflictDetails}`)
    } else {
      console.log(`  [UNVERIFIED] ${person.name}: No Wikidata record found to verify death date`)
    }
  }

  // Look up cause of death using Opus 4.5
  const {
    causeOfDeath,
    causeOfDeathSource,
    causeOfDeathDetails,
    causeOfDeathDetailsSource,
    wikipediaUrl,
  } = await getCauseOfDeath(person.name, person.birthday, person.deathday!, "opus")

  // Calculate mortality stats
  const yearsLostResult = await calculateYearsLost(person.birthday, person.deathday!)

  // Create actor record with death date verification info
  const record: ActorInput = {
    tmdb_id: person.id,
    name: person.name,
    birthday: person.birthday,
    deathday: person.deathday!,
    cause_of_death: causeOfDeath,
    cause_of_death_source: causeOfDeathSource,
    cause_of_death_details: causeOfDeathDetails,
    cause_of_death_details_source: causeOfDeathDetailsSource,
    wikipedia_url: wikipediaUrl,
    profile_path: person.profile_path,
    age_at_death: yearsLostResult?.ageAtDeath ?? null,
    expected_lifespan: yearsLostResult?.expectedLifespan ?? null,
    years_lost: yearsLostResult?.yearsLost ?? null,
    // Death date verification fields
    deathday_confidence: deathVerification.confidence,
    deathday_verification_source: deathVerification.wikidataDeathDate ? "wikidata" : null,
    deathday_verified_at: new Date().toISOString(),
  }

  await upsertActor(record)

  if (causeOfDeath) {
    console.log(`    -> ${causeOfDeath} (${causeOfDeathSource})`)
  } else {
    console.log(`    -> (cause unknown)`)
  }
}

async function syncMovieChanges(
  startDate: string,
  endDate: string,
  dryRun: boolean,
  quiet: boolean = false,
  onProgress?: ProgressCallback,
  onLog?: (message: string) => void
): Promise<{ checked: number; updated: number; skipped: number; errors: string[] }> {
  log(`\n=== Syncing Movie Changes (${startDate} to ${endDate}) ===\n`, quiet, onLog)

  const errors: string[] = []
  const currentYear = new Date().getFullYear()

  // Get all movies in our database
  log("Loading movie IDs from database...", quiet, onLog)
  const movieTmdbIds = await getAllMovieTmdbIds()
  log(`  Found ${movieTmdbIds.size} movies in database`, quiet, onLog)

  // Split into date ranges if needed (max 14 days per query)
  const dateRanges = getDateRanges(startDate, endDate)
  log(`  Querying ${dateRanges.length} date range(s)`, quiet, onLog)

  // Fetch all changed movie IDs from TMDB
  const allChangedIds: number[] = []
  for (let i = 0; i < dateRanges.length; i++) {
    const range = dateRanges[i]
    onProgress?.({
      operation: "Fetching movie changes",
      current: i,
      total: dateRanges.length,
    })
    log(`  Fetching changes for ${range.start} to ${range.end}...`, quiet, onLog)
    const ids = await getAllChangedMovieIds(range.start, range.end)
    allChangedIds.push(...ids)
    await delay(100)
  }

  // Deduplicate
  const changedIds = [...new Set(allChangedIds)]
  log(`\nFound ${changedIds.length} unique changed movie IDs on TMDB`, quiet, onLog)

  // Filter to movies we care about (in our database)
  const relevantIds = changedIds.filter((id) => movieTmdbIds.has(id))
  log(`  ${relevantIds.length} are in our movies table`, quiet, onLog)

  if (relevantIds.length === 0) {
    log("\nNo relevant movie changes found.", quiet, onLog)
    return { checked: 0, updated: 0, skipped: 0, errors }
  }

  // Process each movie
  let updated = 0
  let skipped = 0
  const totalMovies = relevantIds.length
  let processedCount = 0

  log("\nProcessing movies...", quiet, onLog)
  for (const movieId of relevantIds) {
    onProgress?.({
      operation: "Processing movies",
      current: processedCount,
      total: totalMovies,
      currentItem: `Movie ${movieId}`,
    })
    processedCount++

    const result = await updateMovieMortalityStats(movieId, currentYear, dryRun)
    if (result.error) {
      log(`    ${result.error}`, quiet, onLog)
      errors.push(result.error)
    } else if (result.skipped && result.title) {
      skipped++
      // Only skip when there are no changes at all - worth logging since it's unusual
      log(`    Skipped: ${result.title} (no changes detected)`, quiet, onLog)
    } else if (result.updated && result.title) {
      updated++
      const prefix = dryRun ? "Would update" : "Updated"
      log(`    ${prefix}: ${result.title}`, quiet, onLog)

      // Show detailed field changes if available (only show if formatted values differ)
      if (result.fieldChanges && result.fieldChanges.length > 0) {
        for (const change of result.fieldChanges) {
          const oldVal = formatValue(change.oldValue)
          const newVal = formatValue(change.newValue)
          // Only log if the formatted values actually differ
          if (oldVal !== newVal) {
            log(`      - ${change.field} (${oldVal} -> ${newVal})`, quiet, onLog)
          }
        }
      }
    }

    await delay(250)
  }

  return { checked: relevantIds.length, updated, skipped, errors }
}

interface ActiveShow {
  tmdb_id: number
  name: string
  number_of_seasons: number | null
}

interface ExistingEpisode {
  season_number: number
  episode_number: number
}

async function syncActiveShowEpisodes(
  dryRun: boolean,
  quiet: boolean = false,
  onProgress?: ProgressCallback,
  onLog?: (message: string) => void
): Promise<{ checked: number; newEpisodes: number; errors: string[] }> {
  log("\n=== Syncing Active TV Show Episodes ===\n", quiet, onLog)

  const errors: string[] = []
  const pool = getPool()

  // Get all active (Returning Series) shows from our database
  log("Loading active shows from database...", quiet, onLog)
  const { rows: activeShows } = await pool.query<ActiveShow>(
    `SELECT tmdb_id, name, number_of_seasons FROM shows WHERE status = 'Returning Series' ORDER BY popularity DESC NULLS LAST`
  )
  log(`  Found ${activeShows.length} active shows`, quiet, onLog)

  if (activeShows.length === 0) {
    log("\nNo active shows to sync.", quiet, onLog)
    return { checked: 0, newEpisodes: 0, errors }
  }

  let totalNewEpisodes = 0
  let showsChecked = 0
  const totalShows = activeShows.length

  log("\nProcessing shows...", quiet, onLog)
  for (const show of activeShows) {
    onProgress?.({
      operation: "Processing shows",
      current: showsChecked,
      total: totalShows,
      currentItem: show.name,
    })
    try {
      // Get current show details from TMDB
      const showDetails = await getTVShowDetails(show.tmdb_id)
      await delay(50)

      // Get existing episodes from our database
      const { rows: existingEpisodes } = await pool.query<ExistingEpisode>(
        `SELECT season_number, episode_number FROM episodes WHERE show_tmdb_id = $1`,
        [show.tmdb_id]
      )
      const existingSet = new Set(
        existingEpisodes.map((e) => `${e.season_number}-${e.episode_number}`)
      )

      // Check each season for new episodes
      for (const seasonSummary of showDetails.seasons) {
        // Skip specials (season 0)
        if (seasonSummary.season_number === 0) continue

        try {
          const seasonDetails = await getSeasonDetails(show.tmdb_id, seasonSummary.season_number)
          await delay(50)

          // Check for new episodes
          for (const ep of seasonDetails.episodes) {
            const key = `${ep.season_number}-${ep.episode_number}`
            if (!existingSet.has(key)) {
              // New episode found!
              log(
                `    NEW: ${show.name} - S${ep.season_number}E${ep.episode_number} - ${ep.name}`,
                quiet,
                onLog
              )

              if (!dryRun) {
                // Upsert season first (in case it's also new)
                const seasonRecord: SeasonRecord = {
                  show_tmdb_id: show.tmdb_id,
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
                await upsertSeason(seasonRecord)

                // Upsert episode
                const episodeRecord: EpisodeRecord = {
                  show_tmdb_id: show.tmdb_id,
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
                await upsertEpisode(episodeRecord)
              }

              totalNewEpisodes++
            }
          }
        } catch (seasonError) {
          const errorMsg = `Error fetching season ${seasonSummary.season_number} for ${show.name}: ${seasonError}`
          console.error(`    ${errorMsg}`)
          errors.push(errorMsg)
        }
      }

      showsChecked++

      // Show progress every 5 shows or at completion
      if (!quiet && (showsChecked % 5 === 0 || showsChecked === totalShows)) {
        log(drawProgressBar(showsChecked, totalShows), quiet, onLog)
      }

      // Delay between shows
      await delay(100)
    } catch (showError) {
      const errorMsg = `Error processing show ${show.name}: ${showError}`
      console.error(`    ${errorMsg}`)
      errors.push(errorMsg)
    }
  }

  console.log(`\nChecked ${showsChecked} shows, found ${totalNewEpisodes} new episodes`)

  return { checked: showsChecked, newEpisodes: totalNewEpisodes, errors }
}

// Only run if executed directly, not when imported for testing
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
