#!/usr/bin/env tsx
/**
 * Backfill script to populate actor_appearances for movies that are missing them.
 * This finds all movies in the database that don't have any actor appearances
 * and fetches the cast from TMDB.
 *
 * Usage:
 *   npm run backfill:appearances
 */

import "dotenv/config"
import { getMovieCredits, batchGetPersonDetails } from "../src/lib/tmdb.js"
import { calculateMovieMortality } from "../src/lib/mortality-stats.js"
import { getPool, batchUpsertActorAppearances, type ActorAppearanceRecord } from "../src/lib/db.js"

const CAST_LIMIT = 30 // Top 30 actors per movie

interface MovieToBackfill {
  tmdb_id: number
  title: string
  release_date: Date | null
  release_year: number | null
}

async function main() {
  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log("\nBackfilling actor appearances for movies missing them...\n")

  try {
    const db = getPool()
    const currentYear = new Date().getFullYear()

    // Find all movies that don't have any actor appearances
    const result = await db.query<MovieToBackfill>(`
      SELECT m.tmdb_id, m.title, m.release_date, m.release_year
      FROM movies m
      LEFT JOIN actor_appearances aa ON m.tmdb_id = aa.movie_tmdb_id
      WHERE aa.id IS NULL
      ORDER BY m.popularity DESC NULLS LAST
    `)

    const moviesToBackfill = result.rows
    console.log(`Found ${moviesToBackfill.length} movies missing actor appearances\n`)

    if (moviesToBackfill.length === 0) {
      console.log("No movies to backfill. Done!")
      return
    }

    let successCount = 0
    let errorCount = 0
    let totalAppearances = 0

    for (let i = 0; i < moviesToBackfill.length; i++) {
      const movie = moviesToBackfill[i]
      const year = movie.release_year || movie.release_date?.getFullYear() || "?"
      console.log(`[${i + 1}/${moviesToBackfill.length}] ${movie.title} (${year})`)

      try {
        // Get credits from TMDB
        const credits = await getMovieCredits(movie.tmdb_id)
        const topCast = credits.cast.slice(0, CAST_LIMIT)
        await delay(50)

        if (topCast.length === 0) {
          console.log("  No cast found, skipping")
          continue
        }

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
        const releaseYear = movie.release_year || movie.release_date?.getFullYear() || 0
        const mortalityStats = await calculateMovieMortality(
          releaseYear,
          actorsForMortality,
          currentYear
        )

        // Update movie with mortality stats
        await db.query(
          `UPDATE movies SET
            cast_count = $1,
            deceased_count = $2,
            living_count = $3,
            expected_deaths = $4,
            mortality_surprise_score = $5,
            updated_at = CURRENT_TIMESTAMP
          WHERE tmdb_id = $6`,
          [
            topCast.length,
            mortalityStats.actualDeaths,
            topCast.length - mortalityStats.actualDeaths,
            mortalityStats.expectedDeaths,
            mortalityStats.mortalitySurpriseScore,
            movie.tmdb_id,
          ]
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
            movie_tmdb_id: movie.tmdb_id,
            actor_name: castMember.name,
            character_name: castMember.character || null,
            billing_order: index,
            age_at_filming: ageAtFilming,
            is_deceased: !!person?.deathday,
          }
        })

        await batchUpsertActorAppearances(appearances)
        totalAppearances += appearances.length
        successCount++

        console.log(
          `  Saved ${appearances.length} appearances (${mortalityStats.actualDeaths} deceased)`
        )

        // Small delay between movies
        await delay(100)
      } catch (error) {
        console.error(`  Error: ${error}`)
        errorCount++
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log("SUMMARY:")
    console.log(`  Movies processed: ${successCount}`)
    console.log(`  Movies with errors: ${errorCount}`)
    console.log(`  Total actor appearances added: ${totalAppearances}`)
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main()
