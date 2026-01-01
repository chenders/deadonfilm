/**
 * TheTVDB API Client (v4)
 *
 * Requires API key for authentication.
 * Rate limit: ~100 requests per minute recommended.
 *
 * Documentation: https://thetvdb.github.io/v4-api/
 */

const THETVDB_BASE_URL = "https://api4.thetvdb.com/v4"

// Rate limit: ~100 requests per minute = ~600ms between requests (being conservative)
const MIN_REQUEST_DELAY_MS = 100

// JWT token cache
let cachedToken: string | null = null
let tokenExpiresAt = 0

// ============================================================
// Rate Limiter
// ============================================================

class TheTVDBRateLimiter {
  private lastRequestTime = 0

  async waitForRateLimit(): Promise<number> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    const waitTime = Math.max(0, MIN_REQUEST_DELAY_MS - timeSinceLastRequest)

    if (waitTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    this.lastRequestTime = Date.now()
    return waitTime
  }
}

// Singleton rate limiter instance
const rateLimiter = new TheTVDBRateLimiter()

// ============================================================
// Types
// ============================================================

interface TheTVDBResponse<T> {
  status: string
  data: T
}

export interface TheTVDBSeries {
  id: number
  name: string
  slug: string
  image: string | null
  firstAired: string | null // "YYYY-MM-DD"
  lastAired: string | null
  nextAired: string | null
  score: number
  status: {
    id: number
    name: string // "Continuing", "Ended"
    recordType: string
    keepUpdated: boolean
  }
  originalCountry: string
  originalLanguage: string
  defaultSeasonType: number
  isOrderRandomized: boolean
  lastUpdated: string
  averageRuntime: number | null
  episodes: TheTVDBEpisode[] | null
  overview: string | null
  year: string | null
}

export interface TheTVDBEpisode {
  id: number
  seriesId: number
  name: string | null
  aired: string | null // "YYYY-MM-DD"
  runtime: number | null
  nameTranslations: string[] | null
  overview: string | null
  overviewTranslations: string[] | null
  image: string | null
  imageType: number | null
  isMovie: number
  seasons: TheTVDBSeasonInfo[] | null
  number: number // episode number within season
  seasonNumber: number
  lastUpdated: string
  finaleType: string | null
  year: string | null
}

interface TheTVDBSeasonInfo {
  id: number
  seriesId: number
  type: {
    id: number
    name: string
    type: string
    alternateName: string | null
  }
  number: number
}

export interface TheTVDBActor {
  id: number
  name: string
  image: string | null
  sort: number
  type: number // 3 = actor
  personId: number
  seriesId: number
  movieId: number | null
  episodeId: number | null
  isFeatured: boolean
  peopleId: number
  personName: string | null
  tagOptions: string | null
}

export interface TheTVDBPerson {
  id: number
  name: string
  image: string | null
  score: number
  birth: string | null // "YYYY-MM-DD"
  death: string | null // "YYYY-MM-DD"
  birthPlace: string | null
  gender: number // 1 = male, 2 = female
  biographies: TheTVDBBiography[] | null
}

interface TheTVDBBiography {
  biography: string
  language: string
}

export interface TheTVDBSeason {
  id: number
  seriesId: number
  type: {
    id: number
    name: string
    type: string
  }
  name: string | null
  number: number
  image: string | null
  imageType: number | null
  lastUpdated: string
  companies: {
    studio: null | unknown
    network: null | unknown
    production: null | unknown
    distributor: null | unknown
    special_effects: null | unknown
  }
}

// ============================================================
// Authentication
// ============================================================

function getApiKey(): string {
  const apiKey = process.env.THETVDB_API_KEY
  if (!apiKey) {
    throw new Error("THETVDB_API_KEY environment variable is not set")
  }
  return apiKey
}

/**
 * Authenticate with TheTVDB and get a JWT token.
 * Token is cached for ~24 hours.
 */
export async function authenticate(): Promise<string> {
  // Check if we have a valid cached token (with 1 hour buffer)
  const now = Date.now()
  if (cachedToken && tokenExpiresAt > now + 3600000) {
    return cachedToken
  }

  await rateLimiter.waitForRateLimit()

  const response = await fetch(`${THETVDB_BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apikey: getApiKey(),
    }),
  })

  if (!response.ok) {
    throw new Error(`TheTVDB authentication failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as TheTVDBResponse<{ token: string }>
  cachedToken = data.data.token

  // Token expires in ~1 month, but we'll refresh after 24 hours
  tokenExpiresAt = now + 24 * 60 * 60 * 1000

  return cachedToken
}

/**
 * Clear the cached token (useful for testing or re-authentication).
 */
export function clearTokenCache(): void {
  cachedToken = null
  tokenExpiresAt = 0
}

// ============================================================
// API Functions
// ============================================================

async function fetchWithAuth<T>(path: string): Promise<T | null> {
  const token = await authenticate()
  await rateLimiter.waitForRateLimit()

  const response = await fetch(`${THETVDB_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`TheTVDB API error: ${response.status} ${response.statusText}`)
  }

  const result = (await response.json()) as TheTVDBResponse<T>
  return result.data
}

/**
 * Get series details by TheTVDB ID.
 */
export async function getSeries(seriesId: number): Promise<TheTVDBSeries | null> {
  return fetchWithAuth<TheTVDBSeries>(`/series/${seriesId}`)
}

/**
 * Get series with extended info (includes more metadata).
 */
export async function getSeriesExtended(seriesId: number): Promise<TheTVDBSeries | null> {
  return fetchWithAuth<TheTVDBSeries>(`/series/${seriesId}/extended`)
}

/**
 * Get all episodes for a series.
 * TheTVDB paginates results, so we fetch all pages.
 */
export async function getSeriesEpisodes(
  seriesId: number,
  seasonType: "default" | "official" | "dvd" | "absolute" = "default"
): Promise<TheTVDBEpisode[]> {
  const allEpisodes: TheTVDBEpisode[] = []
  let page = 0

  while (true) {
    const result = await fetchWithAuth<{ series: TheTVDBSeries; episodes: TheTVDBEpisode[] }>(
      `/series/${seriesId}/episodes/${seasonType}?page=${page}`
    )

    if (!result || !result.episodes || result.episodes.length === 0) {
      break
    }

    allEpisodes.push(...result.episodes)
    page++

    // Safety limit to prevent infinite loops
    if (page > 100) {
      console.warn(`TheTVDB: Hit page limit for series ${seriesId}`)
      break
    }
  }

  return allEpisodes
}

/**
 * Get episodes for a specific season.
 */
export async function getSeasonEpisodes(
  seriesId: number,
  seasonNumber: number
): Promise<TheTVDBEpisode[]> {
  const allEpisodes = await getSeriesEpisodes(seriesId)
  return allEpisodes.filter((ep) => ep.seasonNumber === seasonNumber)
}

/**
 * Get actors/characters for a series.
 */
export async function getSeriesActors(seriesId: number): Promise<TheTVDBActor[]> {
  const result = await fetchWithAuth<TheTVDBActor[]>(`/series/${seriesId}/characters`)
  // Filter to only actors (type 3)
  return (result ?? []).filter((c) => c.type === 3)
}

/**
 * Get all characters for a series (including non-actors).
 */
export async function getSeriesCharacters(seriesId: number): Promise<TheTVDBActor[]> {
  const result = await fetchWithAuth<TheTVDBActor[]>(`/series/${seriesId}/characters`)
  return result ?? []
}

/**
 * Get person details by TheTVDB person ID.
 */
export async function getPerson(personId: number): Promise<TheTVDBPerson | null> {
  return fetchWithAuth<TheTVDBPerson>(`/people/${personId}`)
}

/**
 * Get person with extended info.
 */
export async function getPersonExtended(personId: number): Promise<TheTVDBPerson | null> {
  return fetchWithAuth<TheTVDBPerson>(`/people/${personId}/extended`)
}

/**
 * Get seasons for a series.
 */
export async function getSeriesSeasons(seriesId: number): Promise<TheTVDBSeason[]> {
  const result = await fetchWithAuth<TheTVDBSeason[]>(`/series/${seriesId}/seasons`)
  return result ?? []
}

/**
 * Search for a series by name.
 */
export async function searchSeries(query: string): Promise<TheTVDBSeries[]> {
  const encoded = encodeURIComponent(query)
  const result = await fetchWithAuth<TheTVDBSeries[]>(`/search?query=${encoded}&type=series`)
  return result ?? []
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Find a series by name, preferring exact title matches.
 */
export async function findSeriesByName(name: string): Promise<TheTVDBSeries | null> {
  const results = await searchSeries(name)
  if (results.length === 0) {
    return null
  }

  // Find exact title match (case-insensitive)
  const exactMatch = results.find((r) => r.name.toLowerCase() === name.toLowerCase())
  if (exactMatch) {
    return exactMatch
  }

  // Return first (most relevant) result
  return results[0]
}
