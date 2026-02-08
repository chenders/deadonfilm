/**
 * API routes for related content recommendations.
 *
 * Routes:
 * - GET /api/actor/:id/related - Related actors by cause of death or birth decade
 * - GET /api/movie/:id/related - Related movies by shared cast members
 * - GET /api/show/:id/related - Related shows by shared cast members
 */

import type { Request, Response } from "express"
import { getPool } from "../lib/db.js"
import {
  getRelatedActors,
  getRelatedMovies,
  getRelatedShows,
  type RelatedActor,
  type RelatedMovie,
  type RelatedShow,
} from "../lib/db/related-content.js"
import { getCached, setCached, buildCacheKey, CACHE_TTL } from "../lib/cache.js"
import { sendWithETag } from "../lib/etag.js"

// ============================================================================
// Types
// ============================================================================

interface RelatedActorsResponse {
  actors: RelatedActor[]
}

interface RelatedMoviesResponse {
  movies: RelatedMovie[]
}

interface RelatedShowsResponse {
  shows: RelatedShow[]
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Derive the birth decade start year from a birthday string.
 * E.g., "1945-06-15" -> 1940
 */
function getBirthDecade(birthday: string | null): number | null {
  if (!birthday) return null
  const year = parseInt(birthday.split("-")[0], 10)
  if (isNaN(year)) return null
  return Math.floor(year / 10) * 10
}

// ============================================================================
// Route handlers
// ============================================================================

/**
 * Handler for GET /api/actor/:id/related
 * Returns actors related by same cause of death or same birth decade.
 */
export async function getRelatedActorsRoute(req: Request, res: Response) {
  const actorId = parseInt(req.params.id, 10)

  if (!actorId || isNaN(actorId)) {
    return res.status(400).json({ error: { message: "Invalid actor ID" } })
  }

  try {
    const cacheKey = buildCacheKey("related-actors", { id: actorId })

    const cached = await getCached<RelatedActorsResponse>(cacheKey)
    if (cached) {
      return sendWithETag(req, res, cached, CACHE_TTL.WEEK)
    }

    // Look up actor's cause_of_death and birthday
    const db = getPool()
    const actorResult = await db.query(
      "SELECT cause_of_death, birthday FROM actors WHERE id = $1",
      [actorId]
    )

    if (actorResult.rows.length === 0) {
      return res.status(404).json({ error: { message: "Actor not found" } })
    }

    const actor = actorResult.rows[0]
    const birthDecade = getBirthDecade(actor.birthday)

    const actors = await getRelatedActors(actorId, actor.cause_of_death, birthDecade)

    const response: RelatedActorsResponse = { actors }

    // Skip caching empty results — data may not be populated yet
    if (actors.length > 0) {
      await setCached(cacheKey, response, CACHE_TTL.WEEK)
    }
    sendWithETag(req, res, response, CACHE_TTL.WEEK)
  } catch (error) {
    console.error("Related actors error:", error)
    res.status(500).json({ error: { message: "Failed to fetch related actors" } })
  }
}

/**
 * Handler for GET /api/movie/:id/related
 * Returns movies related by shared cast members.
 */
export async function getRelatedMoviesRoute(req: Request, res: Response) {
  const movieId = parseInt(req.params.id, 10)

  if (!movieId || isNaN(movieId)) {
    return res.status(400).json({ error: { message: "Invalid movie ID" } })
  }

  try {
    const cacheKey = buildCacheKey("related-movies", { id: movieId })

    const cached = await getCached<RelatedMoviesResponse>(cacheKey)
    if (cached) {
      return sendWithETag(req, res, cached, CACHE_TTL.WEEK)
    }

    const movies = await getRelatedMovies(movieId)

    const response: RelatedMoviesResponse = { movies }

    // Skip caching empty results — data may not be populated yet
    if (movies.length > 0) {
      await setCached(cacheKey, response, CACHE_TTL.WEEK)
    }
    sendWithETag(req, res, response, CACHE_TTL.WEEK)
  } catch (error) {
    console.error("Related movies error:", error)
    res.status(500).json({ error: { message: "Failed to fetch related movies" } })
  }
}

/**
 * Handler for GET /api/show/:id/related
 * Returns shows related by shared cast members.
 */
export async function getRelatedShowsRoute(req: Request, res: Response) {
  const showId = parseInt(req.params.id, 10)

  if (!showId || isNaN(showId)) {
    return res.status(400).json({ error: { message: "Invalid show ID" } })
  }

  try {
    const cacheKey = buildCacheKey("related-shows", { id: showId })

    const cached = await getCached<RelatedShowsResponse>(cacheKey)
    if (cached) {
      return sendWithETag(req, res, cached, CACHE_TTL.WEEK)
    }

    const shows = await getRelatedShows(showId)

    const response: RelatedShowsResponse = { shows }

    // Skip caching empty results — data may not be populated yet
    if (shows.length > 0) {
      await setCached(cacheKey, response, CACHE_TTL.WEEK)
    }
    sendWithETag(req, res, response, CACHE_TTL.WEEK)
  } catch (error) {
    console.error("Related shows error:", error)
    res.status(500).json({ error: { message: "Failed to fetch related shows" } })
  }
}
