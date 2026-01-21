/**
 * Show search route handler.
 *
 * Handles searching for TV shows using the TMDB API.
 */

import type { Request, Response } from "express"
import { searchTVShows as tmdbSearchTVShows, type TMDBTVShow } from "../../lib/tmdb.js"
import newrelic from "newrelic"

export async function searchShows(req: Request, res: Response) {
  const queryParam = req.query.q
  // Handle array case from query string (e.g., ?q=a&q=b)
  const query = Array.isArray(queryParam) ? queryParam[0] : queryParam

  if (!query || typeof query !== "string" || query.length < 2) {
    return res.json({ results: [], page: 1, total_pages: 0, total_results: 0 })
  }

  try {
    for (const [key, value] of Object.entries({
      "query.entity": "show",
      "query.operation": "search",
      "query.term": query.substring(0, 100), // Limit to 100 chars for safety
    })) {
      newrelic.addCustomAttribute(key, value)
    }

    const data = await tmdbSearchTVShows(query)

    // Sort by relevance
    const sortedResults = [...data.results]
      .map((show, index) => ({ show, score: calculateRelevance(show, query), index }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 10)
      .map(({ show }) => show)

    const results = sortedResults.map((show) => ({
      id: show.id,
      name: show.name,
      first_air_date: show.first_air_date,
      poster_path: show.poster_path,
      overview: show.overview,
    }))

    res.json({
      results,
      page: data.page,
      total_pages: data.total_pages,
      total_results: data.total_results,
    })
  } catch (error) {
    console.error("Search error:", error)
    res.status(500).json({ error: { message: "Failed to search TV shows" } })
  }
}

function calculateRelevance(show: TMDBTVShow, query: string): number {
  const normalizedQuery = query.toLowerCase().trim()
  const normalizedName = show.name.toLowerCase()
  let score = 0

  if (normalizedName === normalizedQuery) {
    score += 100
  } else if (normalizedName.startsWith(normalizedQuery)) {
    score += 50
  } else if (normalizedName.includes(normalizedQuery)) {
    score += 20
  }

  // Boost by popularity
  score += Math.min(show.popularity / 10, 10)

  return score
}
