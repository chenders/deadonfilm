#!/usr/bin/env tsx
/**
 * Seed script to populate the deceased_persons database with actors from top movies.
 *
 * Usage:
 *   npm run seed -- <startYear> [endYear]
 *
 * Examples:
 *   npm run seed -- 1995       # Single year
 *   npm run seed -- 1990 1999  # Year range (1990s)
 *   npm run seed -- 1980 1989  # Year range (1980s)
 */

import "dotenv/config"
import {
  discoverMoviesByYear,
  getMovieCredits,
  batchGetPersonDetails,
  type TMDBMovie,
  type TMDBPerson,
} from "../src/lib/tmdb.js"
import { getCauseOfDeath } from "../src/lib/wikidata.js"
import { batchUpsertDeceasedPersons, type DeceasedPersonRecord } from "../src/lib/db.js"

const MOVIES_TO_FETCH = 100 // Top 100 movies per year range
const CAST_LIMIT = 30 // Top 30 actors per movie
const PAGES_NEEDED = Math.ceil(MOVIES_TO_FETCH / 20) // TMDB returns 20 per page

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error("Usage: npm run seed -- <startYear> [endYear]")
    console.error("Examples:")
    console.error("  npm run seed -- 1995       # Single year")
    console.error("  npm run seed -- 1990 1999  # Year range")
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

  console.log(`\nSeeding deceased actors for ${startYear}-${endYear}...\n`)

  try {
    // Step 1: Fetch top movies
    console.log(`Fetching top ${MOVIES_TO_FETCH} movies...`)
    const movies = await fetchTopMovies(startYear, endYear)
    console.log(`Found ${movies.length} movies\n`)

    // Step 2: Get cast for each movie and collect unique actor IDs
    console.log("Collecting cast from movies...")
    const uniqueActorIds = new Set<number>()

    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i]
      const year = movie.release_date?.split("-")[0] || "?"
      console.log(`  [${i + 1}/${movies.length}] ${movie.title} (${year})`)

      try {
        const credits = await getMovieCredits(movie.id)
        const topCast = credits.cast.slice(0, CAST_LIMIT)
        for (const actor of topCast) {
          uniqueActorIds.add(actor.id)
        }

        // Small delay to be nice to the API
        await delay(50)
      } catch (error) {
        console.error(`    Error fetching credits: ${error}`)
      }
    }

    console.log(`\nFound ${uniqueActorIds.size} unique actors\n`)

    // Step 3: Batch fetch person details
    console.log("Fetching person details...")
    const personIds = Array.from(uniqueActorIds)
    const personDetails = await batchGetPersonDetails(personIds, 10, 100)
    console.log(`Got details for ${personDetails.size} actors\n`)

    // Step 4: Filter to deceased only
    const deceasedActors: TMDBPerson[] = []
    for (const person of personDetails.values()) {
      if (person.deathday) {
        deceasedActors.push(person)
      }
    }
    console.log(`Found ${deceasedActors.length} deceased actors\n`)

    if (deceasedActors.length === 0) {
      console.log("No deceased actors found. Done!")
      return
    }

    // Step 5: Look up causes of death
    console.log("Looking up causes of death...")
    const records: DeceasedPersonRecord[] = []

    for (let i = 0; i < deceasedActors.length; i++) {
      const actor = deceasedActors[i]
      console.log(`  [${i + 1}/${deceasedActors.length}] ${actor.name}...`)

      try {
        const { causeOfDeath, causeOfDeathDetails, wikipediaUrl } = await getCauseOfDeath(
          actor.name,
          actor.birthday,
          actor.deathday!
        )

        records.push({
          tmdb_id: actor.id,
          name: actor.name,
          birthday: actor.birthday,
          deathday: actor.deathday!,
          cause_of_death: causeOfDeath,
          cause_of_death_details: causeOfDeathDetails,
          wikipedia_url: wikipediaUrl,
        })

        if (causeOfDeath) {
          console.log(`    -> ${causeOfDeath}`)
        } else {
          console.log(`    -> (cause unknown)`)
        }

        // Small delay between cause of death lookups
        await delay(200)
      } catch (error) {
        console.error(`    Error: ${error}`)
        // Still add the record without cause of death
        records.push({
          tmdb_id: actor.id,
          name: actor.name,
          birthday: actor.birthday,
          deathday: actor.deathday!,
          cause_of_death: null,
          cause_of_death_details: null,
          wikipedia_url: null,
        })
      }
    }

    // Step 6: Save to database
    console.log("\nSaving to database...")
    await batchUpsertDeceasedPersons(records)
    console.log(`Successfully inserted/updated ${records.length} records\n`)

    // Summary
    const withCause = records.filter((r) => r.cause_of_death).length
    console.log("Summary:")
    console.log(`  Total movies processed: ${movies.length}`)
    console.log(`  Unique actors found: ${uniqueActorIds.size}`)
    console.log(`  Deceased actors: ${deceasedActors.length}`)
    console.log(`  With cause of death: ${withCause}`)
    console.log(`  Without cause of death: ${deceasedActors.length - withCause}`)
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
