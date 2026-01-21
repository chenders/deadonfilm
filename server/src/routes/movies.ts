import { Request, Response } from "express"
import { getGenreCategories, getMoviesByGenre, getGenreFromSlug } from "../lib/db.js"
import { sendWithETag } from "../lib/etag.js"
import { getCached, setCached, buildCacheKey, CACHE_PREFIX, CACHE_TTL } from "../lib/cache.js"
import newrelic from "newrelic"

export async function getGenreCategoriesHandler(req: Request, res: Response) {
  try {
    const cacheKey = CACHE_PREFIX.GENRES

    type GenresResponse = { genres: Awaited<ReturnType<typeof getGenreCategories>> }

    const cached = await getCached<GenresResponse>(cacheKey)
    if (cached) {
      return sendWithETag(req, res, cached, CACHE_TTL.WEEK)
    }

    for (const [key, value] of Object.entries({
      "query.entity": "genre",
      "query.operation": "list",
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    const genres = await getGenreCategories()
    const response: GenresResponse = { genres }

    await setCached(cacheKey, response, CACHE_TTL.WEEK)
    sendWithETag(req, res, response, CACHE_TTL.WEEK)
  } catch (error) {
    console.error("Error getting genre categories:", error)
    res.status(500).json({ error: { message: "Failed to load genre categories" } })
  }
}

export async function getMoviesByGenreHandler(req: Request, res: Response) {
  try {
    const genreSlug = req.params.genre

    if (!genreSlug) {
      return res.status(400).json({ error: { message: "Genre parameter is required" } })
    }

    // Find the original genre name from the slug
    const genre = await getGenreFromSlug(genreSlug)

    if (!genre) {
      return res.status(404).json({ error: { message: "Genre not found" } })
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = 50
    const offset = (page - 1) * limit

    const cacheKey = buildCacheKey(CACHE_PREFIX.CURSED_MOVIES, { genre: genreSlug, page })

    type MoviesByGenreResponse = {
      genre: string
      slug: string
      movies: Array<{
        id: number
        title: string
        releaseYear: number | null
        posterPath: string | null
        deceasedCount: number
        castCount: number
        expectedDeaths: number | null
        mortalitySurpriseScore: number | null
      }>
      pagination: {
        page: number
        pageSize: number
        totalCount: number
        totalPages: number
      }
    }

    const cached = await getCached<MoviesByGenreResponse>(cacheKey)
    if (cached) {
      return sendWithETag(req, res, cached, CACHE_TTL.WEEK)
    }

    for (const [key, value] of Object.entries({
      "query.entity": "movie",
      "query.operation": "list-by-genre",
      "query.genre": genreSlug,
      "query.page": page,
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    const { movies, totalCount } = await getMoviesByGenre(genre, { limit, offset })

    const response: MoviesByGenreResponse = {
      genre,
      slug: genreSlug,
      movies: movies.map((movie) => ({
        id: movie.tmdb_id,
        title: movie.title,
        releaseYear: movie.release_year,
        posterPath: movie.poster_path,
        deceasedCount: movie.deceased_count,
        castCount: movie.cast_count,
        expectedDeaths: movie.expected_deaths,
        mortalitySurpriseScore: movie.mortality_surprise_score,
      })),
      pagination: {
        page,
        pageSize: limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    }

    await setCached(cacheKey, response, CACHE_TTL.WEEK)
    sendWithETag(req, res, response, CACHE_TTL.WEEK)
  } catch (error) {
    console.error("Error getting movies by genre:", error)
    res.status(500).json({ error: { message: "Failed to load movies for this genre" } })
  }
}
