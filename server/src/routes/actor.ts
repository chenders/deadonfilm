import type { Request, Response } from "express"
import { getPersonDetails } from "../lib/tmdb.js"
import {
  getActorFilmography,
  getActorShowFilmography,
  hasDetailedDeathInfo,
  getActorByEitherIdWithSlug,
} from "../lib/db.js"
import newrelic from "newrelic"
import { getCached, setCached, CACHE_KEYS, CACHE_TTL } from "../lib/cache.js"
import { calculateAge } from "../lib/date-utils.js"
import { createActorSlug } from "../lib/slug-utils.js"

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

/**
 * Extract numeric actor ID from URL slug.
 * Slug format: "actor-name-12345" -> 12345
 */
function extractActorId(slug: string): number | null {
  const parts = slug.split("-")
  const lastPart = parts[parts.length - 1]
  const id = parseInt(lastPart, 10)
  return isNaN(id) ? null : id
}

export async function getActor(req: Request, res: Response) {
  const slug = req.params.slug // Full slug like "john-wayne-4165"
  const numericId = extractActorId(slug)

  if (!numericId || isNaN(numericId)) {
    return res.status(400).json({ error: { message: "Invalid actor ID" } })
  }

  try {
    const startTime = Date.now()

    // Look up actor by EITHER id or tmdb_id, WITH SLUG VALIDATION
    const actorLookup = await getActorByEitherIdWithSlug(numericId, slug)

    if (!actorLookup) {
      return res.status(404).json({ error: { message: "Actor not found" } })
    }

    const { actor: actorRecord, matchedBy } = actorLookup

    // If matched by tmdb_id, redirect to canonical URL with actor.id
    if (matchedBy === "tmdb_id") {
      // Track redirect event for migration monitoring
      const userAgent = req.headers["user-agent"]
      const referer = req.headers["referer"] || req.headers["referrer"]
      newrelic.recordCustomEvent("ActorUrlRedirect", {
        actorId: actorRecord.id,
        ...(actorRecord.tmdb_id !== null && { tmdbId: actorRecord.tmdb_id }),
        actorName: actorRecord.name,
        slug: slug,
        matchType: "tmdb_id",
        endpoint: "profile",
        ...(userAgent && { userAgent }),
        ...(referer && { referer: Array.isArray(referer) ? referer[0] : referer }),
      })

      const canonicalSlug = createActorSlug(actorRecord.name, actorRecord.id)
      return res.redirect(301, `/api/actor/${canonicalSlug}`)
    }

    // Use actor.id for cache key (not tmdb_id)
    const cacheKey = CACHE_KEYS.actor(actorRecord.id).profile

    // Check cache first
    const cached = await getCached<ActorProfileResponse>(cacheKey)
    if (cached) {
      newrelic.recordCustomEvent("ActorView", {
        actorId: actorRecord.id,
        ...(actorRecord.tmdb_id !== null && { tmdbId: actorRecord.tmdb_id }),
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

    // Fetch actor details from TMDB using tmdb_id (if available, otherwise use actor.id)
    const tmdbIdForFetch = actorRecord.tmdb_id ?? actorRecord.id
    const [person, filmography, tvFilmography] = await Promise.all([
      getPersonDetails(tmdbIdForFetch),
      getActorFilmography(tmdbIdForFetch),
      getActorShowFilmography(tmdbIdForFetch),
    ])

    // Get death info if deceased
    let deathInfo: ActorProfileResponse["deathInfo"] = null
    if (person.deathday) {
      // We already have the actor record from the lookup, no need to fetch again
      // Just need to check if detailed death info exists
      const hasDetailedInfo = await hasDetailedDeathInfo(tmdbIdForFetch)

      deathInfo = {
        causeOfDeath: actorRecord.cause_of_death,
        causeOfDeathDetails: actorRecord.cause_of_death_details,
        wikipediaUrl: actorRecord.wikipedia_url,
        ageAtDeath: actorRecord.age_at_death ?? calculateAge(person.birthday, person.deathday),
        yearsLost: actorRecord.years_lost,
        hasDetailedDeathInfo: hasDetailedInfo,
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

    newrelic.recordCustomEvent("ActorView", {
      actorId: actorRecord.id,
      ...(actorRecord.tmdb_id !== null && { tmdbId: actorRecord.tmdb_id }),
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
