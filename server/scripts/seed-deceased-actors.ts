#!/usr/bin/env tsx
/**
 * Seed script to populate the actors table with deceased actors from top movies.
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
import { Command, InvalidArgumentError } from "commander"
import {
  discoverMoviesByYear,
  getMovieCredits,
  batchGetPersonDetails,
  type TMDBMovie,
  type TMDBPerson,
} from "../src/lib/tmdb.js"
import { getCauseOfDeath } from "../src/lib/wikidata.js"
// Use haiku for bulk seeding operations to save cost (rate limiting is handled by claude.ts)
import { batchUpsertActors, type ActorInput } from "../src/lib/db.js"
import { calculateYearsLost } from "../src/lib/mortality-stats.js"

const MOVIES_TO_FETCH = 100 // Top 100 movies per year range
const CAST_LIMIT = 30 // Top 30 actors per movie
const PAGES_NEEDED = Math.ceil(MOVIES_TO_FETCH / 20) // TMDB returns 20 per page
const MIN_YEAR = 1900
const MAX_YEAR = 2100

function parseYear(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < MIN_YEAR || parsed > MAX_YEAR) {
    throw new InvalidArgumentError(`Must be a valid year (${MIN_YEAR}-${MAX_YEAR})`)
  }
  return parsed
}

const program = new Command()
  .name("seed-deceased-actors")
  .description("Seed deceased actors from top movies")
  .argument("<startYear>", "Start year for seeding", parseYear)
  .argument("[endYear]", "End year for seeding (defaults to startYear)", parseYear)
  .action(async (startYear: number, endYear: number | undefined) => {
    const effectiveEndYear = endYear ?? startYear

    // Validate year range
    if (effectiveEndYear < startYear) {
      console.error(
        `Error: End year (${effectiveEndYear}) cannot be before start year (${startYear})`
      )
      process.exit(1)
    }

    await runSeeding(startYear, effectiveEndYear)
  })

async function runSeeding(startYear: number, endYear: number) {
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

    // Step 4: Filter to deceased only with validation
    const deceasedActors: TMDBPerson[] = []
    const rejectedActors: Array<{ name: string; reason: string }> = []
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    for (const person of personDetails.values()) {
      if (person.deathday) {
        const deathDate = new Date(person.deathday)
        const birthDate = person.birthday ? new Date(person.birthday) : null

        // Validation checks
        if (deathDate > now) {
          rejectedActors.push({
            name: person.name,
            reason: `Future death date: ${person.deathday}`,
          })
          continue
        }

        if (deathDate > thirtyDaysAgo) {
          rejectedActors.push({
            name: person.name,
            reason: `Too recent (within 30 days): ${person.deathday}`,
          })
          continue
        }

        if (birthDate && deathDate < birthDate) {
          rejectedActors.push({
            name: person.name,
            reason: `Death before birth: ${person.deathday} < ${person.birthday}`,
          })
          continue
        }

        deceasedActors.push(person)
      }
    }

    console.log(`Found ${deceasedActors.length} deceased actors\n`)

    if (rejectedActors.length > 0) {
      console.log(`\nRejected ${rejectedActors.length} suspicious death records:`)
      for (const { name, reason } of rejectedActors.slice(0, 20)) {
        console.log(`  ❌ ${name}: ${reason}`)
      }
      if (rejectedActors.length > 20) {
        console.log(`  ... and ${rejectedActors.length - 20} more`)
      }
      console.log()
    }

    if (deceasedActors.length === 0) {
      console.log("No deceased actors found. Done!")
      process.exit(0)
    }

    // Step 5: Look up causes of death
    console.log("Looking up causes of death...")
    const records: ActorInput[] = []

    for (let i = 0; i < deceasedActors.length; i++) {
      const actor = deceasedActors[i]
      console.log(`  [${i + 1}/${deceasedActors.length}] ${actor.name}...`)

      try {
        const {
          causeOfDeath,
          causeOfDeathSource,
          causeOfDeathDetails,
          causeOfDeathDetailsSource,
          wikipediaUrl,
        } = await getCauseOfDeath(actor.name, actor.birthday, actor.deathday!, "haiku")

        // Calculate mortality stats
        const yearsLostResult = await calculateYearsLost(actor.birthday, actor.deathday!)

        records.push({
          tmdb_id: actor.id,
          name: actor.name,
          birthday: actor.birthday,
          deathday: actor.deathday!,
          cause_of_death: causeOfDeath,
          cause_of_death_source: causeOfDeathSource,
          cause_of_death_details: causeOfDeathDetails,
          cause_of_death_details_source: causeOfDeathDetailsSource,
          wikipedia_url: wikipediaUrl,
          profile_path: actor.profile_path,
          age_at_death: yearsLostResult?.ageAtDeath ?? null,
          expected_lifespan: yearsLostResult?.expectedLifespan ?? null,
          years_lost: yearsLostResult?.yearsLost ?? null,
        })

        if (causeOfDeath) {
          console.log(`    -> ${causeOfDeath} (${causeOfDeathSource})`)
        } else {
          console.log(`    -> (cause unknown)`)
        }

        // Note: Rate limiting is handled by the centralized rate limiter in claude.ts
      } catch (error) {
        console.error(`    Error: ${error}`)
        // Still add the record without cause of death
        // Calculate mortality stats even if cause of death lookup failed
        const yearsLostResult = await calculateYearsLost(actor.birthday, actor.deathday!)

        records.push({
          tmdb_id: actor.id,
          name: actor.name,
          birthday: actor.birthday,
          deathday: actor.deathday!,
          cause_of_death: null,
          cause_of_death_source: null,
          cause_of_death_details: null,
          cause_of_death_details_source: null,
          wikipedia_url: null,
          profile_path: actor.profile_path,
          age_at_death: yearsLostResult?.ageAtDeath ?? null,
          expected_lifespan: yearsLostResult?.expectedLifespan ?? null,
          years_lost: yearsLostResult?.yearsLost ?? null,
        })
      }
    }

    // Step 6: Save to database
    console.log("\nSaving to database...")
    await batchUpsertActors(records)
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
    process.exit(0)
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

program.parse()
