import type { Request, Response } from "express"
import {
  searchMovies as tmdbSearchMovies,
  searchTVShows as tmdbSearchTVShows,
  type TMDBMovie,
  type TMDBTVShow,
} from "../lib/tmdb.js"

// Unified search result type
interface SearchResult {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  media_type: "movie" | "tv"
}

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
function calculateMovieRelevance(movie: TMDBMovie, query: string): number {
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
 * Calculate a relevance score for a TV show based on query matching.
 * Higher scores = better matches.
 */
function calculateTVShowRelevance(show: TMDBTVShow, query: string): number {
  const normalizedQuery = query.toLowerCase().trim()
  const normalizedName = show.name.toLowerCase()
  let score = 0

  // Exact name match
  if (normalizedName === normalizedQuery) {
    score += 100
  }
  // Name starts with query
  else if (normalizedName.startsWith(normalizedQuery)) {
    score += 50
  }
  // Name contains query as a word boundary match
  // eslint-disable-next-line security/detect-non-literal-regexp -- input is escaped via escapeRegex()
  else if (new RegExp(`\\b${escapeRegex(normalizedQuery)}\\b`).test(normalizedName)) {
    score += 30
  }
  // Name contains query anywhere
  else if (normalizedName.includes(normalizedQuery)) {
    score += 20
  }

  // Year match bonus - if query is a year and show started that year
  const yearQuery = parseYearQuery(query)
  if (yearQuery && show.first_air_date?.startsWith(String(yearQuery))) {
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

/**
 * Unified search endpoint supporting movies, TV shows, or both.
 * Query params:
 *   - q: search query (required, min 2 chars)
 *   - type: 'movie' | 'tv' | 'all' (default: 'movie' for backwards compatibility)
 */
export async function searchMovies(req: Request, res: Response) {
  const query = req.query.q as string
  const type = (req.query.type as string) || "movie"

  if (!query || query.length < 2) {
    return res.json({ results: [], page: 1, total_pages: 0, total_results: 0 })
  }

  // Validate type parameter
  if (!["movie", "tv", "all"].includes(type)) {
    return res
      .status(400)
      .json({ error: { message: "Invalid type. Must be 'movie', 'tv', or 'all'" } })
  }

  try {
    const results: SearchResult[] = []

    // Fetch movies if type is 'movie' or 'all'
    if (type === "movie" || type === "all") {
      const movieData = await tmdbSearchMovies(query)
      const movieResults = movieData.results
        .map((movie, index) => ({
          item: movie,
          score: calculateMovieRelevance(movie, query),
          index,
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, type === "all" ? 5 : 10) // Fewer per type when showing all
        .map(({ item }) => ({
          id: item.id,
          title: item.title,
          release_date: item.release_date || "",
          poster_path: item.poster_path,
          overview: item.overview || "",
          media_type: "movie" as const,
        }))
      results.push(...movieResults)
    }

    // Fetch TV shows if type is 'tv' or 'all'
    if (type === "tv" || type === "all") {
      const tvData = await tmdbSearchTVShows(query)
      const tvResults = tvData.results
        .map((show, index) => ({
          item: show,
          score: calculateTVShowRelevance(show, query),
          index,
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, type === "all" ? 5 : 10) // Fewer per type when showing all
        .map(({ item }) => ({
          id: item.id,
          title: item.name,
          release_date: item.first_air_date || "",
          poster_path: item.poster_path,
          overview: item.overview || "",
          media_type: "tv" as const,
        }))
      results.push(...tvResults)
    }

    // For 'all' type, interleave results (alternating movie/tv)
    let finalResults = results
    if (type === "all" && results.length > 0) {
      const movies = results.filter((r) => r.media_type === "movie")
      const tvShows = results.filter((r) => r.media_type === "tv")
      finalResults = []
      const maxLen = Math.max(movies.length, tvShows.length)
      for (let i = 0; i < maxLen; i++) {
        if (i < movies.length) finalResults.push(movies[i])
        if (i < tvShows.length) finalResults.push(tvShows[i])
      }
    }

    res.json({
      results: finalResults,
      page: 1,
      total_pages: 1,
      total_results: finalResults.length,
    })
  } catch (error) {
    console.error("Search error:", error)
    res.status(500).json({ error: { message: "Failed to search" } })
  }
}
