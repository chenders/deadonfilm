#!/usr/bin/env tsx
/**
 * Full seed script to populate seasons and episodes tables with complete data.
 * This includes guest star information and mortality statistics.
 * Use seed-episodes.ts for faster metadata-only seeding.
 *
 * The script automatically saves progress to a checkpoint file and resumes
 * from where it left off if interrupted. Use --fresh to start over.
 *
 * Usage:
 *   npm run seed:episodes:full -- [options]
 *
 * Options:
 *   --active-only    Only process shows with status "Returning Series"
 *   --show <id>      Process a single show by TMDB ID
 *   --limit <n>      Limit number of shows to process
 *   --dry-run        Preview without writing to database
 *   --fresh          Start fresh (ignore checkpoint)
 *
 * Examples:
 *   npm run seed:episodes:full                        # Seed all shows (resumes if interrupted)
 *   npm run seed:episodes:full -- --active-only       # Only active shows (for cron)
 *   npm run seed:episodes:full -- --show 1400         # Only Seinfeld
 *   npm run seed:episodes:full -- --limit 10          # First 10 shows
 *   npm run seed:episodes:full -- --dry-run           # Preview what would be seeded
 *   npm run seed:episodes:full -- --fresh             # Start fresh, ignore checkpoint
 */

import "dotenv/config"
import fs from "fs"
import path from "path"
import { Command, InvalidArgumentError } from "commander"
import {
  getPool,
  upsertSeason,
  upsertEpisode,
  batchUpsertActors,
  batchUpsertShowActorAppearances,
  type SeasonRecord,
  type EpisodeRecord,
  type ActorInput,
  type ShowActorAppearanceRecord,
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

/**
 * Filter out guest stars with invalid/null IDs.
 * TMDB occasionally returns guest stars with null or undefined IDs.
 */
export function filterValidGuestStars<T extends { id?: number | null }>(guestStars: T[]): T[] {
  return guestStars.filter((gs): gs is T & { id: number } => gs.id != null && gs.id > 0)
}

/**
 * Deduplicate appearances by composite key to prevent
 * "ON CONFLICT DO UPDATE command cannot affect row a second time" errors.
 * Keeps the first occurrence of each unique appearance.
 */
export function deduplicateAppearances(
  appearances: ShowActorAppearanceRecord[]
): ShowActorAppearanceRecord[] {
  const uniqueAppearances = new Map<string, ShowActorAppearanceRecord>()
  for (const appearance of appearances) {
    const key = `${appearance.actor_tmdb_id}-${appearance.show_tmdb_id}-${appearance.season_number}-${appearance.episode_number}`
    if (!uniqueAppearances.has(key)) {
      uniqueAppearances.set(key, appearance)
    }
  }
  return [...uniqueAppearances.values()]
}

// Checkpoint file to track progress
const CHECKPOINT_FILE = path.join(process.cwd(), ".seed-episodes-full-checkpoint.json")

export interface Checkpoint {
  processedShowIds: number[]
  startedAt: string
  lastUpdated: string
  stats: {
    showsProcessed: number
    totalSeasons: number
    totalEpisodes: number
    totalGuestStars: number
    newActorsSaved: number
    errors: number
  }
}

export function loadCheckpoint(filePath: string = CHECKPOINT_FILE): Checkpoint | null {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8")
      return JSON.parse(data) as Checkpoint
    }
  } catch (error) {
    console.warn("Warning: Could not load checkpoint file:", error)
  }
  return null
}

export function saveCheckpoint(checkpoint: Checkpoint, filePath: string = CHECKPOINT_FILE): void {
  try {
    checkpoint.lastUpdated = new Date().toISOString()
    fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2))
  } catch (error) {
    console.error("Warning: Could not save checkpoint:", error)
  }
}

export function deleteCheckpoint(filePath: string = CHECKPOINT_FILE): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    console.warn("Warning: Could not delete checkpoint file:", error)
  }
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
  .option("--fresh", "Start fresh, ignoring any saved checkpoint")
  .action(
    async (options: {
      activeOnly?: boolean
      show?: number
      limit?: number
      dryRun?: boolean
      fresh?: boolean
    }) => {
      await runSeeding(options)
    }
  )

interface SeedOptions {
  activeOnly?: boolean
  show?: number
  limit?: number
  dryRun?: boolean
  fresh?: boolean
}

interface ShowInfo {
  tmdb_id: number
  name: string
  first_air_date: string | Date | null
  number_of_seasons: number | null
  status: string | null
}

async function runSeeding(options: SeedOptions) {
  const { activeOnly, show: showId, limit, dryRun, fresh = false } = options

  // Check required environment variables
  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL environment variable is required (or use --dry-run)")
    process.exit(1)
  }

  // Load or create checkpoint (skip for single show mode or dry run)
  let checkpoint: Checkpoint
  const shouldUseCheckpoint = !showId && !dryRun
  const existingCheckpoint = shouldUseCheckpoint && !fresh ? loadCheckpoint() : null

  if (existingCheckpoint) {
    checkpoint = existingCheckpoint
    console.log("\n" + "=".repeat(60))
    console.log("RESUMING FROM CHECKPOINT")
    console.log("=".repeat(60))
    console.log(`Started: ${checkpoint.startedAt}`)
    console.log(`Last updated: ${checkpoint.lastUpdated}`)
    console.log(`Already processed: ${checkpoint.processedShowIds.length} shows`)
    console.log(`Use --fresh to start over`)
    console.log("=".repeat(60))
  } else {
    checkpoint = {
      processedShowIds: [],
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      stats: {
        showsProcessed: 0,
        totalSeasons: 0,
        totalEpisodes: 0,
        totalGuestStars: 0,
        newActorsSaved: 0,
        errors: 0,
      },
    }
    if (fresh && shouldUseCheckpoint) {
      deleteCheckpoint()
    }
  }

  const processedSet = new Set(checkpoint.processedShowIds)

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
    const allShows = result.rows

    if (allShows.length === 0) {
      console.log("No shows found matching criteria")
      return
    }

    // Filter out already-processed shows
    const shows = allShows.filter((s) => !processedSet.has(s.tmdb_id))

    console.log(`Found ${allShows.length} shows total`)
    if (processedSet.size > 0) {
      console.log(`Skipping ${allShows.length - shows.length} already processed`)
    }
    console.log(`Processing ${shows.length} shows\n`)

    if (shows.length === 0) {
      console.log("All shows already processed. Done!")
      if (shouldUseCheckpoint) {
        deleteCheckpoint()
      }
      process.exit(0)
    }

    // Use checkpoint stats if resuming, otherwise start fresh
    let { showsProcessed, totalSeasons, totalEpisodes, totalGuestStars, newActorsSaved, errors } =
      checkpoint.stats

    for (let i = 0; i < shows.length; i++) {
      const showInfo = shows[i]
      const totalProgress = processedSet.size + i + 1
      console.log(`[${totalProgress}/${allShows.length}] ${showInfo.name} (${showInfo.tmdb_id})`)

      try {
        // Get fresh show details from TMDB to get current season list
        const showDetails = await getTVShowDetails(showInfo.tmdb_id)
        await delay(50)

        const seasons = showDetails.seasons || []
        // Handle first_air_date as either Date object (from pg) or string
        const firstAirYear = showInfo.first_air_date
          ? showInfo.first_air_date instanceof Date
            ? showInfo.first_air_date.getFullYear()
            : parseInt(String(showInfo.first_air_date).split("-")[0], 10)
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

                  // Save ALL guest stars to actors table (both living and deceased)
                  // This ensures foreign key constraints are satisfied for actor_show_appearances
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
                  } else {
                    // Living actors - save basic info to satisfy FK constraints
                    newActors.push({
                      tmdb_id: person.id,
                      name: person.name,
                      birthday: person.birthday,
                      deathday: null,
                      profile_path: person.profile_path,
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
            const guestStarAppearances: ShowActorAppearanceRecord[] = []

            for (const ep of episodes) {
              const guestStars = filterValidGuestStars(ep.guest_stars || [])
              let episodeDeceasedCount = 0

              // Count deceased in this episode and collect appearances
              for (const gs of guestStars) {
                const person = personDetails.get(gs.id)
                if (person?.deathday) {
                  episodeDeceasedCount++
                }

                // Collect guest star appearance for database
                guestStarAppearances.push({
                  actor_tmdb_id: gs.id,
                  show_tmdb_id: showInfo.tmdb_id,
                  season_number: ep.season_number,
                  episode_number: ep.episode_number,
                  character_name: gs.character || null,
                  appearance_type: "guest",
                  billing_order: gs.order ?? null,
                  age_at_filming: null, // Could calculate from birthday and air_date
                })
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

            // Save guest star appearances to database
            // Deduplicate first to avoid "ON CONFLICT cannot affect row a second time" error
            if (!dryRun && guestStarAppearances.length > 0) {
              try {
                const uniqueAppearances = deduplicateAppearances(guestStarAppearances)
                await batchUpsertShowActorAppearances(uniqueAppearances)
              } catch (appearanceError) {
                console.error(`    Error saving appearances: ${appearanceError}`)
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

        // Save checkpoint after each successful show
        if (shouldUseCheckpoint) {
          checkpoint.processedShowIds.push(showInfo.tmdb_id)
          checkpoint.stats = {
            showsProcessed,
            totalSeasons,
            totalEpisodes,
            totalGuestStars,
            newActorsSaved,
            errors,
          }
          saveCheckpoint(checkpoint)
        }

        // Small delay between shows
        await delay(100)
      } catch (showError) {
        console.error(`  Error processing show: ${showError}`)
        errors++

        // Save checkpoint on error so we can resume
        if (shouldUseCheckpoint) {
          checkpoint.stats = {
            showsProcessed,
            totalSeasons,
            totalEpisodes,
            totalGuestStars,
            newActorsSaved,
            errors,
          }
          saveCheckpoint(checkpoint)
          console.log(
            `\nCheckpoint saved. Run again to resume from show #${checkpoint.processedShowIds.length + 1}`
          )
        }

        // Exit on first error to allow resuming
        throw showError
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
      console.log(`  Actors saved/updated: ${newActorsSaved}`)
    }
    if (errors > 0) {
      console.log(`  Errors: ${errors}`)
    }

    // All done - remove checkpoint file
    if (shouldUseCheckpoint) {
      deleteCheckpoint()
      console.log("\nAll shows processed successfully. Checkpoint cleared.")
    }

    console.log("\nDone!")
    process.exit(0)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Only run if executed directly, not when imported for testing
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  program.parse()
}
