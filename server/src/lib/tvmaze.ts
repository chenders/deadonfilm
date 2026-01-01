/**
 * TVmaze API Client
 *
 * Free API for TV show data - no API key required.
 * Rate limit: 20 requests per 10 seconds (use 500ms minimum delay).
 *
 * Documentation: https://www.tvmaze.com/api
 */

const TVMAZE_BASE_URL = "https://api.tvmaze.com"

// Rate limit: 20 requests per 10 seconds = 500ms minimum between requests
const MIN_REQUEST_DELAY_MS = 500

// ============================================================
// Rate Limiter
// ============================================================

class TVmazeRateLimiter {
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
const rateLimiter = new TVmazeRateLimiter()

// ============================================================
// Types
// ============================================================

export interface TVmazeShow {
  id: number
  name: string
  premiered: string | null // "YYYY-MM-DD"
  ended: string | null
  status: string // "Running", "Ended", etc.
  runtime: number | null
  officialSite: string | null
  schedule: {
    time: string
    days: string[]
  }
  network: {
    id: number
    name: string
    country: {
      name: string
      code: string
    } | null
  } | null
  webChannel: {
    id: number
    name: string
    country: {
      name: string
      code: string
    } | null
  } | null
  externals: {
    tvrage: number | null
    thetvdb: number | null
    imdb: string | null
  }
  image: {
    medium: string
    original: string
  } | null
  summary: string | null
  _embedded?: {
    episodes?: TVmazeEpisode[]
    cast?: TVmazeCastMember[]
  }
}

export interface TVmazeEpisode {
  id: number
  name: string
  season: number
  number: number // episode number within season
  airdate: string // "YYYY-MM-DD"
  airtime: string // "HH:MM"
  runtime: number | null
  image: {
    medium: string
    original: string
  } | null
  summary: string | null
}

export interface TVmazeCastMember {
  person: TVmazePerson
  character: {
    id: number
    name: string
    image: {
      medium: string
      original: string
    } | null
  }
  self: boolean
  voice: boolean
}

export interface TVmazePerson {
  id: number
  name: string
  birthday: string | null // "YYYY-MM-DD"
  deathday: string | null // "YYYY-MM-DD"
  gender: string | null // "Male", "Female", null
  country: {
    name: string
    code: string
  } | null
  image: {
    medium: string
    original: string
  } | null
}

export interface TVmazeGuestCastMember {
  person: TVmazePerson
  character: {
    id: number
    name: string
    image: {
      medium: string
      original: string
    } | null
  }
  self: boolean
  voice: boolean
}

export interface TVmazeSearchResult {
  score: number
  show: TVmazeShow
}

// ============================================================
// API Functions
// ============================================================

async function fetchWithRateLimit<T>(url: string): Promise<T | null> {
  await rateLimiter.waitForRateLimit()

  const response = await fetch(url)

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`TVmaze API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

/**
 * Search for a show by name.
 * Returns the single best match (singlesearch endpoint).
 */
export async function searchShowByName(name: string): Promise<TVmazeShow | null> {
  const encoded = encodeURIComponent(name)
  return fetchWithRateLimit<TVmazeShow>(`${TVMAZE_BASE_URL}/singlesearch/shows?q=${encoded}`)
}

/**
 * Search for shows by name with multiple results.
 * Returns array of matches with relevance scores.
 */
export async function searchShows(name: string): Promise<TVmazeSearchResult[]> {
  const encoded = encodeURIComponent(name)
  const results = await fetchWithRateLimit<TVmazeSearchResult[]>(
    `${TVMAZE_BASE_URL}/search/shows?q=${encoded}`
  )
  return results ?? []
}

/**
 * Look up a show by TheTVDB ID.
 * Useful for cross-referencing when we have TheTVDB ID from TMDB.
 */
export async function lookupShowByTvdb(tvdbId: number): Promise<TVmazeShow | null> {
  return fetchWithRateLimit<TVmazeShow>(`${TVMAZE_BASE_URL}/lookup/shows?thetvdb=${tvdbId}`)
}

/**
 * Look up a show by IMDb ID.
 */
export async function lookupShowByImdb(imdbId: string): Promise<TVmazeShow | null> {
  return fetchWithRateLimit<TVmazeShow>(`${TVMAZE_BASE_URL}/lookup/shows?imdb=${imdbId}`)
}

/**
 * Get a show by its TVmaze ID.
 */
export async function getShow(showId: number): Promise<TVmazeShow | null> {
  return fetchWithRateLimit<TVmazeShow>(`${TVMAZE_BASE_URL}/shows/${showId}`)
}

/**
 * Get a show with embedded episodes and cast.
 * More efficient than separate calls.
 */
export async function getShowWithEmbeds(
  showId: number,
  embeds: ("episodes" | "cast")[] = ["episodes", "cast"]
): Promise<TVmazeShow | null> {
  const embedParams = embeds.map((e) => `embed[]=${e}`).join("&")
  return fetchWithRateLimit<TVmazeShow>(`${TVMAZE_BASE_URL}/shows/${showId}?${embedParams}`)
}

/**
 * Get all episodes for a show.
 * Returns episodes from all seasons.
 */
export async function getShowEpisodes(showId: number): Promise<TVmazeEpisode[]> {
  const episodes = await fetchWithRateLimit<TVmazeEpisode[]>(
    `${TVMAZE_BASE_URL}/shows/${showId}/episodes`
  )
  return episodes ?? []
}

/**
 * Get episodes for a specific season.
 */
export async function getSeasonEpisodes(
  showId: number,
  seasonNumber: number
): Promise<TVmazeEpisode[]> {
  const allEpisodes = await getShowEpisodes(showId)
  return allEpisodes.filter((ep) => ep.season === seasonNumber)
}

/**
 * Get the main cast for a show.
 */
export async function getShowCast(showId: number): Promise<TVmazeCastMember[]> {
  const cast = await fetchWithRateLimit<TVmazeCastMember[]>(
    `${TVMAZE_BASE_URL}/shows/${showId}/cast`
  )
  return cast ?? []
}

/**
 * Get guest cast for a specific episode.
 * Requires the TVmaze episode ID (not season/episode numbers).
 */
export async function getEpisodeGuestCast(episodeId: number): Promise<TVmazeGuestCastMember[]> {
  const guestCast = await fetchWithRateLimit<TVmazeGuestCastMember[]>(
    `${TVMAZE_BASE_URL}/episodes/${episodeId}/guestcast`
  )
  return guestCast ?? []
}

/**
 * Get a specific episode by TVmaze episode ID.
 */
export async function getEpisode(episodeId: number): Promise<TVmazeEpisode | null> {
  return fetchWithRateLimit<TVmazeEpisode>(`${TVMAZE_BASE_URL}/episodes/${episodeId}`)
}

/**
 * Get person details by TVmaze person ID.
 */
export async function getPerson(personId: number): Promise<TVmazePerson | null> {
  return fetchWithRateLimit<TVmazePerson>(`${TVMAZE_BASE_URL}/people/${personId}`)
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Find a TVmaze show by name, preferring exact title matches.
 * Falls back to best fuzzy match.
 */
export async function findShowByName(name: string): Promise<TVmazeShow | null> {
  // First try singlesearch for best match
  const singleResult = await searchShowByName(name)
  if (singleResult) {
    return singleResult
  }

  // If no result, try multi-search and find closest match
  const results = await searchShows(name)
  if (results.length === 0) {
    return null
  }

  // Find exact title match (case-insensitive)
  const exactMatch = results.find((r) => r.show.name.toLowerCase() === name.toLowerCase())
  if (exactMatch) {
    return exactMatch.show
  }

  // Return highest scoring result
  return results[0].show
}

/**
 * Find a TVmaze show using available external IDs.
 * Tries TheTVDB first, then IMDb, then falls back to name search.
 */
export async function findShow(options: {
  name: string
  thetvdbId?: number | null
  imdbId?: string | null
}): Promise<TVmazeShow | null> {
  // Try TheTVDB ID first (most reliable)
  if (options.thetvdbId) {
    const show = await lookupShowByTvdb(options.thetvdbId)
    if (show) {
      return show
    }
  }

  // Try IMDb ID
  if (options.imdbId) {
    const show = await lookupShowByImdb(options.imdbId)
    if (show) {
      return show
    }
  }

  // Fall back to name search
  return findShowByName(options.name)
}
