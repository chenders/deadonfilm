#!/usr/bin/env tsx
/**
 * Seed a specific movie by TMDB ID.
 * Useful for adding movies that aren't popular enough to be in the top 200 per decade.
 *
 * Usage:
 *   npm run seed:movie -- <tmdbId>
 *   npx tsx scripts/seed-movie-by-id.ts <tmdbId>
 *
 * Example:
 *   npm run seed:movie -- 9495   # The Crow (1994)
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getMovieDetails, getMovieCredits, batchGetPersonDetails } from "../../src/lib/tmdb.js"
import { calculateMovieMortality } from "../../src/lib/mortality-stats.js"
import {
  upsertMovie,
  batchUpsertActorMovieAppearances,
  upsertActor,
  type MovieRecord,
  type ActorMovieAppearanceRecord,
} from "../../src/lib/db.js"

const CAST_LIMIT = 30

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("seed-movie-by-id")
  .description("Seed a specific movie by TMDB ID")
  .argument("<tmdbId>", "TMDB movie ID", parsePositiveInt)
  .action(async (tmdbId: number) => {
    await seedMovie(tmdbId)
  })

async function seedMovie(tmdbId: number) {
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log(`\nSeeding movie with TMDB ID: ${tmdbId}...\n`)

  try {
    const currentYear = new Date().getFullYear()

    // Get full movie details
    console.log("Fetching movie details...")
    const details = await getMovieDetails(tmdbId)
    const releaseYear = parseInt(details.release_date?.split("-")[0] || "0", 10)
    console.log(`  Title: ${details.title} (${releaseYear})`)

    // Get credits
    console.log("Fetching credits...")
    const credits = await getMovieCredits(tmdbId)
    const topCast = credits.cast.slice(0, CAST_LIMIT)
    console.log(`  Found ${topCast.length} cast members`)

    // Get person details for cast
    console.log("Fetching person details...")
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
    console.log("Calculating mortality statistics...")
    const mortalityStats = await calculateMovieMortality(
      releaseYear,
      actorsForMortality,
      currentYear
    )

    // Save movie to database
    const movieRecord: MovieRecord = {
      tmdb_id: tmdbId,
      title: details.title,
      release_date: details.release_date || null,
      release_year: releaseYear || null,
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

    await upsertMovie(movieRecord)
    console.log(`\nSaved movie: ${details.title}`)
    console.log(`  Deceased: ${mortalityStats.actualDeaths}`)
    console.log(`  Expected: ${mortalityStats.expectedDeaths.toFixed(1)}`)
    console.log(`  Surprise score: ${mortalityStats.mortalitySurpriseScore.toFixed(3)}`)

    // Save actor appearances and actors
    const appearances: ActorMovieAppearanceRecord[] = []
    let deceasedCount = 0

    for (let i = 0; i < topCast.length; i++) {
      const castMember = topCast[i]
      const person = personDetails.get(castMember.id)
      const birthday = person?.birthday
      let ageAtFilming: number | null = null

      if (birthday && releaseYear) {
        const birthYear = parseInt(birthday.split("-")[0], 10)
        ageAtFilming = releaseYear - birthYear
      }

      // Upsert actor to actors table and get internal ID
      const actorId = await upsertActor({
        tmdb_id: castMember.id,
        name: castMember.name,
        birthday: person?.birthday || null,
        deathday: person?.deathday || null,
        profile_path: person?.profile_path || null,
      })

      appearances.push({
        actor_id: actorId,
        movie_tmdb_id: tmdbId,
        character_name: castMember.character || null,
        billing_order: i,
        age_at_filming: ageAtFilming,
      })

      if (person?.deathday) {
        deceasedCount++
        console.log(`  - ${castMember.name} (deceased)`)
      }
    }

    await batchUpsertActorMovieAppearances(appearances)
    console.log(`\nSaved ${appearances.length} actor appearances`)
    console.log(`Added/updated ${deceasedCount} deceased actors`)

    console.log("\nDone!")
    process.exit(0)
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

program.parse()
