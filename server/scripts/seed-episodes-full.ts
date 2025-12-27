#!/usr/bin/env tsx
/**
 * Full seed script to populate seasons and episodes tables with complete data.
 * This includes guest star information and mortality statistics.
 * Use seed-episodes.ts for faster metadata-only seeding.
 *
 * Usage:
 *   npm run seed:episodes:full -- [options]
 *
 * Options:
 *   --active-only    Only process shows with status "Returning Series"
 *   --show <id>      Process a single show by TMDB ID
 *   --limit <n>      Limit number of shows to process
 *   --dry-run        Preview without writing to database
 *
 * Examples:
 *   npm run seed:episodes:full                        # Seed all shows
 *   npm run seed:episodes:full -- --active-only       # Only active shows (for cron)
 *   npm run seed:episodes:full -- --show 1400         # Only Seinfeld
 *   npm run seed:episodes:full -- --limit 10          # First 10 shows
 *   npm run seed:episodes:full -- --dry-run           # Preview what would be seeded
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import {
  getPool,
  upsertSeason,
  upsertEpisode,
  batchUpsertActors,
  type SeasonRecord,
  type EpisodeRecord,
  type ActorInput,
} from "../src/lib/db.js"
import { getSeasonDetails, getTVShowDetails, batchGetPersonDetails } from "../src/lib/tmdb.js"
import {
  calculateMovieMortality,
  calculateYearsLost,
  type ActorForMortality,
} from "../src/lib/mortality-stats.js"

export function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("seed-episodes-full")
  .description(
    "Seed seasons and episodes tables with full data including guest stars and mortality stats"
  )
  .option("-a, --active-only", "Only process shows with status 'Returning Series'")
  .option("-s, --show <id>", "Process a single show by TMDB ID", parsePositiveInt)
  .option("-l, --limit <number>", "Limit number of shows to process", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing to database")
  .action(
    async (options: { activeOnly?: boolean; show?: number; limit?: number; dryRun?: boolean }) => {
      await runSeeding(options)
    }
  )

interface SeedOptions {
  activeOnly?: boolean
  show?: number
  limit?: number
  dryRun?: boolean
}

interface ShowInfo {
  tmdb_id: number
  name: string
  first_air_date: string | null
  number_of_seasons: number | null
  status: string | null
}

async function runSeeding(options: SeedOptions) {
  const { activeOnly, show: showId, limit, dryRun } = options

  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  const modeDesc = showId ? `show ${showId}` : activeOnly ? "active shows only" : "all shows"

  console.log(`\nSeeding episodes (FULL) for ${modeDesc}${dryRun ? " (DRY RUN)" : ""}`)
  if (limit) console.log(`Limit: ${limit} shows`)
  console.log()

  try {
    const db = getPool()
    const currentYear = new Date().getFullYear()

    // Build query based on options
    let query = "SELECT tmdb_id, name, first_air_date, number_of_seasons, status FROM shows"
    const params: (number | string)[] = []

    if (showId) {
      query += " WHERE tmdb_id = $1"
      params.push(showId)
    } else if (activeOnly) {
      query += " WHERE status = $1"
      params.push("Returning Series")
    }

    query += " ORDER BY popularity DESC NULLS LAST"

    if (limit) {
      query += ` LIMIT $${params.length + 1}`
      params.push(limit)
    }

    const result = await db.query<ShowInfo>(query, params)
    const shows = result.rows

    if (shows.length === 0) {
      console.log("No shows found matching criteria")
      return
    }

    console.log(`Found ${shows.length} shows to process\n`)

    let totalSeasons = 0
    let totalEpisodes = 0
    let totalGuestStars = 0
    let newActorsSaved = 0
    let showsProcessed = 0
    let errors = 0

    for (let i = 0; i < shows.length; i++) {
      const showInfo = shows[i]
      console.log(`[${i + 1}/${shows.length}] ${showInfo.name} (${showInfo.tmdb_id})`)

      try {
        // Get fresh show details from TMDB to get current season list
        const showDetails = await getTVShowDetails(showInfo.tmdb_id)
        await delay(50)

        const seasons = showDetails.seasons || []
        const firstAirYear = showInfo.first_air_date
          ? parseInt(showInfo.first_air_date.split("-")[0], 10)
          : null

        console.log(`  Found ${seasons.length} seasons`)

        let showSeasonCount = 0
        let showEpisodeCount = 0
        let showGuestStarCount = 0

        for (const seasonSummary of seasons) {
          // Skip season 0 (specials) for now - often has inconsistent data
          if (seasonSummary.season_number === 0) {
            continue
          }

          try {
            // Fetch full season details (includes episodes with guest stars)
            const seasonDetails = await getSeasonDetails(
              showInfo.tmdb_id,
              seasonSummary.season_number
            )
            await delay(50)

            // Collect all unique guest stars from all episodes in this season
            const seasonGuestStarIds = new Set<number>()
            for (const ep of seasonDetails.episodes) {
              for (const gs of ep.guest_stars || []) {
                seasonGuestStarIds.add(gs.id)
              }
            }

            // Batch fetch person details for all guest stars in this season
            const personDetails = await batchGetPersonDetails([...seasonGuestStarIds], 20, 50)

            // Prepare actors for mortality calculation
            const seasonActors: ActorForMortality[] = []
            const newActors: ActorInput[] = []
            const seenActorIds = new Set<number>()

            for (const ep of seasonDetails.episodes) {
              for (const gs of ep.guest_stars || []) {
                if (seenActorIds.has(gs.id)) continue
                seenActorIds.add(gs.id)

                const person = personDetails.get(gs.id)
                if (person) {
                  seasonActors.push({
                    tmdbId: person.id,
                    name: person.name,
                    birthday: person.birthday,
                    deathday: person.deathday,
                  })

                  // Track new deceased actors to save
                  if (person.deathday) {
                    const yearsLostResult = await calculateYearsLost(
                      person.birthday,
                      person.deathday
                    )
                    newActors.push({
                      tmdb_id: person.id,
                      name: person.name,
                      birthday: person.birthday,
                      deathday: person.deathday,
                      cause_of_death: null,
                      cause_of_death_source: null,
                      cause_of_death_details: null,
                      cause_of_death_details_source: null,
                      wikipedia_url: null,
                      profile_path: person.profile_path,
                      age_at_death: yearsLostResult?.ageAtDeath ?? null,
                      expected_lifespan: yearsLostResult?.expectedLifespan ?? null,
                      years_lost: yearsLostResult?.yearsLost ?? null,
                    })
                  }
                }
              }
            }

            // Calculate season mortality stats
            let seasonExpectedDeaths = 0
            let seasonMortalitySurpriseScore = 0
            let seasonDeceasedCount = 0

            if (firstAirYear && seasonActors.length > 0) {
              try {
                const mortalityResult = await calculateMovieMortality(
                  firstAirYear,
                  seasonActors,
                  currentYear
                )
                seasonExpectedDeaths = mortalityResult.expectedDeaths
                seasonMortalitySurpriseScore = mortalityResult.mortalitySurpriseScore
                seasonDeceasedCount = mortalityResult.actualDeaths
              } catch (mortError) {
                console.error(`    Error calculating season mortality: ${mortError}`)
              }
            }

            // Prepare season record
            const seasonRecord: SeasonRecord = {
              show_tmdb_id: showInfo.tmdb_id,
              season_number: seasonSummary.season_number,
              name: seasonSummary.name,
              air_date: seasonSummary.air_date,
              episode_count: seasonSummary.episode_count,
              poster_path: seasonSummary.poster_path,
              cast_count: seasonActors.length,
              deceased_count: seasonDeceasedCount,
              expected_deaths: seasonExpectedDeaths,
              mortality_surprise_score: seasonMortalitySurpriseScore,
            }

            if (!dryRun) {
              await upsertSeason(seasonRecord)
            }
            showSeasonCount++
            totalSeasons++

            // Process episodes in this season
            const episodes = seasonDetails.episodes || []
            for (const ep of episodes) {
              const guestStars = ep.guest_stars || []
              let episodeDeceasedCount = 0

              // Count deceased in this episode
              for (const gs of guestStars) {
                const person = personDetails.get(gs.id)
                if (person?.deathday) {
                  episodeDeceasedCount++
                }
              }

              // Calculate episode mortality stats
              let episodeExpectedDeaths = 0
              let episodeMortalitySurpriseScore = 0

              if (firstAirYear && guestStars.length > 0) {
                const episodeActors: ActorForMortality[] = guestStars
                  .map((gs) => {
                    const person = personDetails.get(gs.id)
                    return person
                      ? {
                          tmdbId: person.id,
                          name: person.name,
                          birthday: person.birthday,
                          deathday: person.deathday,
                        }
                      : null
                  })
                  .filter((a): a is ActorForMortality => a !== null)

                if (episodeActors.length > 0) {
                  try {
                    const mortalityResult = await calculateMovieMortality(
                      firstAirYear,
                      episodeActors,
                      currentYear
                    )
                    episodeExpectedDeaths = mortalityResult.expectedDeaths
                    episodeMortalitySurpriseScore = mortalityResult.mortalitySurpriseScore
                  } catch {
                    // Ignore episode-level mortality errors
                  }
                }
              }

              const episodeRecord: EpisodeRecord = {
                show_tmdb_id: showInfo.tmdb_id,
                season_number: ep.season_number,
                episode_number: ep.episode_number,
                name: ep.name,
                air_date: ep.air_date,
                runtime: ep.runtime,
                cast_count: guestStars.length,
                deceased_count: episodeDeceasedCount,
                guest_star_count: guestStars.length,
                expected_deaths: episodeExpectedDeaths,
                mortality_surprise_score: episodeMortalitySurpriseScore,
              }

              if (!dryRun) {
                await upsertEpisode(episodeRecord)
              }
              showEpisodeCount++
              totalEpisodes++
              showGuestStarCount += guestStars.length
            }

            // Save new actors to database
            if (!dryRun && newActors.length > 0) {
              try {
                await batchUpsertActors(newActors)
                newActorsSaved += newActors.length
              } catch (actorError) {
                console.error(`    Error saving actors: ${actorError}`)
              }
            }

            totalGuestStars += seasonActors.length
          } catch (seasonError) {
            console.error(
              `  Error processing season ${seasonSummary.season_number}: ${seasonError}`
            )
            errors++
          }
        }

        console.log(
          `  ${dryRun ? "Would save" : "Saved"} ${showSeasonCount} seasons, ${showEpisodeCount} episodes, ${showGuestStarCount} guest stars`
        )
        showsProcessed++

        // Small delay between shows
        await delay(100)
      } catch (showError) {
        console.error(`  Error processing show: ${showError}`)
        errors++
      }
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log(`${dryRun ? "DRY RUN " : ""}SUMMARY:`)
    console.log(`  Shows processed: ${showsProcessed}`)
    console.log(`  Total seasons ${dryRun ? "would be " : ""}saved: ${totalSeasons}`)
    console.log(`  Total episodes ${dryRun ? "would be " : ""}saved: ${totalEpisodes}`)
    console.log(`  Total unique guest stars: ${totalGuestStars}`)
    if (!dryRun) {
      console.log(`  New deceased actors saved: ${newActorsSaved}`)
    }
    if (errors > 0) {
      console.log(`  Errors: ${errors}`)
    }
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
