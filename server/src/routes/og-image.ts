/**
 * OG image route handler.
 *
 * Serves dynamically generated 1200x630 branded PNG images for social sharing.
 * Route: GET /og/:type/:id.png
 *
 * Supports movie, actor, and show types. Images are cached in Redis with a
 * 1-week TTL. On generation failure, redirects to the TMDB image as fallback.
 */

import type { Request, Response } from "express"
import { getMovie } from "../lib/db/movies.js"
import { getActor } from "../lib/db/actors.js"
import { getShow } from "../lib/db/shows.js"
import { getCached, setCached, buildCacheKey, CACHE_PREFIX, CACHE_TTL } from "../lib/cache.js"
import { logger } from "../lib/logger.js"
import {
  generateMovieOgImage,
  generateActorOgImage,
  generateShowOgImage,
  fetchImageAsBase64,
} from "../lib/og-image/generator.js"

const VALID_TYPES = new Set(["movie", "actor", "show"])
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"

function extractYear(date: string | Date | null | undefined): number | null {
  if (!date) return null
  if (date instanceof Date) {
    const time = date.getTime()
    if (Number.isNaN(time)) return null
    return date.getUTCFullYear()
  }
  const year = parseInt(date.slice(0, 4), 10)
  return isNaN(year) ? null : year
}

export async function ogImageHandler(req: Request, res: Response): Promise<void> {
  const { type, id } = req.params

  if (!VALID_TYPES.has(type)) {
    res.status(400).json({ error: { message: "Invalid type. Must be movie, actor, or show." } })
    return
  }

  const numericId = parseInt(id, 10)
  if (isNaN(numericId) || numericId <= 0) {
    res.status(400).json({ error: { message: "Invalid ID." } })
    return
  }

  const cacheKey = buildCacheKey(CACHE_PREFIX.OG_IMAGE, { type, id: numericId })

  try {
    // Check Redis cache for pre-generated image
    const cached = await getCached<string>(cacheKey)
    if (cached) {
      const buffer = Buffer.from(cached, "base64")
      res.set("Content-Type", "image/png")
      res.set("Cache-Control", "public, max-age=86400")
      res.send(buffer)
      return
    }

    // Generate the image based on type
    let pngBuffer: Buffer

    if (type === "movie") {
      const movie = await getMovie(numericId)
      if (!movie) {
        res.status(404).json({ error: { message: "Movie not found." } })
        return
      }

      const posterBase64 = movie.poster_path
        ? await fetchImageAsBase64(movie.poster_path, "w342")
        : null

      pngBuffer = await generateMovieOgImage({
        title: movie.title,
        year: movie.release_year,
        posterUrl: movie.poster_path ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}` : null,
        posterBase64,
        deceasedCount: movie.deceased_count ?? 0,
        totalCast: movie.cast_count ?? 0,
      })
    } else if (type === "actor") {
      const actor = await getActor(numericId)
      if (!actor) {
        res.status(404).json({ error: { message: "Actor not found." } })
        return
      }
      const profileBase64 = actor.profile_path
        ? await fetchImageAsBase64(actor.profile_path, "h632")
        : null

      const birthYear = extractYear(actor.birthday)
      const deathYear = extractYear(actor.deathday)

      pngBuffer = await generateActorOgImage({
        name: actor.name,
        profileUrl: actor.profile_path ? `${TMDB_IMAGE_BASE}/h632${actor.profile_path}` : null,
        profileBase64,
        birthYear: birthYear ? String(birthYear) : null,
        deathYear: deathYear ? String(deathYear) : null,
        causeOfDeath: actor.cause_of_death,
        isDeceased: !!actor.deathday,
      })
    } else {
      // show
      const show = await getShow(numericId)
      if (!show) {
        res.status(404).json({ error: { message: "Show not found." } })
        return
      }
      const posterBase64 = show.poster_path
        ? await fetchImageAsBase64(show.poster_path, "w342")
        : null

      const firstAirYear = extractYear(show.first_air_date)

      pngBuffer = await generateShowOgImage({
        name: show.name,
        year: firstAirYear,
        posterUrl: show.poster_path ? `${TMDB_IMAGE_BASE}/w500${show.poster_path}` : null,
        posterBase64,
        deceasedCount: show.deceased_count ?? 0,
        totalCast: show.cast_count ?? 0,
      })
    }

    // Cache the generated image as base64
    await setCached(cacheKey, pngBuffer.toString("base64"), CACHE_TTL.WEEK)

    res.set("Content-Type", "image/png")
    res.set("Cache-Control", "public, max-age=86400")
    res.send(pngBuffer)
  } catch (err) {
    logger.error({ err: (err as Error).message, type, id: numericId }, "OG image generation failed")

    // Fallback: redirect to TMDB image if available
    const fallbackUrl = await getFallbackUrl(type, numericId)
    if (fallbackUrl) {
      res.redirect(302, fallbackUrl)
      return
    }

    res.status(500).json({ error: { message: "Image generation failed." } })
  }
}

async function getFallbackUrl(type: string, id: number): Promise<string | null> {
  try {
    if (type === "movie") {
      const movie = await getMovie(id)
      return movie?.poster_path ? `${TMDB_IMAGE_BASE}/w500${movie.poster_path}` : null
    } else if (type === "actor") {
      const actor = await getActor(id)
      return actor?.profile_path ? `${TMDB_IMAGE_BASE}/h632${actor.profile_path}` : null
    } else {
      const show = await getShow(id)
      return show?.poster_path ? `${TMDB_IMAGE_BASE}/w500${show.poster_path}` : null
    }
  } catch {
    return null
  }
}
