/**
 * Show details route handler.
 *
 * Handles fetching and returning detailed information about a TV show,
 * including cast mortality statistics.
 */

import type { Request, Response } from "express"
import {
  getTVShowDetails,
  getTVShowAggregateCredits,
  getSeasonDetails,
  batchGetPersonDetails,
} from "../../lib/tmdb.js"
import { recordCustomEvent } from "../../lib/newrelic.js"
import {
  upsertShow,
  getDeceasedActorsForShow,
  getLivingActorsForShow,
  type ActorInput,
  type ShowRecord,
} from "../../lib/db.js"
import { getActorsIfAvailable, saveDeceasedToDb } from "../../lib/db-helpers.js"
import { calculateAge } from "../../lib/date-utils.js"
import {
  calculateMovieMortality,
  calculateYearsLost,
  type ActorForMortality,
} from "../../lib/mortality-stats.js"
import type {
  EpisodeAppearance,
  DeceasedActor,
  LivingActor,
  SeasonSummary,
  ShowResponse,
} from "./types.js"
import { SHOW_CAST_LIMIT, ENDED_STATUSES } from "./types.js"

export async function getShow(req: Request, res: Response) {
  const showId = parseInt(req.params.id, 10)

  if (!showId || isNaN(showId)) {
    return res.status(400).json({ error: { message: "Invalid show ID" } })
  }

  try {
    const startTime = Date.now()

    // Fetch show details and aggregate credits in parallel
    const [show, credits] = await Promise.all([
      getTVShowDetails(showId),
      getTVShowAggregateCredits(showId),
    ])

    // Filter to English-language US shows
    if (show.original_language !== "en" || !show.origin_country.includes("US")) {
      return res.status(404).json({ error: { message: "Show not available" } })
    }

    // Get the main character per actor (limit to reduce API calls)
    const mainCast = credits.cast.slice(0, SHOW_CAST_LIMIT).map((actor) => ({
      id: actor.id,
      name: actor.name,
      profile_path: actor.profile_path,
      character: actor.roles[0]?.character || "Unknown",
      totalEpisodes: actor.total_episode_count,
      order: actor.order,
    }))

    // Get season numbers for fetching episode details
    const seasonNumbers = show.seasons
      .filter((s) => s.season_number > 0) // Exclude specials
      .map((s) => s.season_number)

    // Skip expensive episode fetching for ended/canceled shows
    // These shows will never have new episodes, so aggregate credits suffice
    const isShowEnded = ENDED_STATUSES.includes(show.status)

    // Batch fetch person details and optionally episode appearances in parallel
    const personIds = mainCast.map((c) => c.id)
    const [personDetails, episodeAppearances] = await Promise.all([
      batchGetPersonDetails(personIds),
      isShowEnded
        ? Promise.resolve(new Map<number, EpisodeAppearance[]>())
        : fetchEpisodeAppearances(showId, seasonNumbers),
    ])

    // Check database for existing death info
    const dbRecords = await getActorsIfAvailable(personIds)

    // Separate deceased and living
    const deceased: DeceasedActor[] = []
    const living: LivingActor[] = []
    const newDeceasedForDb: ActorInput[] = []

    for (const castMember of mainCast) {
      const person = personDetails.get(castMember.id)
      const dbRecord = dbRecords.get(castMember.id)

      if (!person) {
        living.push({
          id: castMember.id,
          name: castMember.name,
          character: castMember.character,
          profile_path: castMember.profile_path,
          birthday: null,
          age: null,
          totalEpisodes: castMember.totalEpisodes,
          episodes: episodeAppearances.get(castMember.id) || [],
        })
        continue
      }

      if (person.deathday) {
        const tmdbUrl = `https://www.themoviedb.org/person/${person.id}`

        deceased.push({
          id: person.id,
          name: person.name,
          character: castMember.character,
          profile_path: person.profile_path,
          birthday: person.birthday,
          deathday: person.deathday,
          causeOfDeath: dbRecord?.cause_of_death || null,
          causeOfDeathSource: dbRecord?.cause_of_death_source || null,
          causeOfDeathDetails: dbRecord?.cause_of_death_details || null,
          causeOfDeathDetailsSource: dbRecord?.cause_of_death_details_source || null,
          wikipediaUrl: dbRecord?.wikipedia_url || null,
          tmdbUrl,
          ageAtDeath: dbRecord?.age_at_death ?? null,
          yearsLost: dbRecord?.years_lost ?? null,
          totalEpisodes: castMember.totalEpisodes,
          episodes: episodeAppearances.get(castMember.id) || [],
        })

        // Track new deceased persons to save to database
        if (!dbRecord) {
          const yearsLostResult = await calculateYearsLost(person.birthday, person.deathday)

          newDeceasedForDb.push({
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
      } else {
        living.push({
          id: person.id,
          name: person.name,
          character: castMember.character,
          profile_path: person.profile_path,
          birthday: person.birthday,
          age: calculateAge(person.birthday),
          totalEpisodes: castMember.totalEpisodes,
          episodes: episodeAppearances.get(castMember.id) || [],
        })
      }
    }

    // Save new deceased persons to database in background
    if (newDeceasedForDb.length > 0) {
      saveDeceasedToDb(newDeceasedForDb)
    }

    // Fetch deceased guest stars from database (seeded by seed-episodes-full)
    // These may not appear in aggregate credits but are in episode-level data
    if (process.env.DATABASE_URL) {
      try {
        const dbDeceasedActors = await getDeceasedActorsForShow(showId)
        const existingIds = new Set(deceased.map((d) => d.id))

        for (const dbActor of dbDeceasedActors) {
          // Skip actors without TMDB IDs for now (non-TMDB actors from TVmaze/TheTVDB)
          if (dbActor.tmdb_id === null) {
            continue
          }

          // Skip if already in deceased list from TMDB aggregate credits
          if (existingIds.has(dbActor.tmdb_id)) {
            continue
          }

          // Convert database actor to DeceasedActor format
          const tmdbUrl = `https://www.themoviedb.org/person/${dbActor.tmdb_id}`
          const firstEpisode = dbActor.episodes[0]

          deceased.push({
            id: dbActor.tmdb_id,
            name: dbActor.name,
            character: firstEpisode?.character_name || "Guest",
            profile_path: dbActor.profile_path,
            birthday: dbActor.birthday,
            deathday: dbActor.deathday,
            causeOfDeath: dbActor.cause_of_death,
            causeOfDeathSource: dbActor.cause_of_death_source,
            causeOfDeathDetails: dbActor.cause_of_death_details,
            causeOfDeathDetailsSource: dbActor.cause_of_death_details_source,
            wikipediaUrl: dbActor.wikipedia_url,
            tmdbUrl,
            ageAtDeath: dbActor.age_at_death,
            yearsLost: dbActor.years_lost,
            totalEpisodes: dbActor.total_episodes,
            episodes: dbActor.episodes.map((ep) => ({
              seasonNumber: ep.season_number,
              episodeNumber: ep.episode_number,
              episodeName: ep.episode_name || `Episode ${ep.episode_number}`,
              character: ep.character_name || "Guest",
            })),
          })
        }
      } catch (error) {
        console.error("Error fetching deceased actors from database:", error)
      }

      // Also fetch living guest stars from database (seeded by seed-episodes-full)
      try {
        const dbLivingActors = await getLivingActorsForShow(showId)
        const existingLivingIds = new Set(living.map((l) => l.id))

        for (const dbActor of dbLivingActors) {
          // Skip actors without TMDB IDs for now (non-TMDB actors from TVmaze/TheTVDB)
          if (dbActor.tmdb_id === null) {
            continue
          }

          // Skip if already in living list from TMDB aggregate credits
          if (existingLivingIds.has(dbActor.tmdb_id)) {
            continue
          }

          // Convert database actor to LivingActor format
          const firstEpisode = dbActor.episodes[0]

          living.push({
            id: dbActor.tmdb_id,
            name: dbActor.name,
            character: firstEpisode?.character_name || "Guest",
            profile_path: dbActor.profile_path,
            birthday: dbActor.birthday,
            age: calculateAge(dbActor.birthday),
            totalEpisodes: dbActor.total_episodes,
            episodes: dbActor.episodes.map((ep) => ({
              seasonNumber: ep.season_number,
              episodeNumber: ep.episode_number,
              episodeName: ep.episode_name || `Episode ${ep.episode_number}`,
              character: ep.character_name || "Guest",
            })),
          })
        }
      } catch (error) {
        console.error("Error fetching living actors from database:", error)
      }
    }

    // Sort deceased by death date (most recent first)
    deceased.sort((a, b) => {
      return new Date(b.deathday).getTime() - new Date(a.deathday).getTime()
    })

    // Sort living by total episodes (most episodes first)
    living.sort((a, b) => b.totalEpisodes - a.totalEpisodes)

    // Calculate stats
    const totalCast = deceased.length + living.length
    const deceasedCount = deceased.length
    const livingCount = living.length
    const mortalityPercentage = totalCast > 0 ? Math.round((deceasedCount / totalCast) * 100) : 0

    // Calculate mortality statistics using first air date as release year
    let expectedDeaths = 0
    let mortalitySurpriseScore = 0
    const firstAirYear = show.first_air_date ? parseInt(show.first_air_date.split("-")[0]) : null

    if (firstAirYear && totalCast > 0) {
      const allActors: ActorForMortality[] = [
        ...deceased.map((d) => ({
          tmdbId: d.id,
          name: d.name,
          birthday: d.birthday,
          deathday: d.deathday,
        })),
        ...living.map((l) => ({
          tmdbId: l.id,
          name: l.name,
          birthday: l.birthday,
          deathday: null,
        })),
      ]

      try {
        const mortalityResult = await calculateMovieMortality(firstAirYear, allActors)
        expectedDeaths = mortalityResult.expectedDeaths
        mortalitySurpriseScore = mortalityResult.mortalitySurpriseScore

        // Update deceased actors with age at death and years lost
        for (const actorResult of mortalityResult.actorResults) {
          if (actorResult.isDeceased) {
            const deceasedActor = deceased.find((d) => d.id === actorResult.tmdbId)
            if (deceasedActor) {
              if (deceasedActor.ageAtDeath === null) {
                deceasedActor.ageAtDeath = actorResult.ageAtDeath
              }
              if (deceasedActor.yearsLost === null) {
                deceasedActor.yearsLost = actorResult.yearsLost
              }
            }
          }
        }
      } catch (error) {
        console.error("Error calculating mortality stats:", error)
      }
    }

    // Transform seasons for response
    const seasons: SeasonSummary[] = show.seasons
      .filter((s) => s.season_number > 0) // Exclude "specials" (season 0)
      .map((s) => ({
        seasonNumber: s.season_number,
        name: s.name,
        airDate: s.air_date,
        episodeCount: s.episode_count,
        posterPath: s.poster_path,
      }))

    // Cache show in database in background
    cacheShowInBackground({
      show,
      deceased,
      living,
      expectedDeaths,
      mortalitySurpriseScore,
    })

    const response: ShowResponse = {
      show: {
        id: show.id,
        name: show.name,
        firstAirDate: show.first_air_date,
        lastAirDate: show.last_air_date,
        posterPath: show.poster_path,
        backdropPath: show.backdrop_path,
        overview: show.overview,
        status: show.status,
        numberOfSeasons: show.number_of_seasons,
        numberOfEpisodes: show.number_of_episodes,
        genres: show.genres,
      },
      seasons,
      deceased,
      living,
      stats: {
        totalCast,
        deceasedCount,
        livingCount,
        mortalityPercentage,
        expectedDeaths,
        mortalitySurpriseScore,
      },
    }

    recordCustomEvent("ShowView", {
      tmdbId: show.id,
      name: show.name,
      firstAirYear: firstAirYear ?? 0,
      deceasedCount,
      livingCount,
      expectedDeaths,
      curseScore: mortalitySurpriseScore,
      isEnded: isShowEnded,
      responseTimeMs: Date.now() - startTime,
    })

    res.json(response)
  } catch (error) {
    console.error("Show fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch show data" } })
  }
}

// Fetch episode appearances for all actors in a show with exponential backoff
async function fetchEpisodeAppearances(
  showId: number,
  seasonNumbers: number[]
): Promise<Map<number, EpisodeAppearance[]>> {
  const actorEpisodes = new Map<number, EpisodeAppearance[]>()

  // Fetch all seasons in parallel (with small batches to avoid rate limits)
  const batchSize = 3
  let baseDelay = 100 // Start with 100ms delay
  const maxDelay = 2000 // Max 2 seconds between batches

  for (let i = 0; i < seasonNumbers.length; i += batchSize) {
    const batch = seasonNumbers.slice(i, i + batchSize)
    let retryCount = 0
    const maxRetries = 3

    while (retryCount <= maxRetries) {
      try {
        const seasonPromises = batch.map((seasonNum) => getSeasonDetails(showId, seasonNum))
        const seasons = await Promise.all(seasonPromises)

        for (const season of seasons) {
          for (const episode of season.episodes) {
            // Process guest stars from each episode
            for (const guestStar of episode.guest_stars || []) {
              const existing = actorEpisodes.get(guestStar.id) || []
              existing.push({
                seasonNumber: season.season_number,
                episodeNumber: episode.episode_number,
                episodeName: episode.name,
                character: guestStar.character || "Unknown",
              })
              actorEpisodes.set(guestStar.id, existing)
            }
          }
        }

        // Success - reset delay on successful batch
        baseDelay = 100
        break // Exit retry loop on success
      } catch (error) {
        retryCount++
        const isRateLimit =
          error instanceof Error &&
          (error.message.includes("429") || error.message.includes("rate"))

        if (isRateLimit && retryCount <= maxRetries) {
          // Exponential backoff: 200ms, 400ms, 800ms
          const backoffDelay = baseDelay * Math.pow(2, retryCount)
          console.warn(
            `Rate limit hit for show ${showId}, retrying in ${backoffDelay}ms (attempt ${retryCount}/${maxRetries})`
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          baseDelay = Math.min(backoffDelay, maxDelay) // Increase base delay for future batches
        } else {
          console.error(`Error fetching season details for show ${showId}:`, error)
          break // Exit retry loop on non-rate-limit error or max retries exceeded
        }
      }
    }

    // Delay between batches (respects increased delay from rate limits)
    if (i + batchSize < seasonNumbers.length) {
      await new Promise((resolve) => setTimeout(resolve, baseDelay))
    }
  }

  return actorEpisodes
}

// Cache show in database in background
interface CacheShowParams {
  show: {
    id: number
    name: string
    first_air_date: string
    last_air_date: string | null
    poster_path: string | null
    backdrop_path: string | null
    genres: Array<{ id: number; name: string }>
    status: string
    number_of_seasons: number
    number_of_episodes: number
    popularity: number
    vote_average: number
    origin_country: string[]
    original_language: string
  }
  deceased: DeceasedActor[]
  living: LivingActor[]
  expectedDeaths: number
  mortalitySurpriseScore: number
}

function cacheShowInBackground(params: CacheShowParams): void {
  if (!process.env.DATABASE_URL) return

  const { show, deceased, living, expectedDeaths, mortalitySurpriseScore } = params

  const showRecord: ShowRecord = {
    tmdb_id: show.id,
    name: show.name,
    first_air_date: show.first_air_date,
    last_air_date: show.last_air_date,
    poster_path: show.poster_path,
    backdrop_path: show.backdrop_path,
    genres: show.genres.map((g) => g.name),
    status: show.status,
    number_of_seasons: show.number_of_seasons,
    number_of_episodes: show.number_of_episodes,
    popularity: show.popularity,
    vote_average: show.vote_average,
    origin_country: show.origin_country,
    original_language: show.original_language,
    cast_count: deceased.length + living.length,
    deceased_count: deceased.length,
    living_count: living.length,
    expected_deaths: expectedDeaths,
    mortality_surprise_score: mortalitySurpriseScore,
    tvmaze_id: null,
    thetvdb_id: null,
    imdb_id: null,
  }

  upsertShow(showRecord).catch((error) => {
    console.error("Show cache error:", error)
  })
}
