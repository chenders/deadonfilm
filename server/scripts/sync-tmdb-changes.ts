#!/usr/bin/env tsx
/**
 * Sync script to detect newly deceased actors and movie changes from TMDB Changes API.
 *
 * This script:
 * 1. Fetches person/movie changes from TMDB since last sync
 * 2. Filters to people/movies in our database
 * 3. Detects newly deceased actors and adds them to deceased_persons
 * 4. Updates actor_appearances.is_deceased flags
 * 5. Recalculates mortality stats for affected movies
 *
 * Usage:
 *   npm run sync:tmdb                    # Normal sync (since last run)
 *   npm run sync:tmdb -- --days 7        # Sync specific number of days back
 *   npm run sync:tmdb -- --dry-run       # Preview changes without writing
 *   npm run sync:tmdb -- --people-only   # Only sync people changes
 *   npm run sync:tmdb -- --movies-only   # Only sync movie changes
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
  markActorsDeceased,
  upsertActor,
  upsertMovie,
  type ActorInput,
  type MovieRecord,
} from "../src/lib/db.js"
import {
  getAllChangedPersonIds,
  getAllChangedMovieIds,
  batchGetPersonDetails,
  getMovieDetails,
  getMovieCredits,
  type TMDBPerson,
} from "../src/lib/tmdb.js"
import { getCauseOfDeath } from "../src/lib/wikidata.js"
import { calculateYearsLost, calculateMovieMortality } from "../src/lib/mortality-stats.js"
import { formatDate, subtractDays, getDateRanges } from "../src/lib/date-utils.js"

const SYNC_TYPE_PEOPLE = "person_changes"
const SYNC_TYPE_MOVIES = "movie_changes"

interface SyncResult {
  peopleChecked: number
  newDeathsFound: number
  moviesChecked: number
  moviesUpdated: number
  errors: string[]
}

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("sync-tmdb")
  .description("Sync with TMDB Changes API to detect newly deceased actors and movie updates")
  .option("-d, --days <number>", "Number of days back to sync", parsePositiveInt)
  .option("-n, --dry-run", "Preview changes without writing to database")
  .option("-p, --people-only", "Only sync people changes")
  .option("-m, --movies-only", "Only sync movie changes")
  .action(
    async (options: {
      days?: number
      dryRun?: boolean
      peopleOnly?: boolean
      moviesOnly?: boolean
    }) => {
      // Validate mutually exclusive options
      if (options.peopleOnly && options.moviesOnly) {
        console.error("Error: Cannot specify both --people-only and --movies-only")
        console.error("Use one or the other, or neither to sync both")
        process.exit(1)
      }

      await runSync({
        days: options.days,
        dryRun: options.dryRun ?? false,
        peopleOnly: options.peopleOnly ?? false,
        moviesOnly: options.moviesOnly ?? false,
      })
    }
  )

interface SyncOptions {
  days?: number
  dryRun: boolean
  peopleOnly: boolean
  moviesOnly: boolean
}

async function runSync(options: SyncOptions): Promise<void> {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  console.log("TMDB Changes Sync")
  console.log("=================")
  if (options.dryRun) console.log("DRY RUN MODE - no changes will be written")
  if (options.peopleOnly) console.log("People only mode")
  if (options.moviesOnly) console.log("Movies only mode")

  const today = formatDate(new Date())
  const result: SyncResult = {
    peopleChecked: 0,
    newDeathsFound: 0,
    moviesChecked: 0,
    moviesUpdated: 0,
    errors: [],
  }

  try {
    // Sync people changes
    if (!options.moviesOnly) {
      const peopleState = await getSyncState(SYNC_TYPE_PEOPLE)
      const peopleStartDate = options.days
        ? subtractDays(today, options.days)
        : peopleState?.last_sync_date || subtractDays(today, 1)

      const peopleResult = await syncPeopleChanges(peopleStartDate, today, options.dryRun)
      result.peopleChecked = peopleResult.checked
      result.newDeathsFound = peopleResult.newDeaths
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
    if (!options.peopleOnly) {
      const movieState = await getSyncState(SYNC_TYPE_MOVIES)
      const movieStartDate = options.days
        ? subtractDays(today, options.days)
        : movieState?.last_sync_date || subtractDays(today, 1)

      const movieResult = await syncMovieChanges(movieStartDate, today, options.dryRun)
      result.moviesChecked = movieResult.checked
      result.moviesUpdated = movieResult.updated
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

    // Print summary
    console.log("\n=== Sync Summary ===")
    console.log(`People checked: ${result.peopleChecked}`)
    console.log(`New deaths found: ${result.newDeathsFound}`)
    console.log(`Movies checked: ${result.moviesChecked}`)
    console.log(`Movies updated: ${result.moviesUpdated}`)
    console.log(`Errors: ${result.errors.length}`)

    if (result.errors.length > 0) {
      console.log("\nErrors encountered:")
      for (const error of result.errors) {
        console.log(`  - ${error}`)
      }
    }

    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    const pool = getPool()
    await pool.end()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const CAST_LIMIT = 30

// Helper to update a movie's mortality stats - used by both people and movie sync
async function updateMovieMortalityStats(
  movieId: number,
  currentYear: number,
  dryRun: boolean
): Promise<{ updated: boolean; title?: string; error?: string }> {
  try {
    const [details, credits] = await Promise.all([
      getMovieDetails(movieId),
      getMovieCredits(movieId),
    ])

    const topCast = credits.cast.slice(0, CAST_LIMIT)
    const personIds = topCast.map((c) => c.id)
    const personDetails = await batchGetPersonDetails(personIds, 10, 100)

    const releaseYear = details.release_date ? parseInt(details.release_date.split("-")[0]) : null

    if (!releaseYear) {
      return { updated: false }
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

    if (!dryRun) {
      const movieRecord: MovieRecord = {
        tmdb_id: movieId,
        title: details.title,
        release_date: details.release_date || null,
        release_year: releaseYear,
        poster_path: details.poster_path,
        genres: details.genres?.map((g) => g.name) || [],
        original_language: details.original_language || null,
        popularity: details.popularity || null,
        vote_average: details.vote_average || null,
        cast_count: topCast.length,
        deceased_count: mortalityStats.actualDeaths,
        living_count: topCast.length - mortalityStats.actualDeaths,
        expected_deaths: mortalityStats.expectedDeaths,
        mortality_surprise_score: mortalityStats.mortalitySurpriseScore,
      }

      await upsertMovie(movieRecord)
    }

    return { updated: true, title: `${details.title} (${releaseYear})` }
  } catch (error) {
    return { updated: false, error: `Error updating movie ${movieId}: ${error}` }
  }
}

async function syncPeopleChanges(
  startDate: string,
  endDate: string,
  dryRun: boolean
): Promise<{ checked: number; newDeaths: number; errors: string[] }> {
  console.log(`\n=== Syncing People Changes (${startDate} to ${endDate}) ===\n`)

  const errors: string[] = []

  // Get all actors in our database and all deceased person IDs
  console.log("Loading actor IDs from database...")
  const [actorTmdbIds, deceasedTmdbIds] = await Promise.all([
    getAllActorTmdbIds(),
    getDeceasedTmdbIds(),
  ])
  console.log(`  Found ${actorTmdbIds.size} actors in actor_appearances`)
  console.log(`  Found ${deceasedTmdbIds.size} actors in deceased_persons`)

  // Split into date ranges if needed (max 14 days per query)
  const dateRanges = getDateRanges(startDate, endDate)
  console.log(`  Querying ${dateRanges.length} date range(s)`)

  // Fetch all changed person IDs from TMDB
  const allChangedIds: number[] = []
  for (const range of dateRanges) {
    console.log(`  Fetching changes for ${range.start} to ${range.end}...`)
    const ids = await getAllChangedPersonIds(range.start, range.end)
    allChangedIds.push(...ids)
    await delay(100)
  }

  // Deduplicate
  const changedIds = [...new Set(allChangedIds)]
  console.log(`\nFound ${changedIds.length} unique changed person IDs on TMDB`)

  // Filter to people we care about (in our database)
  const relevantIds = changedIds.filter((id) => actorTmdbIds.has(id))
  console.log(`  ${relevantIds.length} are in our actor_appearances table`)

  if (relevantIds.length === 0) {
    console.log("\nNo relevant people changes found.")
    return { checked: 0, newDeaths: 0, errors }
  }

  // Fetch person details from TMDB
  console.log("\nFetching person details from TMDB...")
  const personDetails = await batchGetPersonDetails(relevantIds, 10, 100)
  console.log(`  Got details for ${personDetails.size} people`)

  // Process each person
  let newDeaths = 0
  const newlyDeceasedIds: number[] = []

  console.log("\nProcessing people...")
  for (const [tmdbId, person] of personDetails) {
    const wasAlreadyDeceased = deceasedTmdbIds.has(tmdbId)

    if (person.deathday && !wasAlreadyDeceased) {
      // NEW DEATH DETECTED!
      console.log(`  [NEW DEATH] ${person.name} (${person.deathday})`)
      newlyDeceasedIds.push(tmdbId)

      if (!dryRun) {
        try {
          await processNewDeath(person)
          newDeaths++
        } catch (error) {
          const errorMsg = `Error processing ${person.name}: ${error}`
          console.error(`    ${errorMsg}`)
          errors.push(errorMsg)
        }
      } else {
        newDeaths++
      }

      await delay(200)
    } else if (wasAlreadyDeceased) {
      // Existing deceased person - no updates needed for now
      // Future: could update profile_path if changed
    }
  }

  // Mark newly deceased actors in actor_appearances
  if (!dryRun && newlyDeceasedIds.length > 0) {
    console.log(`\nMarking ${newlyDeceasedIds.length} actors as deceased in actor_appearances...`)
    await markActorsDeceased(newlyDeceasedIds)

    // Recalculate mortality stats for movies featuring newly deceased actors
    console.log(`\nRecalculating mortality stats for affected movies...`)
    const pool = getPool()
    const { rows: affectedMovies } = await pool.query<{ movie_tmdb_id: number }>(
      `SELECT DISTINCT movie_tmdb_id FROM actor_appearances WHERE actor_tmdb_id = ANY($1)`,
      [newlyDeceasedIds]
    )
    console.log(`  Found ${affectedMovies.length} affected movies`)

    const currentYear = new Date().getFullYear()
    for (const { movie_tmdb_id: movieId } of affectedMovies) {
      const result = await updateMovieMortalityStats(movieId, currentYear, false)
      if (result.error) {
        console.error(`    ${result.error}`)
        errors.push(result.error)
      } else if (result.updated && result.title) {
        console.log(`    Updated: ${result.title}`)
      }
      await delay(250)
    }
  }

  return { checked: relevantIds.length, newDeaths, errors }
}

async function processNewDeath(person: TMDBPerson): Promise<void> {
  // Look up cause of death
  const {
    causeOfDeath,
    causeOfDeathSource,
    causeOfDeathDetails,
    causeOfDeathDetailsSource,
    wikipediaUrl,
  } = await getCauseOfDeath(person.name, person.birthday, person.deathday!)

  // Calculate mortality stats
  const yearsLostResult = await calculateYearsLost(person.birthday, person.deathday!)

  // Create actor record
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
  dryRun: boolean
): Promise<{ checked: number; updated: number; errors: string[] }> {
  console.log(`\n=== Syncing Movie Changes (${startDate} to ${endDate}) ===\n`)

  const errors: string[] = []
  const currentYear = new Date().getFullYear()

  // Get all movies in our database
  console.log("Loading movie IDs from database...")
  const movieTmdbIds = await getAllMovieTmdbIds()
  console.log(`  Found ${movieTmdbIds.size} movies in database`)

  // Split into date ranges if needed (max 14 days per query)
  const dateRanges = getDateRanges(startDate, endDate)
  console.log(`  Querying ${dateRanges.length} date range(s)`)

  // Fetch all changed movie IDs from TMDB
  const allChangedIds: number[] = []
  for (const range of dateRanges) {
    console.log(`  Fetching changes for ${range.start} to ${range.end}...`)
    const ids = await getAllChangedMovieIds(range.start, range.end)
    allChangedIds.push(...ids)
    await delay(100)
  }

  // Deduplicate
  const changedIds = [...new Set(allChangedIds)]
  console.log(`\nFound ${changedIds.length} unique changed movie IDs on TMDB`)

  // Filter to movies we care about (in our database)
  const relevantIds = changedIds.filter((id) => movieTmdbIds.has(id))
  console.log(`  ${relevantIds.length} are in our movies table`)

  if (relevantIds.length === 0) {
    console.log("\nNo relevant movie changes found.")
    return { checked: 0, updated: 0, errors }
  }

  // Process each movie
  let updated = 0

  console.log("\nProcessing movies...")
  for (const movieId of relevantIds) {
    console.log(`  Processing movie ${movieId}...`)

    const result = await updateMovieMortalityStats(movieId, currentYear, dryRun)
    if (result.error) {
      console.error(`    ${result.error}`)
      errors.push(result.error)
    } else if (result.updated && result.title) {
      if (dryRun) {
        console.log(`    Would update: ${result.title}`)
      } else {
        console.log(`    Updated: ${result.title}`)
      }
      updated++
    }

    await delay(250)
  }

  return { checked: relevantIds.length, updated, errors }
}

program.parse()
