import type { Request, Response } from "express"
import { getPersonDetails } from "../lib/tmdb.js"
import {
  getActorFilmography,
  getActorShowFilmography,
  getActor as getActorRecord,
  hasDetailedDeathInfo,
} from "../lib/db.js"
import { recordCustomEvent } from "../lib/newrelic.js"
import { getCached, setCached, buildCacheKey, CACHE_PREFIX, CACHE_TTL } from "../lib/cache.js"

interface ActorProfileResponse {
  actor: {
    id: number
    name: string
    birthday: string | null
    deathday: string | null
    biography: string
    profilePath: string | null
    placeOfBirth: string | null
  }
  analyzedFilmography: Array<{
    movieId: number
    title: string
    releaseYear: number | null
    character: string | null
    posterPath: string | null
    deceasedCount: number
    castCount: number
  }>
  analyzedTVFilmography: Array<{
    showId: number
    name: string
    firstAirYear: number | null
    lastAirYear: number | null
    character: string | null
    posterPath: string | null
    deceasedCount: number
    castCount: number
    episodeCount: number
  }>
  deathInfo: {
    causeOfDeath: string | null
    causeOfDeathDetails: string | null
    wikipediaUrl: string | null
    ageAtDeath: number | null
    yearsLost: number | null
    hasDetailedDeathInfo: boolean
  } | null
}

export async function getActor(req: Request, res: Response) {
  const actorId = parseInt(req.params.id, 10)

  if (!actorId || isNaN(actorId)) {
    return res.status(400).json({ error: { message: "Invalid actor ID" } })
  }

  try {
    const startTime = Date.now()
    const cacheKey = buildCacheKey(CACHE_PREFIX.ACTOR, { id: actorId })

    // Check cache first
    const cached = await getCached<ActorProfileResponse>(cacheKey)
    if (cached) {
      recordCustomEvent("ActorView", {
        tmdbId: actorId,
        name: cached.actor.name,
        isDeceased: !!cached.actor.deathday,
        filmographyCount: cached.analyzedFilmography.length,
        tvFilmographyCount: cached.analyzedTVFilmography.length,
        hasCauseOfDeath: !!cached.deathInfo?.causeOfDeath,
        responseTimeMs: Date.now() - startTime,
        cacheHit: true,
      })
      return res.set("Cache-Control", "public, max-age=600").json(cached)
    }

    // Fetch actor details from TMDB and filmographies in parallel
    const [person, filmography, tvFilmography] = await Promise.all([
      getPersonDetails(actorId),
      getActorFilmography(actorId),
      getActorShowFilmography(actorId),
    ])

    // Get death info if deceased
    let deathInfo: ActorProfileResponse["deathInfo"] = null
    if (person.deathday) {
      const [deceasedRecord, hasDetailedInfo] = await Promise.all([
        getActorRecord(actorId),
        hasDetailedDeathInfo(actorId),
      ])
      if (deceasedRecord) {
        deathInfo = {
          causeOfDeath: deceasedRecord.cause_of_death,
          causeOfDeathDetails: deceasedRecord.cause_of_death_details,
          wikipediaUrl: deceasedRecord.wikipedia_url,
          ageAtDeath: deceasedRecord.age_at_death,
          yearsLost: deceasedRecord.years_lost,
          hasDetailedDeathInfo: hasDetailedInfo,
        }
      } else {
        // Basic death info from TMDB only
        deathInfo = {
          causeOfDeath: null,
          causeOfDeathDetails: null,
          wikipediaUrl: null,
          ageAtDeath: calculateAge(person.birthday, person.deathday),
          yearsLost: null,
          hasDetailedDeathInfo: hasDetailedInfo,
        }
      }
    }

    const response: ActorProfileResponse = {
      actor: {
        id: person.id,
        name: person.name,
        birthday: person.birthday,
        deathday: person.deathday,
        biography: person.biography,
        profilePath: person.profile_path,
        placeOfBirth: person.place_of_birth,
      },
      analyzedFilmography: filmography,
      analyzedTVFilmography: tvFilmography,
      deathInfo,
    }

    // Cache the response
    await setCached(cacheKey, response, CACHE_TTL.WEEK)

    recordCustomEvent("ActorView", {
      tmdbId: actorId,
      name: person.name,
      isDeceased: !!person.deathday,
      filmographyCount: filmography.length,
      tvFilmographyCount: tvFilmography.length,
      hasCauseOfDeath: !!deathInfo?.causeOfDeath,
      responseTimeMs: Date.now() - startTime,
      cacheHit: false,
    })

    res.set("Cache-Control", "public, max-age=600").json(response)
  } catch (error) {
    console.error("Actor fetch error:", error)
    res.status(500).json({ error: { message: "Failed to fetch actor data" } })
  }
}

function calculateAge(birthday: string | null, deathday: string | null): number | null {
  if (!birthday || !deathday) return null

  const birth = new Date(birthday)
  const death = new Date(deathday)
  let age = death.getFullYear() - birth.getFullYear()
  const monthDiff = death.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && death.getDate() < birth.getDate())) {
    age--
  }

  return age
}
