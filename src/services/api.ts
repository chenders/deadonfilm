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
  ForeverYoungResponse,
  CursedActorsResponse,
  ActorProfileResponse,
  CovidDeathsResponse,
  ViolentDeathsResponse,
  DeathWatchResponse,
  FeaturedMovieResponse,
  TriviaResponse,
  ThisWeekDeathsResponse,
  PopularMoviesResponse,
  CauseCategoriesResponse,
  DeathsByCauseResponse,
  DecadeCategoriesResponse,
  DeathsByDecadeResponse,
  GenreCategoriesResponse,
  MoviesByGenreResponse,
  AllDeathsResponse,
  TVSearchResponse,
  ShowResponse,
  EpisodeResponse,
  UnifiedSearchResponse,
  SearchMediaType,
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

/**
 * Unified search for movies and/or TV shows
 * @param query Search query
 * @param type Media type: 'movie', 'tv', or 'all' (default: 'all')
 */
export async function searchAll(
  query: string,
  type: SearchMediaType = "all"
): Promise<UnifiedSearchResponse> {
  if (!query || query.length < 2) {
    return { results: [], page: 1, total_pages: 0, total_results: 0 }
  }
  return fetchJson(`/search?q=${encodeURIComponent(query)}&type=${type}`)
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

export async function getForeverYoungMovies(page: number = 1): Promise<ForeverYoungResponse> {
  return fetchJson(`/forever-young?page=${page}`)
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

export async function getCovidDeaths(page: number = 1): Promise<CovidDeathsResponse> {
  return fetchJson(`/covid-deaths?page=${page}`)
}

export interface ViolentDeathsOptions {
  page?: number
  includeSelfInflicted?: boolean
}

export async function getViolentDeaths(
  options: ViolentDeathsOptions = {}
): Promise<ViolentDeathsResponse> {
  const { page = 1, includeSelfInflicted } = options
  const params = new URLSearchParams()

  params.set("page", String(page))
  if (includeSelfInflicted) params.set("includeSelfInflicted", "true")

  return fetchJson(`/violent-deaths?${params.toString()}`)
}

export interface DeathWatchOptions {
  page?: number
  limit?: number
  minAge?: number
  minMovies?: number
  includeObscure?: boolean
}

export async function getDeathWatch(options: DeathWatchOptions = {}): Promise<DeathWatchResponse> {
  const { page = 1, limit = 50, minAge, minMovies, includeObscure } = options
  const params = new URLSearchParams()

  params.set("page", String(page))
  params.set("limit", String(limit))
  if (minAge) params.set("minAge", String(minAge))
  if (minMovies) params.set("minMovies", String(minMovies))
  if (includeObscure) params.set("includeObscure", "true")

  return fetchJson(`/death-watch?${params.toString()}`)
}

export async function getFeaturedMovie(): Promise<FeaturedMovieResponse> {
  return fetchJson("/featured-movie")
}

export async function getTrivia(): Promise<TriviaResponse> {
  return fetchJson("/trivia")
}

export async function getThisWeekDeaths(): Promise<ThisWeekDeathsResponse> {
  return fetchJson("/this-week")
}

export async function getPopularMovies(limit: number = 10): Promise<PopularMoviesResponse> {
  return fetchJson(`/popular-movies?limit=${limit}`)
}

export async function getCauseCategories(): Promise<CauseCategoriesResponse> {
  return fetchJson("/deaths/causes")
}

export async function getDeathsByCause(
  causeSlug: string,
  page: number = 1
): Promise<DeathsByCauseResponse> {
  return fetchJson(`/deaths/cause/${encodeURIComponent(causeSlug)}?page=${page}`)
}

export async function getDecadeCategories(): Promise<DecadeCategoriesResponse> {
  return fetchJson("/deaths/decades")
}

export async function getDeathsByDecade(
  decade: string,
  page: number = 1
): Promise<DeathsByDecadeResponse> {
  return fetchJson(`/deaths/decade/${encodeURIComponent(decade)}?page=${page}`)
}

export async function getAllDeaths(page: number = 1): Promise<AllDeathsResponse> {
  return fetchJson(`/deaths/all?page=${page}`)
}

export async function getGenreCategories(): Promise<GenreCategoriesResponse> {
  return fetchJson("/movies/genres")
}

export async function getMoviesByGenre(
  genreSlug: string,
  page: number = 1
): Promise<MoviesByGenreResponse> {
  return fetchJson(`/movies/genre/${encodeURIComponent(genreSlug)}?page=${page}`)
}

// TV Show API functions
export async function searchTVShows(query: string): Promise<TVSearchResponse> {
  if (!query || query.length < 2) {
    return { results: [], page: 1, total_pages: 0, total_results: 0 }
  }
  return fetchJson(`/search/tv?q=${encodeURIComponent(query)}`)
}

export async function getShow(showId: number): Promise<ShowResponse> {
  return fetchJson(`/show/${showId}`)
}

export async function getEpisode(
  showId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<EpisodeResponse> {
  return fetchJson(`/show/${showId}/season/${seasonNumber}/episode/${episodeNumber}`)
}
