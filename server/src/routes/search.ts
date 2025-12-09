import type { Request, Response } from "express"
import { searchMovies as tmdbSearch, type TMDBMovie } from "../lib/tmdb.js"

/**
 * Detect if a query is a 4-digit year (1900-2099)
 */
function parseYearQuery(query: string): number | null {
  const trimmed = query.trim()
  if (!/^\d{4}$/.test(trimmed)) {
    return null
  }
  const year = parseInt(trimmed, 10)
  if (year >= 1900 && year <= 2099) {
    return year
  }
  return null
}

/**
 * Calculate a relevance score for a movie based on query matching.
 * Higher scores = better matches.
 */
function calculateRelevance(movie: TMDBMovie, query: string): number {
  const normalizedQuery = query.toLowerCase().trim()
  const normalizedTitle = movie.title.toLowerCase()
  let score = 0

  // Exact title match
  if (normalizedTitle === normalizedQuery) {
    score += 100
  }
  // Title starts with query
  else if (normalizedTitle.startsWith(normalizedQuery)) {
    score += 50
  }
  // Title contains query as a word boundary match
  // eslint-disable-next-line security/detect-non-literal-regexp -- input is escaped via escapeRegex()
  else if (new RegExp(`\\b${escapeRegex(normalizedQuery)}\\b`).test(normalizedTitle)) {
    score += 30
  }
  // Title contains query anywhere
  else if (normalizedTitle.includes(normalizedQuery)) {
    score += 20
  }

  // Year match bonus - if query is a year and movie is from that year
  const yearQuery = parseYearQuery(query)
  if (yearQuery && movie.release_date?.startsWith(String(yearQuery))) {
    score += 75
  }

  return score
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function searchMovies(req: Request, res: Response) {
  const query = req.query.q as string

  if (!query || query.length < 2) {
    return res.json({ results: [], page: 1, total_pages: 0, total_results: 0 })
  }

  try {
    const data = await tmdbSearch(query)

    // Sort by relevance score (highest first), preserving TMDB order for ties
    const sortedResults = [...data.results]
      .map((movie, index) => ({ movie, score: calculateRelevance(movie, query), index }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 10)
      .map(({ movie }) => movie)

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
