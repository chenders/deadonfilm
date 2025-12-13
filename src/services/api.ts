import type {
  SearchResponse,
  MovieResponse,
  OnThisDayResponse,
  DeathInfoResponse,
  RandomMovieResponse,
  SiteStatsResponse,
  RecentDeathsResponse,
  CursedMoviesResponse,
  CursedMoviesFiltersResponse,
  CursedActorsResponse,
  ActorProfileResponse,
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

export async function getDiscoverMovie(): Promise<RandomMovieResponse> {
  return fetchJson("/discover/forever-young")
}

export async function getSiteStats(): Promise<SiteStatsResponse> {
  return fetchJson("/stats")
}

export async function getRecentDeaths(limit: number = 5): Promise<RecentDeathsResponse> {
  return fetchJson(`/recent-deaths?limit=${limit}`)
}

export interface CursedMoviesOptions {
  page?: number
  limit?: number
  fromDecade?: number // e.g., 1980
  toDecade?: number // e.g., 1990
  minDeadActors?: number
  includeObscure?: boolean // Include obscure/unknown movies (default: false)
}

export async function getCursedMovies(
  options: CursedMoviesOptions = {}
): Promise<CursedMoviesResponse> {
  const { page = 1, limit = 50, fromDecade, toDecade, minDeadActors, includeObscure } = options
  const params = new URLSearchParams()

  params.set("page", String(page))
  params.set("limit", String(limit))
  if (fromDecade) params.set("from", String(fromDecade))
  if (toDecade) params.set("to", String(toDecade))
  if (minDeadActors) params.set("minDeaths", String(minDeadActors))
  if (includeObscure) params.set("includeObscure", "true")

  return fetchJson(`/cursed-movies?${params.toString()}`)
}

export async function getCursedMoviesFilters(): Promise<CursedMoviesFiltersResponse> {
  return fetchJson("/cursed-movies/filters")
}

export interface CursedActorsOptions {
  page?: number
  limit?: number
  fromDecade?: number
  toDecade?: number
  minMovies?: number
  status?: "living" | "deceased" | "all"
}

export async function getCursedActors(
  options: CursedActorsOptions = {}
): Promise<CursedActorsResponse> {
  const { page = 1, limit = 50, fromDecade, toDecade, minMovies, status } = options
  const params = new URLSearchParams()

  params.set("page", String(page))
  params.set("limit", String(limit))
  if (fromDecade) params.set("from", String(fromDecade))
  if (toDecade) params.set("to", String(toDecade))
  if (minMovies) params.set("minMovies", String(minMovies))
  if (status) params.set("status", status)

  return fetchJson(`/cursed-actors?${params.toString()}`)
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

export async function getActor(actorId: number): Promise<ActorProfileResponse> {
  return fetchJson(`/actor/${actorId}`)
}
