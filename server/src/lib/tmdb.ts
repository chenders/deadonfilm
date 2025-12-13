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
