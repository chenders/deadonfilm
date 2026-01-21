/**
 * Trakt.tv API Client
 *
 * Fetches trending data, user ratings, and watch statistics from Trakt.tv.
 * API Documentation: https://trakt.docs.apiary.io/
 *
 * Requirements:
 * - API key (get one at https://trakt.tv/oauth/applications)
 * - IMDb ID for movies (e.g., "tt0111161")
 * - TheTVDB ID for shows (e.g., 121361)
 *
 * Cost: Free with registration
 */

export interface TraktStats {
  watchers: number
  plays: number
  collectors: number
  votes: number
  comments: number
  lists: number
  rating: number // 0-10 scale (e.g., 8.15432)
}

export interface TraktIds {
  trakt: number
  slug: string
  imdb: string
  tmdb: number
  tvdb?: number
}

export interface TraktMovie {
  title: string
  year: number
  ids: TraktIds
}

export interface TraktShow {
  title: string
  year: number
  ids: TraktIds
}

export interface TraktTrendingItem {
  watchers: number
  movie?: TraktMovie
  show?: TraktShow
}

const TRAKT_API_BASE = "https://api.trakt.tv"
const REQUEST_DELAY_MS = 200

/**
 * Rate limiter class to ensure minimum delay between requests
 */
class TraktRateLimiter {
  private lastRequestTime = 0

  async waitForRateLimit(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < REQUEST_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest))
    }
    this.lastRequestTime = Date.now()
  }
}

const rateLimiter = new TraktRateLimiter()

/**
 * Make authenticated request to Trakt API
 */
async function traktRequest<T>(endpoint: string, apiKey?: string): Promise<T | null> {
  const key = apiKey || process.env.TRAKT_API_KEY
  if (!key) {
    throw new Error("TRAKT_API_KEY environment variable not set")
  }

  await rateLimiter.waitForRateLimit()

  const url = `${TRAKT_API_BASE}${endpoint}`

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": key,
      },
    })

    if (response.status === 404) {
      // Content not found
      return null
    }

    if (!response.ok) {
      throw new Error(`Trakt API returned ${response.status}`)
    }

    return (await response.json()) as T
  } catch (error) {
    console.error(`Error fetching from Trakt API (${endpoint}):`, error)
    return null
  }
}

/**
 * Get statistics for a movie or show
 *
 * @param type - "movie" or "show"
 * @param id - IMDb ID for movies (e.g., "tt0111161") or TheTVDB ID for shows (e.g., "121361")
 * @param apiKey - Trakt API key (defaults to TRAKT_API_KEY env var)
 * @returns TraktStats or null if not found or error
 */
export async function getTraktStats(
  type: "movie" | "show",
  id: string,
  apiKey?: string
): Promise<TraktStats | null> {
  // Validate ID format based on type
  if (type === "movie") {
    // Movies use IMDb ID
    if (!id || !id.match(/^tt\d+$/)) {
      return null
    }
  } else {
    // Shows use TheTVDB ID (numeric)
    if (!id || !id.match(/^\d+$/)) {
      return null
    }
  }

  const endpoint = `/${type}s/${id}/stats`
  return await traktRequest<TraktStats>(endpoint, apiKey)
}

/**
 * Get trending movies or shows
 *
 * @param type - "movie" or "show"
 * @param limit - Maximum number of items to return (default: 100)
 * @param apiKey - Trakt API key (defaults to TRAKT_API_KEY env var)
 * @returns Array of trending items or empty array on error
 */
export async function getTrending(
  type: "movie" | "show",
  limit = 100,
  apiKey?: string
): Promise<TraktTrendingItem[]> {
  const endpoint = `/${type}s/trending?limit=${limit}`
  const result = await traktRequest<TraktTrendingItem[]>(endpoint, apiKey)
  return result || []
}

/**
 * Get user rating for a movie or show
 * Note: This gets the average community rating, not a specific user's rating
 *
 * @param type - "movie" or "show"
 * @param id - IMDb ID for movies or TheTVDB ID for shows
 * @param apiKey - Trakt API key (defaults to TRAKT_API_KEY env var)
 * @returns Rating (0-10) or null if not found
 */
export async function getTraktRating(
  type: "movie" | "show",
  id: string,
  apiKey?: string
): Promise<{ rating: number; votes: number } | null> {
  const stats = await getTraktStats(type, id, apiKey)
  if (!stats) return null

  return {
    rating: stats.rating,
    votes: stats.votes,
  }
}
