#!/usr/bin/env tsx
/**
 * Seed script to populate movies from deceased actors' filmographies.
 * For each deceased actor in the database, fetches their complete filmography
 * from TMDB and processes any movies not already in our database.
 *
 * Progress is automatically saved to a file and will resume from where it
 * left off if interrupted.
 *
 * Usage:
 *   npm run seed:filmographies [options]
 *
 * Options:
 *   --limit <n>    Process only the first N actors
 *   --skip <n>     Skip the first N actors from the remaining unprocessed list
 *                  (applied AFTER filtering out previously processed actors)
 *   --dry-run      Preview what would be done without writing to database
 *   --reset        Clear progress file and start fresh
 *
 * Examples:
 *   npm run seed:filmographies                      # Process all deceased actors
 *   npm run seed:filmographies -- --limit 100       # Process first 100 actors
 *   npm run seed:filmographies -- --skip 500        # Start from actor 501
 *   npm run seed:filmographies -- --dry-run         # Preview without writing
 *   npm run seed:filmographies -- --reset           # Clear progress and start over
 */

import "dotenv/config"
import * as fs from "fs"
import * as path from "path"
import { Command, InvalidArgumentError } from "commander"
import {
  getPersonCredits,
  getMovieDetails,
  getMovieCredits,
  batchGetPersonDetails,
} from "../src/lib/tmdb.js"
import { calculateMovieMortality } from "../src/lib/mortality-stats.js"
import { calculateAgeAtFilming } from "../src/lib/movie-cache.js"
import {
  getDeceasedTmdbIds,
  getAllMovieTmdbIds,
  upsertMovie,
  batchUpsertActors,
  batchUpsertActorMovieAppearances,
  type MovieRecord,
  type ActorMovieAppearanceRecord,
  type ActorInput,
} from "../src/lib/db.js"

const CAST_LIMIT = 30 // Top 30 actors per movie
const LOG_INTERVAL = 10 // Log progress every N actors
const PROGRESS_FILE = path.join(process.cwd(), ".filmography-seed-progress.json")

interface Progress {
  processedActorIds: number[]
  startedAt: string
  lastUpdated: string
  stats: {
    newMovies: number
    skippedMovies: number
    actorAppearances: number
    errors: number
  }
}

function loadProgress(): Progress | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, "utf-8")
      return JSON.parse(data) as Progress
    }
  } catch (error) {
    console.error("Error loading progress file:", error)
  }
  return null
}

function saveProgress(progress: Progress): void {
  progress.lastUpdated = new Date().toISOString()
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
}

function clearProgress(): void {
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE)
    console.log("Progress file cleared.")
  }
}

function parseNonNegativeInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("Must be a non-negative integer")
  }
  return parsed
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface ProcessMovieResult {
  success: boolean
  actorAppearances: number
}

async function processMovie(
  movieId: number,
  releaseDate: string | null,
  currentYear: number,
  dryRun: boolean
): Promise<ProcessMovieResult> {
  // Skip movies without a valid release date to avoid invalid mortality calculations
  if (!releaseDate) {
    return { success: false, actorAppearances: 0 }
  }

  const releaseYear = parseInt(releaseDate.split("-")[0], 10)
  if (isNaN(releaseYear) || releaseYear <= 0) {
    return { success: false, actorAppearances: 0 }
  }

  // Get full movie details
  const details = await getMovieDetails(movieId)
  await delay(50)

  // Get credits
  const credits = await getMovieCredits(movieId)
  const topCast = credits.cast.slice(0, CAST_LIMIT)
  await delay(50)

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
  const mortalityStats = await calculateMovieMortality(releaseYear, actorsForMortality, currentYear)

  if (dryRun) {
    console.log(
      `    [DRY-RUN] Would save: ${mortalityStats.actualDeaths} deceased, ${mortalityStats.expectedDeaths.toFixed(1)} expected`
    )
    return { success: true, actorAppearances: topCast.length }
  }

  // Save movie to database
  const movieRecord: MovieRecord = {
    tmdb_id: movieId,
    title: details.title,
    release_date: releaseDate || null,
    release_year: releaseYear || null,
    poster_path: details.poster_path,
    genres: details.genres?.map((g) => g.name) || [],
    original_language: null, // Will be fetched by backfill:languages if needed
    production_countries: details.production_countries?.map((c) => c.iso_3166_1) ?? null,
    tmdb_popularity: null,
    tmdb_vote_average: null,
    cast_count: topCast.length,
    deceased_count: mortalityStats.actualDeaths,
    living_count: topCast.length - mortalityStats.actualDeaths,
    expected_deaths: mortalityStats.expectedDeaths,
    mortality_surprise_score: mortalityStats.mortalitySurpriseScore,
  }

  await upsertMovie(movieRecord)

  console.log(
    `    Saved: ${mortalityStats.actualDeaths} deceased, ${mortalityStats.expectedDeaths.toFixed(1)} expected, score: ${mortalityStats.mortalitySurpriseScore.toFixed(3)}`
  )

  // Create actor records for each cast member
  const actorInputs: ActorInput[] = topCast.map((castMember) => {
    const person = personDetails.get(castMember.id)
    return {
      tmdb_id: castMember.id,
      name: castMember.name,
      birthday: person?.birthday ?? null,
      deathday: person?.deathday ?? null,
      profile_path: person?.profile_path ?? null,
      popularity: person?.popularity ?? null,
    }
  })

  // Upsert actors and get the mapping of tmdb_id -> actor_id
  const tmdbToActorId = await batchUpsertActors(actorInputs)

  // Save actor appearances using internal actor_id
  const appearances: ActorMovieAppearanceRecord[] = []
  for (let index = 0; index < topCast.length; index++) {
    const castMember = topCast[index]
    const actorId = tmdbToActorId.get(castMember.id)
    if (!actorId) {
      console.warn(`    Warning: No actor_id for ${castMember.name} (tmdb_id: ${castMember.id})`)
      continue
    }
    const person = personDetails.get(castMember.id)

    appearances.push({
      actor_id: actorId,
      movie_tmdb_id: movieId,
      character_name: castMember.character || null,
      billing_order: index,
      age_at_filming: calculateAgeAtFilming(person?.birthday ?? null, releaseYear),
      appearance_type: "regular",
    })
  }

  await batchUpsertActorMovieAppearances(appearances)
  console.log(`    Saved ${appearances.length} actor appearances`)

  return { success: true, actorAppearances: appearances.length }
}

interface RunOptions {
  limit?: number
  skip: number
  dryRun: boolean
  reset: boolean
}

async function runSeeding({ limit, skip, dryRun, reset }: RunOptions) {
  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  // Handle reset flag
  if (reset) {
    clearProgress()
  }

  const currentYear = new Date().getFullYear()

  // Load existing progress
  let progress = loadProgress()
  const previouslyProcessedIds = new Set(progress?.processedActorIds ?? [])

  if (progress && !dryRun) {
    console.log(`\nResuming from previous run (started ${progress.startedAt})`)
    console.log(`Previously processed: ${previouslyProcessedIds.size} actors`)
    console.log(
      `Previous stats: ${progress.stats.newMovies} movies, ${progress.stats.errors} errors\n`
    )
  }

  // Get all deceased actor IDs
  console.log("Fetching deceased actor IDs from database...")
  const allDeceasedIds = await getDeceasedTmdbIds()
  const deceasedActorIds = Array.from(allDeceasedIds)
  console.log(`Found ${deceasedActorIds.length} deceased actors`)

  // Get existing movie IDs to skip
  console.log("Fetching existing movie IDs from database...")
  const existingMovieIds = await getAllMovieTmdbIds()
  console.log(`Found ${existingMovieIds.size} existing movies`)

  // Filter out already processed actors (from progress file)
  let actorsToProcess = deceasedActorIds.filter((id) => !previouslyProcessedIds.has(id))
  console.log(`Actors remaining after resume filter: ${actorsToProcess.length}`)

  // Apply skip and limit
  actorsToProcess = actorsToProcess.slice(skip)
  if (limit !== undefined) {
    actorsToProcess = actorsToProcess.slice(0, limit)
  }

  console.log(
    `\nProcessing ${actorsToProcess.length} actors (skip=${skip}, limit=${limit ?? "none"})`
  )
  if (dryRun) {
    console.log("DRY-RUN MODE - no changes will be written\n")
  } else {
    console.log()
  }

  // Initialize or continue progress
  if (!progress) {
    progress = {
      processedActorIds: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: {
        newMovies: 0,
        skippedMovies: 0,
        actorAppearances: 0,
        errors: 0,
      },
    }
  }

  let processedActors = 0
  let totalNewMovies = progress.stats.newMovies
  let totalSkippedMovies = progress.stats.skippedMovies
  let totalActorAppearances = progress.stats.actorAppearances
  let totalErrors = progress.stats.errors

  // Track movies processed in this run to avoid duplicates
  const processedInRun = new Set<number>()

  for (const actorId of actorsToProcess) {
    try {
      // Fetch actor's filmography
      const credits = await getPersonCredits(actorId)
      await delay(50)

      let newMovies = 0
      let skippedMovies = 0

      for (const movie of credits.cast) {
        // Skip if already in database or already processed this run
        if (existingMovieIds.has(movie.id) || processedInRun.has(movie.id)) {
          skippedMovies++
          continue
        }

        // Skip movies without a title (shouldn't happen but be safe)
        if (!movie.title) {
          skippedMovies++
          continue
        }

        const movieYear = movie.release_date?.split("-")[0] || "?"
        console.log(`  [${actorId}] Processing: ${movie.title} (${movieYear})`)

        try {
          const result = await processMovie(
            movie.id,
            movie.release_date || null,
            currentYear,
            dryRun
          )
          if (result.success) {
            newMovies++
            totalActorAppearances += result.actorAppearances
            processedInRun.add(movie.id)
            existingMovieIds.add(movie.id) // Also update the main set
          }
        } catch (error) {
          console.error(`    Error processing movie ${movie.id}: ${error}`)
          totalErrors++
        }

        // Delay between movies
        await delay(100)
      }

      processedActors++
      totalNewMovies += newMovies
      totalSkippedMovies += skippedMovies

      // Save progress after each actor (unless dry-run)
      if (!dryRun) {
        progress.processedActorIds.push(actorId)
        progress.stats = {
          newMovies: totalNewMovies,
          skippedMovies: totalSkippedMovies,
          actorAppearances: totalActorAppearances,
          errors: totalErrors,
        }
        saveProgress(progress)
      }

      // Log progress periodically
      if (processedActors % LOG_INTERVAL === 0 || processedActors === actorsToProcess.length) {
        console.log(
          `\n[Progress] Actors: ${processedActors}/${actorsToProcess.length}, ` +
            `New movies: ${totalNewMovies}, Skipped: ${totalSkippedMovies}, Errors: ${totalErrors}\n`
        )
      }
    } catch (error) {
      console.error(`Error processing actor ${actorId}: ${error}`)
      totalErrors++
      processedActors++

      // Still mark actor as processed to avoid retrying failed actors
      // Keep all stats in sync on error, just like the success path
      if (!dryRun) {
        progress.processedActorIds.push(actorId)
        progress.stats = {
          newMovies: totalNewMovies,
          skippedMovies: totalSkippedMovies,
          actorAppearances: totalActorAppearances,
          errors: totalErrors,
        }
        saveProgress(progress)
      }
    }

    // Delay between actors
    await delay(100)
  }

  // Final summary
  console.log("\n" + "=".repeat(60))
  console.log("SUMMARY:")
  console.log(
    `  Actors processed: ${processedActors} (total: ${progress.processedActorIds.length})`
  )
  console.log(`  New movies added: ${totalNewMovies}`)
  console.log(`  Movies skipped (already existed): ${totalSkippedMovies}`)
  console.log(`  Actor appearances saved: ${totalActorAppearances}`)
  console.log(`  Errors: ${totalErrors}`)
  if (dryRun) {
    console.log("\n  (DRY-RUN - no changes were written)")
  } else {
    console.log(`\n  Progress saved to: ${PROGRESS_FILE}`)
    console.log("  Run again to continue, or use --reset to start over")
  }
  console.log("\nDone!")
  process.exit(0)
}

const program = new Command()
  .name("seed-from-filmographies")
  .description("Seed movies from deceased actors' filmographies")
  .option("-l, --limit <number>", "Process only the first N actors", parseNonNegativeInt)
  .option("-s, --skip <number>", "Skip the first N actors", parseNonNegativeInt, 0)
  .option("-n, --dry-run", "Preview what would be done without writing to database")
  .option("-r, --reset", "Clear progress file and start fresh")
  .action(async (options: { limit?: number; skip: number; dryRun?: boolean; reset?: boolean }) => {
    await runSeeding({
      limit: options.limit,
      skip: options.skip,
      dryRun: options.dryRun ?? false,
      reset: options.reset ?? false,
    })
  })

program.parse()
