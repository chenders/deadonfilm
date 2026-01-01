#!/usr/bin/env tsx
/**
 * Seed script to populate the shows and actor_show_appearances tables.
 * Discovers popular US TV shows and saves their cast information.
 *
 * Usage:
 *   npm run seed:shows -- [options]
 *
 * Options:
 *   --count <n>    Number of shows to seed (default: 100)
 *   --dry-run      Preview without writing to database
 *
 * Examples:
 *   npm run seed:shows                    # Seed 100 popular shows
 *   npm run seed:shows -- --count 500     # Seed 500 shows
 *   npm run seed:shows -- --dry-run       # Preview what would be seeded
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
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
  batchUpsertActors,
  batchUpsertShowActorAppearances,
  type ShowRecord,
  type ShowActorAppearanceRecord,
  type ActorInput,
} from "../src/lib/db.js"

const DEFAULT_SHOWS_TO_FETCH = 100
const CAST_LIMIT = 50 // Top 50 actors per show (shows have larger casts)

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("seed-shows")
  .description("Seed the shows and actor_show_appearances tables with TV show data from TMDB")
  .option(
    "-c, --count <number>",
    "Number of shows to seed",
    parsePositiveInt,
    DEFAULT_SHOWS_TO_FETCH
  )
  .option("-n, --dry-run", "Preview without writing to database")
  .action(async (options: { count: number; dryRun?: boolean }) => {
    await runSeeding({ showsToFetch: options.count, dryRun: options.dryRun || false })
  })

interface SeedOptions {
  showsToFetch: number
  dryRun: boolean
}

async function runSeeding({ showsToFetch, dryRun }: SeedOptions) {
  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  console.log(`\nSeeding ${showsToFetch} popular TV shows${dryRun ? " (DRY RUN)" : ""}`)
  console.log(`Cast limit per show: ${CAST_LIMIT}\n`)

  try {
    // Fetch popular TV shows
    console.log("Fetching popular TV shows...")
    const shows = await fetchPopularShows(showsToFetch)
    console.log(`Found ${shows.length} shows\n`)

    let totalShowsSaved = 0
    let totalActorAppearances = 0
    const currentYear = new Date().getFullYear()

    // Process each show
    for (let i = 0; i < shows.length; i++) {
      const show = shows[i]
      const firstAirYear = show.first_air_date?.split("-")[0] || "?"
      console.log(`[${i + 1}/${shows.length}] ${show.name} (${firstAirYear})`)

      try {
        // Get full show details
        const details = await getTVShowDetails(show.id)
        await delay(50)

        // Get aggregate credits (all cast across all seasons)
        const credits = await getTVShowAggregateCredits(show.id)
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

        // Calculate mortality statistics using first air date
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
          tvmaze_id: null,
          thetvdb_id: null,
          imdb_id: null,
        }

        if (!dryRun) {
          await upsertShow(showRecord)
        }
        totalShowsSaved++

        console.log(
          `  ${mortalityStats.actualDeaths} deceased, ${mortalityStats.expectedDeaths.toFixed(1)} expected, score: ${mortalityStats.mortalitySurpriseScore.toFixed(3)}`
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
        let tmdbToActorId = new Map<number, number>()
        if (!dryRun) {
          tmdbToActorId = await batchUpsertActors(actorInputs)
        }

        // Prepare actor appearances using internal actor_id
        // For now, we save at show level without episode details
        // Episode-level data can be fetched later for more granular tracking
        const appearances: ShowActorAppearanceRecord[] = []
        for (let index = 0; index < topCast.length; index++) {
          const castMember = topCast[index]
          const actorId = tmdbToActorId.get(castMember.id)
          if (!actorId && !dryRun) {
            console.warn(
              `  Warning: No actor_id for ${castMember.name} (tmdb_id: ${castMember.id})`
            )
            continue
          }

          const person = personDetails.get(castMember.id)
          const birthday = person?.birthday
          let ageAtFilming: number | null = null

          if (birthday && firstAirYearNum) {
            const birthYear = parseInt(birthday.split("-")[0], 10)
            ageAtFilming = firstAirYearNum - birthYear
          }

          // Get the main character name from roles
          const mainRole = castMember.roles?.[0]
          const characterName = mainRole?.character || null

          appearances.push({
            actor_id: actorId ?? 0, // 0 is placeholder for dry-run
            show_tmdb_id: show.id,
            season_number: 1, // Placeholder - we're tracking at show level for now
            episode_number: 1, // Placeholder
            character_name: characterName,
            appearance_type: "regular" as const,
            billing_order: index,
            age_at_filming: ageAtFilming,
          })
        }

        if (!dryRun) {
          await batchUpsertShowActorAppearances(appearances)
        }
        totalActorAppearances += appearances.length

        console.log(`  ${dryRun ? "Would save" : "Saved"} ${appearances.length} actor appearances`)

        // Small delay between shows
        await delay(100)
      } catch (error) {
        console.error(`  Error processing show: ${error}`)
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log(`${dryRun ? "DRY RUN " : ""}SUMMARY:`)
    console.log(`  Total shows ${dryRun ? "would be " : ""}saved: ${totalShowsSaved}`)
    console.log(`  Total actor appearances: ${totalActorAppearances}`)
    console.log("\nDone!")
    process.exit(0)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

async function fetchPopularShows(limit: number): Promise<TMDBTVShow[]> {
  const shows: TMDBTVShow[] = []
  const seenIds = new Set<number>()
  const pagesNeeded = Math.ceil(limit / 20) // TMDB returns 20 per page

  for (let page = 1; page <= pagesNeeded; page++) {
    try {
      const response = await discoverTVShows(page)

      for (const show of response.results) {
        if (!seenIds.has(show.id)) {
          seenIds.add(show.id)
          shows.push(show)
        }
      }

      // Stop if we've reached our limit or there are no more results
      if (shows.length >= limit || response.results.length === 0) {
        break
      }

      await delay(50)
    } catch (error) {
      console.error(`Error fetching page ${page}:`, error)
      break
    }
  }

  return shows.slice(0, limit)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
