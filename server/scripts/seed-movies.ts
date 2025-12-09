#!/usr/bin/env tsx
/**
 * Seed script to populate the movies and actor_appearances tables.
 * This extends the deceased actors seeding to also save movie metadata and cast appearances.
 *
 * Usage:
 *   npm run seed:movies -- <startYear> [endYear]
 *
 * Examples:
 *   npm run seed:movies -- 1995       # Single year
 *   npm run seed:movies -- 1990 1999  # Year range (1990s)
 *   npm run seed:movies -- 1980 1989  # Year range (1980s)
 */

import "dotenv/config"
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
  batchUpsertActorAppearances,
  type MovieRecord,
  type ActorAppearanceRecord,
} from "../src/lib/db.js"

const MOVIES_TO_FETCH = 200 // Top 200 movies per year range
const CAST_LIMIT = 30 // Top 30 actors per movie
const PAGES_NEEDED = Math.ceil(MOVIES_TO_FETCH / 20) // TMDB returns 20 per page

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error("Usage: npm run seed:movies -- <startYear> [endYear]")
    console.error("Examples:")
    console.error("  npm run seed:movies -- 1995       # Single year")
    console.error("  npm run seed:movies -- 1990 1999  # Year range")
    process.exit(1)
  }

  const startYear = parseInt(args[0], 10)
  const endYear = parseInt(args[1], 10) || startYear

  if (isNaN(startYear) || startYear < 1900 || startYear > 2100) {
    console.error("Invalid start year:", args[0])
    process.exit(1)
  }

  if (isNaN(endYear) || endYear < startYear || endYear > 2100) {
    console.error("Invalid end year:", args[1])
    process.exit(1)
  }

  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log(`\nSeeding movies for ${startYear}-${endYear}...\n`)

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
      console.log(`Fetching top ${MOVIES_TO_FETCH} movies for ${year}...`)
      const movies = await fetchTopMovies(year, year)
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

        // Save actor appearances
        const appearances: ActorAppearanceRecord[] = topCast.map((castMember, index) => {
          const person = personDetails.get(castMember.id)
          const birthday = person?.birthday
          let ageAtFilming: number | null = null

          if (birthday && releaseYear) {
            const birthYear = parseInt(birthday.split("-")[0], 10)
            ageAtFilming = releaseYear - birthYear
          }

          return {
            actor_tmdb_id: castMember.id,
            movie_tmdb_id: movie.id,
            actor_name: castMember.name,
            character_name: castMember.character || null,
            billing_order: index,
            age_at_filming: ageAtFilming,
            is_deceased: !!person?.deathday,
          }
        })

        await batchUpsertActorAppearances(appearances)
        yearActorAppearances += appearances.length

        console.log(`  Saved ${appearances.length} actor appearances`)

        // Small delay between movies
        await delay(100)
      } catch (error) {
        console.error(`  Error processing movie: ${error}`)
      }
      }

      // Year summary
      console.log(`\nYear ${year} complete: ${yearMoviesSaved} movies, ${yearActorAppearances} appearances`)
      grandTotalMoviesSaved += yearMoviesSaved
      grandTotalActorAppearances += yearActorAppearances
    }

    // Grand total summary
    console.log("\n" + "=".repeat(60))
    console.log("GRAND TOTAL:")
    console.log(`  Total movies saved: ${grandTotalMoviesSaved}`)
    console.log(`  Total actor appearances: ${grandTotalActorAppearances}`)
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

async function fetchTopMovies(startYear: number, endYear: number): Promise<TMDBMovie[]> {
  const movies: TMDBMovie[] = []
  const seenIds = new Set<number>()

  for (let page = 1; page <= PAGES_NEEDED; page++) {
    try {
      const response = await discoverMoviesByYear(startYear, endYear, page)

      for (const movie of response.results) {
        if (!seenIds.has(movie.id)) {
          seenIds.add(movie.id)
          movies.push(movie)
        }
      }

      // Stop if we've reached our limit or there are no more results
      if (movies.length >= MOVIES_TO_FETCH || response.results.length === 0) {
        break
      }

      await delay(50)
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error)
      break
    }
  }

  return movies.slice(0, MOVIES_TO_FETCH)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
