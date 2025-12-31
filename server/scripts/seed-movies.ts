#!/usr/bin/env tsx
/**
 * Seed script to populate the movies and actor_appearances tables.
 * This extends the deceased actors seeding to also save movie metadata and cast appearances.
 *
 * Usage:
 *   npm run seed:movies -- <startYear> [endYear] [options]
 *
 * Options:
 *   --count <n>    Number of movies per year (default: 200)
 *   --all-time     Seed from 1920 to current year
 *
 * Examples:
 *   npm run seed:movies -- 1995                    # Single year, 200 movies
 *   npm run seed:movies -- 1990 1999               # Year range (1990s)
 *   npm run seed:movies -- 1980 1989 --count 500   # 500 movies per year
 *   npm run seed:movies -- --all-time              # All years since 1920
 *   npm run seed:movies -- --all-time --count 1000 # 1000 movies per year, all years
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import {
  discoverMoviesByYear,
  getMovieDetails,
  getMovieCredits,
  batchGetPersonDetails,
  type TMDBMovie,
} from "../src/lib/tmdb.js"
import { calculateMovieMortality } from "../src/lib/mortality-stats.js"
import {
  upsertMovie,
  batchUpsertActors,
  batchUpsertActorMovieAppearances,
  type MovieRecord,
  type ActorMovieAppearanceRecord,
  type ActorInput,
} from "../src/lib/db.js"

const DEFAULT_MOVIES_TO_FETCH = 200
const CAST_LIMIT = 30 // Top 30 actors per movie
const EARLIEST_YEAR = 1920

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

function parseYear(value: string): number {
  const parsed = parseInt(value, 10)
  const maxYear = new Date().getFullYear() + 1
  if (isNaN(parsed) || parsed < EARLIEST_YEAR || parsed > maxYear) {
    throw new InvalidArgumentError(`Must be a valid year (${EARLIEST_YEAR}-${maxYear})`)
  }
  return parsed
}

const program = new Command()
  .name("seed-movies")
  .description("Seed the movies and actor_appearances tables with movie data from TMDB")
  .argument("[startYear]", "Start year for seeding", parseYear)
  .argument("[endYear]", "End year for seeding (defaults to startYear)", parseYear)
  .option(
    "-c, --count <number>",
    "Number of movies per year",
    parsePositiveInt,
    DEFAULT_MOVIES_TO_FETCH
  )
  .option("-a, --all-time", "Seed from 1920 to current year")
  .action(
    async (
      startYearArg: number | undefined,
      endYearArg: number | undefined,
      options: { count: number; allTime?: boolean }
    ) => {
      const currentYear = new Date().getFullYear()

      // Validate that --all-time and explicit years are mutually exclusive
      if (options.allTime && startYearArg !== undefined) {
        console.error("Error: Cannot specify both --all-time and explicit years")
        console.error("Use either: npm run seed:movies -- --all-time")
        console.error("        or: npm run seed:movies -- <startYear> [endYear]")
        process.exit(1)
      }

      // Determine years to seed
      let startYear: number
      let endYear: number

      if (options.allTime) {
        startYear = EARLIEST_YEAR
        endYear = currentYear
      } else if (startYearArg !== undefined) {
        startYear = startYearArg
        endYear = endYearArg ?? startYearArg
      } else {
        console.error("Error: Must specify either --all-time or a start year")
        program.help()
        process.exit(1)
      }

      // Validate year range
      if (endYear < startYear) {
        console.error(`Error: End year (${endYear}) cannot be before start year (${startYear})`)
        process.exit(1)
      }

      await runSeeding({ startYear, endYear, moviesPerYear: options.count })
    }
  )

interface SeedOptions {
  startYear: number
  endYear: number
  moviesPerYear: number
}

async function runSeeding({ startYear, endYear, moviesPerYear }: SeedOptions) {
  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const totalYears = endYear - startYear + 1
  console.log(`\nSeeding movies for ${startYear}-${endYear} (${totalYears} years)`)
  console.log(`Movies per year: ${moviesPerYear}`)
  console.log(`Estimated total: ~${totalYears * moviesPerYear} movies\n`)

  try {
    let grandTotalMoviesSaved = 0
    let grandTotalActorAppearances = 0
    const currentYear = new Date().getFullYear()

    // Process each year individually
    for (let year = startYear; year <= endYear; year++) {
      console.log(`\n${"=".repeat(60)}`)
      console.log(`Processing year ${year}...`)
      console.log(`${"=".repeat(60)}`)

      // Fetch top movies for this year
      console.log(`Fetching top ${moviesPerYear} movies for ${year}...`)
      const movies = await fetchTopMovies(year, year, moviesPerYear)
      console.log(`Found ${movies.length} movies\n`)

      let yearMoviesSaved = 0
      let yearActorAppearances = 0

      // Process each movie
      for (let i = 0; i < movies.length; i++) {
        const movie = movies[i]
        const movieYear = movie.release_date?.split("-")[0] || "?"
        console.log(`[${i + 1}/${movies.length}] ${movie.title} (${movieYear})`)

        try {
          // Get full movie details
          const details = await getMovieDetails(movie.id)
          await delay(50)

          // Get credits
          const credits = await getMovieCredits(movie.id)
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
          const releaseYear = parseInt(movie.release_date?.split("-")[0] || "0", 10)
          const mortalityStats = await calculateMovieMortality(
            releaseYear,
            actorsForMortality,
            currentYear
          )

          // Save movie to database
          const movieRecord: MovieRecord = {
            tmdb_id: movie.id,
            title: movie.title,
            release_date: movie.release_date || null,
            release_year: releaseYear || null,
            poster_path: movie.poster_path,
            genres: details.genres?.map((g) => g.name) || [],
            original_language: movie.original_language || null,
            popularity: movie.popularity || null,
            vote_average: null, // Not in TMDBMovie type
            cast_count: topCast.length,
            deceased_count: mortalityStats.actualDeaths,
            living_count: topCast.length - mortalityStats.actualDeaths,
            expected_deaths: mortalityStats.expectedDeaths,
            mortality_surprise_score: mortalityStats.mortalitySurpriseScore,
          }

          await upsertMovie(movieRecord)
          yearMoviesSaved++

          console.log(
            `  Saved: ${mortalityStats.actualDeaths} deceased, ${mortalityStats.expectedDeaths.toFixed(1)} expected, score: ${mortalityStats.mortalitySurpriseScore.toFixed(3)}`
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
              console.warn(`  Warning: No actor_id for ${castMember.name} (tmdb_id: ${castMember.id})`)
              continue
            }

            const person = personDetails.get(castMember.id)
            const birthday = person?.birthday
            let ageAtFilming: number | null = null

            if (birthday && releaseYear) {
              const birthYear = parseInt(birthday.split("-")[0], 10)
              ageAtFilming = releaseYear - birthYear
            }

            appearances.push({
              actor_id: actorId,
              movie_tmdb_id: movie.id,
              character_name: castMember.character || null,
              billing_order: index,
              age_at_filming: ageAtFilming,
            })
          }

          await batchUpsertActorMovieAppearances(appearances)
          yearActorAppearances += appearances.length

          console.log(`  Saved ${appearances.length} actor appearances`)

          // Small delay between movies
          await delay(100)
        } catch (error) {
          console.error(`  Error processing movie: ${error}`)
        }
      }

      // Year summary
      console.log(
        `\nYear ${year} complete: ${yearMoviesSaved} movies, ${yearActorAppearances} appearances`
      )
      grandTotalMoviesSaved += yearMoviesSaved
      grandTotalActorAppearances += yearActorAppearances
    }

    // Grand total summary
    console.log("\n" + "=".repeat(60))
    console.log("GRAND TOTAL:")
    console.log(`  Total movies saved: ${grandTotalMoviesSaved}`)
    console.log(`  Total actor appearances: ${grandTotalActorAppearances}`)
    console.log("\nDone!")
    process.exit(0)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

async function fetchTopMovies(
  startYear: number,
  endYear: number,
  limit: number
): Promise<TMDBMovie[]> {
  const movies: TMDBMovie[] = []
  const seenIds = new Set<number>()
  const pagesNeeded = Math.ceil(limit / 20) // TMDB returns 20 per page

  for (let page = 1; page <= pagesNeeded; page++) {
    try {
      const response = await discoverMoviesByYear(startYear, endYear, page)

      for (const movie of response.results) {
        if (!seenIds.has(movie.id)) {
          seenIds.add(movie.id)
          movies.push(movie)
        }
      }

      // Stop if we've reached our limit or there are no more results
      if (movies.length >= limit || response.results.length === 0) {
        break
      }

      await delay(50)
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error)
      break
    }
  }

  return movies.slice(0, limit)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
