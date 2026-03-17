/**
 * Show details route handler.
 *
 * Handles fetching and returning detailed information about a TV show,
 * including cast mortality statistics. Uses DB-first pattern: queries
 * actor_show_appearances for cast with internal actor IDs, falling back
 * to TMDB if the show hasn't been seeded yet.
 */

import type { Request, Response } from "express"
import {
  getTVShowDetails,
  getTVShowAggregateCredits,
  getSeasonDetails,
  batchGetPersonDetails,
} from "../../lib/tmdb.js"
import newrelic from "newrelic"
import {
  batchUpsertActors,
  upsertShow,
  getDeceasedActorsForShow,
  getLivingActorsForShow,
  getShow as getShowFromDb,
  getShowWithCast,
  type ActorInput,
  type ShowRecord,
  type ShowCastRow,
} from "../../lib/db.js"
import { getActorsIfAvailable } from "../../lib/db-helpers.js"
import { calculateAge } from "../../lib/date-utils.js"
import { calculateMovieMortality, type ActorForMortality } from "../../lib/mortality-stats.js"
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

    for (const [key, value] of Object.entries({
      "query.entity": "show",
      "query.operation": "fetch",
      "query.showId": showId,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    // Fetch show details from TMDB (for overview, status, seasons, genres, language filter)
    // and try DB for cast + show record, all in parallel
    const [show, dbShow, dbCast] = await Promise.all([
      getTVShowDetails(showId),
      getShowFromDb(showId).catch(() => null),
      getShowWithCast(showId).catch(() => []),
    ])

    // Filter to English-language shows
    if (show.original_language !== "en") {
      return res.status(404).json({ error: { message: "Show not available" } })
    }

    const isShowEnded = ENDED_STATUSES.includes(show.status)
    const deceased: DeceasedActor[] = []
    const living: LivingActor[] = []

    if (dbCast.length > 0) {
      // ── DB-first path: build cast from database (internal actor IDs) ──
      // All actor data including death info comes from a single SQL JOIN.
      // Skips TMDB aggregate credits and person detail calls entirely.
      buildShowCastFromDbRows(dbCast, deceased, living)
    } else {
      // ── TMDB fallback path: fetch credits + person details, seed to DB ──
      await buildShowCastFromTmdb(showId, isShowEnded, deceased, living)

      // Supplement with DB guest stars not in TMDB aggregate credits
      await supplementWithDbGuestStars(showId, deceased, living)
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
      // Include aggregate score if available from database
      aggregateScore: dbShow?.aggregate_score ?? null,
      aggregateConfidence: dbShow?.aggregate_confidence ?? null,
    }

    newrelic.recordCustomEvent("ShowView", {
      tmdbId: show.id,
      name: show.name,
      firstAirYear: firstAirYear ?? 0,
      deceasedCount,
      livingCount,
      expectedDeaths,
      curseScore: mortalitySurpriseScore,
      isEnded: isShowEnded,
      dbFirst: dbCast.length > 0,
      responseTimeMs: Date.now() - startTime,
    })

    res.json(response)
  } catch (error) {
    console.error("Show fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch show data" } })
  }
}

// ── DB-first path: build cast from database rows ──

function buildShowCastFromDbRows(
  dbCast: ShowCastRow[],
  deceased: DeceasedActor[],
  living: LivingActor[]
): void {
  for (const row of dbCast) {
    const tmdbUrl = row.actor_tmdb_id
      ? `https://www.themoviedb.org/person/${row.actor_tmdb_id}`
      : ""

    if (row.deathday) {
      deceased.push({
        id: row.actor_id,
        name: row.name,
        character: row.character_name || "Unknown",
        profile_path: row.profile_path,
        birthday: row.birthday,
        deathday: row.deathday,
        causeOfDeath: row.cause_of_death,
        causeOfDeathSource: row.cause_of_death_source,
        causeOfDeathDetails: row.cause_of_death_details,
        causeOfDeathDetailsSource: row.cause_of_death_details_source,
        wikipediaUrl: row.wikipedia_url,
        tmdbUrl,
        ageAtDeath: row.age_at_death,
        yearsLost: row.years_lost,
        totalEpisodes: row.total_episodes,
        episodes: [], // Per-episode details available via season/episode pages
      })
    } else {
      living.push({
        id: row.actor_id,
        name: row.name,
        character: row.character_name || "Unknown",
        profile_path: row.profile_path,
        birthday: row.birthday,
        age: calculateAge(row.birthday),
        totalEpisodes: row.total_episodes,
        episodes: [],
      })
    }
  }
}

// ── TMDB fallback path: fetch credits + person details ──

async function buildShowCastFromTmdb(
  showId: number,
  isShowEnded: boolean,
  deceased: DeceasedActor[],
  living: LivingActor[]
): Promise<void> {
  const credits = await getTVShowAggregateCredits(showId)

  const mainCast = credits.cast.slice(0, SHOW_CAST_LIMIT).map((actor) => ({
    id: actor.id,
    name: actor.name,
    profile_path: actor.profile_path,
    character: actor.roles[0]?.character || "Unknown",
    totalEpisodes: actor.total_episode_count,
    order: actor.order,
    known_for_department: actor.known_for_department,
  }))

  // Get season numbers for fetching episode details
  // (only for ongoing shows — ended shows skip this)
  const personIds = mainCast.map((c) => c.id)
  const [personDetails, episodeAppearances] = await Promise.all([
    batchGetPersonDetails(personIds),
    isShowEnded
      ? Promise.resolve(new Map<number, EpisodeAppearance[]>())
      : fetchEpisodeAppearances(showId),
  ])

  // Upsert actors to get TMDB ID → internal ID mapping
  const actorInputs: ActorInput[] = mainCast.map((castMember) => {
    const person = personDetails.get(castMember.id)
    return {
      tmdb_id: castMember.id,
      name: castMember.name,
      birthday: person?.birthday ?? null,
      deathday: person?.deathday ?? null,
      profile_path: person?.profile_path ?? null,
      known_for_department: castMember.known_for_department ?? null,
    }
  })

  let tmdbToActorId = new Map<number, number>()
  try {
    tmdbToActorId = await batchUpsertActors(actorInputs)
  } catch (error) {
    console.error("Actor upsert error in show TMDB fallback:", error)
  }

  // Check database for existing death info
  const dbRecords = await getActorsIfAvailable(personIds)

  for (const castMember of mainCast) {
    const person = personDetails.get(castMember.id)
    const dbRecord = dbRecords.get(castMember.id)
    const actorId = tmdbToActorId.get(castMember.id) ?? castMember.id

    if (!person) {
      living.push({
        id: actorId,
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
        id: actorId,
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
    } else {
      living.push({
        id: actorId,
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
}

// ── Supplement TMDB cast with DB guest stars ──

async function supplementWithDbGuestStars(
  showId: number,
  deceased: DeceasedActor[],
  living: LivingActor[]
): Promise<void> {
  if (!process.env.DATABASE_URL) return

  // Fetch deceased guest stars from database (seeded by seed-episodes-full)
  try {
    const dbDeceasedActors = await getDeceasedActorsForShow(showId)
    // Use internal actor IDs for dedup (deceased[].id is now internal ID)
    const existingIds = new Set(deceased.map((d) => d.id))

    for (const dbActor of dbDeceasedActors) {
      // Skip if already in deceased list (compare by internal ID)
      if (existingIds.has(dbActor.id)) {
        continue
      }

      const tmdbUrl = dbActor.tmdb_id ? `https://www.themoviedb.org/person/${dbActor.tmdb_id}` : ""
      const firstEpisode = dbActor.episodes[0]

      deceased.push({
        id: dbActor.id, // Internal actor ID
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

  // Also fetch living guest stars from database
  try {
    const dbLivingActors = await getLivingActorsForShow(showId)
    const existingLivingIds = new Set(living.map((l) => l.id))

    for (const dbActor of dbLivingActors) {
      // Skip if already in living list (compare by internal ID)
      if (existingLivingIds.has(dbActor.id)) {
        continue
      }

      living.push({
        id: dbActor.id, // Internal actor ID
        name: dbActor.name,
        character: dbActor.episodes[0]?.character_name || "Guest",
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

// ── Episode appearances fetcher (TMDB, for ongoing shows only) ──

async function fetchEpisodeAppearances(showId: number): Promise<Map<number, EpisodeAppearance[]>> {
  const actorEpisodes = new Map<number, EpisodeAppearance[]>()

  // Get season numbers from show details
  let show
  try {
    show = await getTVShowDetails(showId)
  } catch {
    return actorEpisodes
  }

  const seasonNumbers = show.seasons.filter((s) => s.season_number > 0).map((s) => s.season_number)

  // Fetch all seasons in parallel (with small batches to avoid rate limits)
  const batchSize = 3
  let baseDelay = 100
  const maxDelay = 2000

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

        baseDelay = 100
        break
      } catch (error) {
        retryCount++
        const isRateLimit =
          error instanceof Error &&
          (error.message.includes("429") || error.message.includes("rate"))

        if (isRateLimit && retryCount <= maxRetries) {
          const backoffDelay = baseDelay * Math.pow(2, retryCount)
          console.warn(
            `Rate limit hit for show ${showId}, retrying in ${backoffDelay}ms (attempt ${retryCount}/${maxRetries})`
          )
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
          baseDelay = Math.min(backoffDelay, maxDelay)
        } else {
          console.error(`Error fetching season details for show ${showId}:`, error)
          break
        }
      }
    }

    if (i + batchSize < seasonNumbers.length) {
      await new Promise((resolve) => setTimeout(resolve, baseDelay))
    }
  }

  return actorEpisodes
}

// ── Background caching ──

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
    tmdb_popularity: show.popularity,
    tmdb_vote_average: show.vote_average,
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
