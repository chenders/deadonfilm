import { Request, Response } from "express"
import { getGenreCategories, getMoviesByGenre, getGenreFromSlug } from "../lib/db.js"

export async function getGenreCategoriesHandler(_req: Request, res: Response) {
  try {
    const genres = await getGenreCategories()

    res.json({ genres })
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

    const { movies, totalCount } = await getMoviesByGenre(genre, { limit, offset })

    res.json({
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
    })
  } catch (error) {
    console.error("Error getting movies by genre:", error)
    res.status(500).json({ error: { message: "Failed to load movies for this genre" } })
  }
}
