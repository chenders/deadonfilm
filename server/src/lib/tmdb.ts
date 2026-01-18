const TMDB_BASE_URL = "https://api.themoviedb.org/3"

function getToken(): string {
  const token = process.env.TMDB_API_TOKEN
  if (!token) {
    throw new Error("TMDB_API_TOKEN environment variable is not set")
  }
  return token
}

// TMDB API Response Types
export interface TMDBChangesResponse {
  results: Array<{ id: number; adult: boolean | null }>
  page: number
  total_pages: number
  total_results: number
}

export interface TMDBSearchResponse {
  page: number
  results: TMDBMovie[]
  total_pages: number
  total_results: number
}

export interface TMDBMovie {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  genre_ids: number[]
  popularity: number
  original_language: string
}

export interface TMDBMovieDetails {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  runtime: number | null
  genres: Array<{ id: number; name: string }>
  popularity?: number
  vote_average?: number
  original_language?: string
  production_countries?: Array<{ iso_3166_1: string; name: string }>
}

export interface TMDBCreditsResponse {
  id: number
  cast: TMDBCastMember[]
  crew: TMDBCrewMember[]
}

export interface TMDBCastMember {
  id: number
  name: string
  character: string
  profile_path: string | null
  order: number
  gender: number
  known_for_department: string
}

export interface TMDBCrewMember {
  id: number
  name: string
  job: string
  department: string
  profile_path: string | null
}

export interface TMDBPerson {
  id: number
  name: string
  birthday: string | null
  deathday: string | null
  biography: string
  profile_path: string | null
  place_of_birth: string | null
  imdb_id: string | null
  popularity: number
}

// TV Show Types
export interface TMDBTVSearchResponse {
  page: number
  results: TMDBTVShow[]
  total_pages: number
  total_results: number
}

export interface TMDBTVShow {
  id: number
  name: string
  first_air_date: string
  poster_path: string | null
  overview: string
  genre_ids: number[]
  popularity: number
  origin_country: string[]
  original_language: string
}

export interface TMDBTVShowDetails {
  id: number
  name: string
  first_air_date: string
  last_air_date: string | null
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  status: string // 'Returning Series', 'Ended', 'Canceled', etc.
  number_of_seasons: number
  number_of_episodes: number
  genres: Array<{ id: number; name: string }>
  popularity: number
  vote_average: number
  origin_country: string[]
  original_language: string
  seasons: TMDBSeasonSummary[]
}

export interface TMDBSeasonSummary {
  id: number
  season_number: number
  name: string
  air_date: string | null
  episode_count: number
  poster_path: string | null
}

export interface TMDBSeasonDetails {
  id: number
  season_number: number
  name: string
  air_date: string | null
  episodes: TMDBEpisodeSummary[]
  poster_path: string | null
}

export interface TMDBEpisodeSummary {
  id: number
  episode_number: number
  season_number: number
  name: string
  air_date: string | null
  runtime: number | null
  guest_stars: TMDBCastMember[]
}

export interface TMDBEpisodeDetails {
  id: number
  episode_number: number
  season_number: number
  name: string
  overview: string
  air_date: string | null
  runtime: number | null
  still_path: string | null
  vote_average: number
  vote_count: number
}

export interface TMDBAggregateCreditsResponse {
  id: number
  cast: TMDBAggregateActor[]
}

export interface TMDBAggregateActor {
  id: number
  name: string
  profile_path: string | null
  roles: Array<{
    character: string
    episode_count: number
  }>
  total_episode_count: number
  order: number
  gender: number
  known_for_department: string
}

export interface TMDBSeasonCreditsResponse {
  id: number
  cast: TMDBCastMember[]
  guest_stars?: TMDBCastMember[]
}

export interface TMDBEpisodeCreditsResponse {
  id: number
  cast: TMDBCastMember[]
  guest_stars: TMDBCastMember[]
}

async function tmdbFetch<T>(path: string): Promise<T> {
  const token = getToken()
  const url = `${TMDB_BASE_URL}${path}`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json",
    },
  })

  if (!response.ok) {
    const body = await response.text()
    console.log(`TMDB Error Response: ${body}`)
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

async function searchMoviesPage(query: string, page: number): Promise<TMDBSearchResponse> {
  const url = `/search/movie?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=${page}`
  return tmdbFetch<TMDBSearchResponse>(url)
}

export async function searchMovies(query: string): Promise<TMDBSearchResponse> {
  // Fetch first 3 pages in parallel to get better popularity coverage
  // TMDB search prioritizes exact matches over popularity, so we need more results
  const [page1, page2, page3] = await Promise.all([
    searchMoviesPage(query, 1),
    searchMoviesPage(query, 2).catch(() => null),
    searchMoviesPage(query, 3).catch(() => null),
  ])

  // Combine all results, deduplicate by ID
  const seenIds = new Set<number>()
  const allResults: TMDBMovie[] = []

  for (const page of [page1, page2, page3]) {
    if (page) {
      for (const movie of page.results) {
        if (!seenIds.has(movie.id)) {
          seenIds.add(movie.id)
          allResults.push(movie)
        }
      }
    }
  }

  return {
    page: 1,
    results: allResults,
    total_pages: page1.total_pages,
    total_results: page1.total_results,
  }
}

export async function getMovieDetails(movieId: number): Promise<TMDBMovieDetails> {
  return tmdbFetch<TMDBMovieDetails>(`/movie/${movieId}?language=en-US`)
}

export async function getMovieCredits(movieId: number): Promise<TMDBCreditsResponse> {
  return tmdbFetch<TMDBCreditsResponse>(`/movie/${movieId}/credits?language=en-US`)
}

export async function getPersonDetails(personId: number): Promise<TMDBPerson> {
  return tmdbFetch<TMDBPerson>(`/person/${personId}?language=en-US`)
}

export interface TMDBPersonCredits {
  id: number
  cast: Array<{
    id: number
    title: string
    release_date: string
    character: string
    popularity: number
    poster_path: string | null
  }>
}

export async function getPersonCredits(personId: number): Promise<TMDBPersonCredits> {
  return tmdbFetch<TMDBPersonCredits>(`/person/${personId}/movie_credits?language=en-US`)
}

// TMDB Changes API - for syncing database with TMDB updates
// Both endpoints have a maximum 14-day query window and return 100 items per page

export async function getPersonChanges(
  startDate: string,
  endDate: string,
  page: number = 1
): Promise<TMDBChangesResponse> {
  return tmdbFetch<TMDBChangesResponse>(
    `/person/changes?start_date=${startDate}&end_date=${endDate}&page=${page}`
  )
}

export async function getMovieChanges(
  startDate: string,
  endDate: string,
  page: number = 1
): Promise<TMDBChangesResponse> {
  return tmdbFetch<TMDBChangesResponse>(
    `/movie/changes?start_date=${startDate}&end_date=${endDate}&page=${page}`
  )
}

/**
 * Fetch all changed person IDs from TMDB Changes API, handling pagination.
 * @param startDate - Start date in YYYY-MM-DD format (max 14 days before endDate)
 * @param endDate - End date in YYYY-MM-DD format
 * @param delayMs - Delay between page requests to respect API rate limits (default 50ms)
 * @returns Array of TMDB person IDs that changed in the date range
 */
export async function getAllChangedPersonIds(
  startDate: string,
  endDate: string,
  delayMs: number = 50
): Promise<number[]> {
  const ids: number[] = []
  let page = 1
  let totalPages = 1

  do {
    const response = await getPersonChanges(startDate, endDate, page)
    ids.push(...response.results.map((r) => r.id))
    totalPages = response.total_pages
    page++

    if (page <= totalPages && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  } while (page <= totalPages)

  return ids
}

/**
 * Fetch all changed movie IDs from TMDB Changes API, handling pagination.
 * @param startDate - Start date in YYYY-MM-DD format (max 14 days before endDate)
 * @param endDate - End date in YYYY-MM-DD format
 * @param delayMs - Delay between page requests to respect API rate limits (default 50ms)
 * @returns Array of TMDB movie IDs that changed in the date range
 */
export async function getAllChangedMovieIds(
  startDate: string,
  endDate: string,
  delayMs: number = 50
): Promise<number[]> {
  const ids: number[] = []
  let page = 1
  let totalPages = 1

  do {
    const response = await getMovieChanges(startDate, endDate, page)
    ids.push(...response.results.map((r) => r.id))
    totalPages = response.total_pages
    page++

    if (page <= totalPages && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  } while (page <= totalPages)

  return ids
}

export async function discoverMoviesByYear(
  startYear: number,
  endYear: number,
  page: number = 1
): Promise<TMDBSearchResponse> {
  return tmdbFetch<TMDBSearchResponse>(
    `/discover/movie?` +
      `primary_release_date.gte=${startYear}-01-01&` +
      `primary_release_date.lte=${endYear}-12-31&` +
      `sort_by=popularity.desc&` +
      `include_adult=false&` +
      `language=en-US&` +
      `page=${page}`
  )
}

// Batch fetch person details with chunking to respect rate limits
export async function batchGetPersonDetails(
  personIds: number[],
  chunkSize = 10,
  delayMs = 100
): Promise<Map<number, TMDBPerson>> {
  const results = new Map<number, TMDBPerson>()

  // Split into chunks
  const chunks: number[][] = []
  for (let i = 0; i < personIds.length; i += chunkSize) {
    chunks.push(personIds.slice(i, i + chunkSize))
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    // Fetch chunk in parallel
    const chunkResults = await Promise.allSettled(chunk.map((id) => getPersonDetails(id)))

    // Process results
    for (let j = 0; j < chunkResults.length; j++) {
      const result = chunkResults[j]
      const personId = chunk[j]

      if (result.status === "fulfilled") {
        results.set(personId, result.value)
      }
    }

    // Delay between chunks (except for last chunk)
    if (i < chunks.length - 1 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  return results
}

// TV Show Functions

async function searchTVShowsPage(query: string, page: number): Promise<TMDBTVSearchResponse> {
  const url = `/search/tv?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=${page}`
  return tmdbFetch<TMDBTVSearchResponse>(url)
}

/**
 * Search for TV shows. Fetches first 3 pages for better coverage.
 * Filters to English-language US shows.
 */
export async function searchTVShows(query: string): Promise<TMDBTVSearchResponse> {
  const [page1, page2, page3] = await Promise.all([
    searchTVShowsPage(query, 1),
    searchTVShowsPage(query, 2).catch((error) => {
      console.error("searchTVShows: failed to fetch page 2", { query, error: String(error) })
      return null
    }),
    searchTVShowsPage(query, 3).catch((error) => {
      console.error("searchTVShows: failed to fetch page 3", { query, error: String(error) })
      return null
    }),
  ])

  const seenIds = new Set<number>()
  const allResults: TMDBTVShow[] = []

  for (const page of [page1, page2, page3]) {
    if (page) {
      for (const show of page.results) {
        // Filter to English-language shows from US
        // Require explicit US origin - exclude shows with empty/unknown origin
        if (
          !seenIds.has(show.id) &&
          show.original_language === "en" &&
          show.origin_country.includes("US")
        ) {
          seenIds.add(show.id)
          allResults.push(show)
        }
      }
    }
  }

  return {
    page: 1,
    results: allResults,
    total_pages: page1.total_pages,
    total_results: allResults.length,
  }
}

/**
 * Get TV show details including season list
 */
export async function getTVShowDetails(showId: number): Promise<TMDBTVShowDetails> {
  return tmdbFetch<TMDBTVShowDetails>(`/tv/${showId}?language=en-US`)
}

/**
 * Get aggregate credits for a TV show (all actors across all seasons)
 */
export async function getTVShowAggregateCredits(
  showId: number
): Promise<TMDBAggregateCreditsResponse> {
  return tmdbFetch<TMDBAggregateCreditsResponse>(`/tv/${showId}/aggregate_credits?language=en-US`)
}

/**
 * Get season details including episode list
 */
export async function getSeasonDetails(
  showId: number,
  seasonNumber: number
): Promise<TMDBSeasonDetails> {
  return tmdbFetch<TMDBSeasonDetails>(`/tv/${showId}/season/${seasonNumber}?language=en-US`)
}

/**
 * Get details for a specific episode
 */
export async function getEpisodeDetails(
  showId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<TMDBEpisodeDetails> {
  return tmdbFetch<TMDBEpisodeDetails>(
    `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}?language=en-US`
  )
}

/**
 * Get credits for a specific episode
 */
export async function getEpisodeCredits(
  showId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<TMDBEpisodeCreditsResponse> {
  return tmdbFetch<TMDBEpisodeCreditsResponse>(
    `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}/credits?language=en-US`
  )
}

/**
 * Discover popular TV shows for seeding
 */
export async function discoverTVShows(page: number = 1): Promise<TMDBTVSearchResponse> {
  return tmdbFetch<TMDBTVSearchResponse>(
    `/discover/tv?` +
      `with_origin_country=US&` +
      `with_original_language=en&` +
      `sort_by=popularity.desc&` +
      `include_adult=false&` +
      `language=en-US&` +
      `page=${page}`
  )
}

// External IDs Response Types
export interface TMDBExternalIds {
  imdb_id: string | null
  freebase_mid: string | null
  freebase_id: string | null
  tvdb_id: number | null
  tvrage_id: number | null
  wikidata_id: string | null
  facebook_id: string | null
  instagram_id: string | null
  twitter_id: string | null
}

/**
 * Get external IDs for a TV show (IMDB, TheTVDB, etc.)
 */
export async function getTVShowExternalIds(showId: number): Promise<TMDBExternalIds> {
  return tmdbFetch<TMDBExternalIds>(`/tv/${showId}/external_ids`)
}

/**
 * Get external IDs for a person (IMDB, etc.)
 */
export async function getPersonExternalIds(personId: number): Promise<TMDBExternalIds> {
  return tmdbFetch<TMDBExternalIds>(`/person/${personId}/external_ids`)
}

/**
 * Search for a person by name
 */
export interface TMDBPersonSearchResult {
  id: number
  name: string
  known_for_department: string
  popularity: number
  profile_path: string | null
  gender: number
}

export interface TMDBPersonSearchResponse {
  page: number
  results: TMDBPersonSearchResult[]
  total_pages: number
  total_results: number
}

export async function searchPerson(query: string): Promise<TMDBPersonSearchResponse> {
  const encoded = encodeURIComponent(query)
  return tmdbFetch<TMDBPersonSearchResponse>(
    `/search/person?query=${encoded}&include_adult=false&language=en-US&page=1`
  )
}
