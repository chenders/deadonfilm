import type {
  SearchResponse,
  MovieResponse,
  OnThisDayResponse,
  DeathInfoResponse,
  RandomMovieResponse,
} from "@/types"

const API_BASE = "/api"

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`)

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({ message: "An error occurred" }))) as {
      message?: string
    }
    throw new Error(errorData.message || `API error: ${response.status}`)
  }

  return response.json()
}

export async function searchMovies(query: string): Promise<SearchResponse> {
  if (!query || query.length < 2) {
    return { results: [], page: 1, total_pages: 0, total_results: 0 }
  }
  return fetchJson(`/search?q=${encodeURIComponent(query)}`)
}

export async function getMovie(movieId: number): Promise<MovieResponse> {
  return fetchJson(`/movie/${movieId}`)
}

export async function getOnThisDay(): Promise<OnThisDayResponse> {
  return fetchJson("/on-this-day")
}

export async function getDeathInfo(
  movieId: number,
  personIds: number[]
): Promise<DeathInfoResponse> {
  return fetchJson(`/movie/${movieId}/death-info?personIds=${personIds.join(",")}`)
}

export async function getRandomMovie(): Promise<RandomMovieResponse> {
  return fetchJson("/random")
}

export async function getDiscoverMovie(
  type: "classic" | "high-mortality"
): Promise<RandomMovieResponse> {
  return fetchJson(`/discover?type=${type}`)
}

// TMDB image URL helpers
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"

export function getPosterUrl(
  posterPath: string | null,
  size: "w92" | "w154" | "w185" | "w342" | "w500" | "original" = "w342"
): string | null {
  if (!posterPath) return null
  return `${TMDB_IMAGE_BASE}/${size}${posterPath}`
}

export function getProfileUrl(
  profilePath: string | null,
  size: "w45" | "w185" | "h632" | "original" = "w185"
): string | null {
  if (!profilePath) return null
  return `${TMDB_IMAGE_BASE}/${size}${profilePath}`
}
