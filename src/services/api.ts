import type {
  SearchResponse,
  MovieResponse,
  OnThisDayResponse,
  DeathInfoResponse,
  RandomMovieResponse,
  SiteStatsResponse,
  RecentDeathsResponse,
  ForeverYoungResponse,
  ActorProfileResponse,
  CovidDeathsResponse,
  UnnaturalDeathsResponse,
  UnnaturalDeathCategory,
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
  SeasonEpisodesResponse,
  SeasonResponse,
  UnifiedSearchResponse,
  SearchMediaType,
  CauseCategoryIndexResponse,
  CauseCategoryDetailResponse,
  SpecificCauseDetailResponse,
  DeathDetailsResponse,
  NotableDeathsResponse,
  NotableDeathsFilter,
  InDetailResponse,
  RelatedActorsResponse,
  RelatedMoviesResponse,
  RelatedShowsResponse,
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

export async function getForeverYoungMovies(
  page: number = 1,
  sort?: string,
  dir?: string
): Promise<ForeverYoungResponse> {
  const params = new URLSearchParams()
  params.set("page", String(page))
  if (sort) params.set("sort", sort)
  if (dir) params.set("dir", dir)
  return fetchJson(`/forever-young?${params.toString()}`)
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

export function getBackdropUrl(
  backdropPath: string | null,
  size: "w300" | "w500" | "w780" | "w1280" | "original" = "w780"
): string | null {
  if (!backdropPath) return null
  return `${TMDB_IMAGE_BASE}/${size}${backdropPath}`
}

export async function getActor(slug: string): Promise<ActorProfileResponse> {
  return fetchJson(`/actor/${slug}`)
}

export interface CovidDeathsParams {
  page?: number
  includeObscure?: boolean
}

export async function getCovidDeaths(params: CovidDeathsParams = {}): Promise<CovidDeathsResponse> {
  const { page = 1, includeObscure = false } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  return fetchJson(`/covid-deaths?${searchParams.toString()}`)
}

export interface UnnaturalDeathsParams {
  page?: number
  category?: UnnaturalDeathCategory | "all"
  showSelfInflicted?: boolean
  includeObscure?: boolean
}

export async function getUnnaturalDeaths(
  params: UnnaturalDeathsParams = {}
): Promise<UnnaturalDeathsResponse> {
  const { page = 1, category = "all", showSelfInflicted = false, includeObscure = false } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (category !== "all") {
    searchParams.set("category", category)
  }
  if (showSelfInflicted) {
    searchParams.set("showSelfInflicted", "true")
  }
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  return fetchJson(`/unnatural-deaths?${searchParams.toString()}`)
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

export async function getRandomPopularMovies(limit: number = 4): Promise<PopularMoviesResponse> {
  return fetchJson(`/popular-movies/random?limit=${limit}`)
}

export async function getCauseCategories(): Promise<CauseCategoriesResponse> {
  return fetchJson("/deaths/causes")
}

export interface DeathsByCauseParams {
  page?: number
  includeObscure?: boolean
}

export async function getDeathsByCause(
  causeSlug: string,
  params: DeathsByCauseParams = {}
): Promise<DeathsByCauseResponse> {
  const { page = 1, includeObscure = false } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  return fetchJson(`/deaths/cause/${encodeURIComponent(causeSlug)}?${searchParams.toString()}`)
}

export async function getDecadeCategories(): Promise<DecadeCategoriesResponse> {
  return fetchJson("/deaths/decades")
}

export interface DeathsByDecadeParams {
  page?: number
  includeObscure?: boolean
}

export async function getDeathsByDecade(
  decade: string,
  params: DeathsByDecadeParams = {}
): Promise<DeathsByDecadeResponse> {
  const { page = 1, includeObscure = false } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  return fetchJson(`/deaths/decade/${encodeURIComponent(decade)}?${searchParams.toString()}`)
}

export interface AllDeathsParams {
  page?: number
  includeObscure?: boolean
  search?: string
  sort?: string
  dir?: string
}

export async function getAllDeaths(params: AllDeathsParams = {}): Promise<AllDeathsResponse> {
  const { page = 1, includeObscure = false, search, sort, dir } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  if (search) {
    searchParams.set("search", search)
  }
  if (sort) {
    searchParams.set("sort", sort)
  }
  if (dir) {
    searchParams.set("dir", dir)
  }
  return fetchJson(`/deaths/all?${searchParams.toString()}`)
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

export async function getSeasonEpisodes(
  showId: number,
  seasonNumber: number
): Promise<SeasonEpisodesResponse> {
  return fetchJson(`/show/${showId}/season/${seasonNumber}/episodes`)
}

export async function getSeason(showId: number, seasonNumber: number): Promise<SeasonResponse> {
  return fetchJson(`/show/${showId}/season/${seasonNumber}`)
}

// Causes of Death 3-level hierarchy API functions

export async function getCauseCategoryIndex(): Promise<CauseCategoryIndexResponse> {
  return fetchJson("/causes-of-death")
}

export interface CauseCategoryParams {
  page?: number
  includeObscure?: boolean
  specificCause?: string
}

export async function getCauseCategoryDetail(
  categorySlug: string,
  params: CauseCategoryParams = {}
): Promise<CauseCategoryDetailResponse> {
  const { page = 1, includeObscure = false, specificCause } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  if (specificCause) {
    searchParams.set("cause", specificCause)
  }
  return fetchJson(
    `/causes-of-death/${encodeURIComponent(categorySlug)}?${searchParams.toString()}`
  )
}

export interface SpecificCauseParams {
  page?: number
  includeObscure?: boolean
}

export async function getSpecificCauseDetail(
  categorySlug: string,
  causeSlug: string,
  params: SpecificCauseParams = {}
): Promise<SpecificCauseDetailResponse> {
  const { page = 1, includeObscure = false } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  return fetchJson(
    `/causes-of-death/${encodeURIComponent(categorySlug)}/${encodeURIComponent(causeSlug)}?${searchParams.toString()}`
  )
}

// In Detail API functions

export interface InDetailParams {
  page?: number
  search?: string
  sort?: string
  dir?: string
}

/**
 * Get paginated list of actors with thoroughly researched death information
 */
export async function getInDetailActors(params: InDetailParams = {}): Promise<InDetailResponse> {
  const { page = 1, search, sort, dir } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  if (search) {
    searchParams.set("search", search)
  }
  if (sort) {
    searchParams.set("sort", sort)
  }
  if (dir) {
    searchParams.set("dir", dir)
  }
  return fetchJson(`/in-detail?${searchParams.toString()}`)
}

// Death Details API functions

/**
 * Get detailed death circumstances for an actor
 */
export async function getActorDeathDetails(slug: string): Promise<DeathDetailsResponse> {
  return fetchJson(`/actor/${slug}/death`)
}

export interface NotableDeathsParams {
  page?: number
  pageSize?: number
  filter?: NotableDeathsFilter
  includeObscure?: boolean
  sort?: string
  dir?: string
}

/**
 * Get paginated list of actors with notable/detailed death information
 */
export async function getNotableDeaths(
  params: NotableDeathsParams = {}
): Promise<NotableDeathsResponse> {
  const { page = 1, pageSize = 50, filter = "all", includeObscure = false, sort, dir } = params
  const searchParams = new URLSearchParams()
  searchParams.set("page", String(page))
  searchParams.set("pageSize", String(pageSize))
  if (filter !== "all") {
    searchParams.set("filter", filter)
  }
  if (includeObscure) {
    searchParams.set("includeObscure", "true")
  }
  if (sort) {
    searchParams.set("sort", sort)
  }
  if (dir) {
    searchParams.set("dir", dir)
  }
  return fetchJson(`/deaths/notable?${searchParams.toString()}`)
}

// Related content API functions

export async function getRelatedActors(actorId: number): Promise<RelatedActorsResponse> {
  return fetchJson(`/actor/${actorId}/related`)
}

export async function getRelatedMovies(movieId: number): Promise<RelatedMoviesResponse> {
  return fetchJson(`/movie/${movieId}/related`)
}

export async function getRelatedShows(showId: number): Promise<RelatedShowsResponse> {
  return fetchJson(`/show/${showId}/related`)
}

/**
 * Helper function to construct admin API paths
 * @param path The path relative to /admin/api
 * @returns The full admin API path
 */
export function adminApi(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith("/") ? path.slice(1) : path
  return `/admin/api/${cleanPath}`
}
