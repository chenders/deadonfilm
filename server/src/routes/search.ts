import type { Request, Response } from "express"
import { searchMovies as tmdbSearch } from "../lib/tmdb.js"

export async function searchMovies(req: Request, res: Response) {
  const query = req.query.q as string

  if (!query || query.length < 2) {
    return res.json({ results: [], page: 1, total_pages: 0, total_results: 0 })
  }

  try {
    const data = await tmdbSearch(query)

    // Sort by popularity (highest first) then take top 10
    const sortedResults = [...data.results]
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .slice(0, 10)

    const results = sortedResults.map((movie) => ({
      id: movie.id,
      title: movie.title,
      release_date: movie.release_date,
      poster_path: movie.poster_path,
      overview: movie.overview,
    }))

    res.json({
      results,
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
    })
  } catch (error) {
    console.error("Search error:", error)
    res.status(500).json({ error: { message: "Failed to search movies" } })
  }
}
