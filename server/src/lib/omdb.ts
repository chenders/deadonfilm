/**
 * OMDb API Client
 *
 * Fetches IMDb ratings, Rotten Tomatoes scores, and Metacritic scores from the OMDb API.
 * API Documentation: https://www.omdbapi.com/
 *
 * Requirements:
 * - API key (get one at http://www.omdbapi.com/apikey.aspx)
 * - IMDb ID (e.g., "tt0111161" for The Shawshank Redemption)
 *
 * Cost: $1/month for 100,000 requests
 */

export interface OMDbRating {
  Source: string // "Internet Movie Database" | "Rotten Tomatoes" | "Metacritic"
  Value: string // "8.5/10" | "85%" | "75/100"
}

export interface OMDbResponse {
  Title: string
  Year: string
  Rated: string
  Released: string
  Runtime: string
  Genre: string
  Director: string
  Writer: string
  Actors: string
  Plot: string
  Language: string
  Country: string
  Awards: string
  Poster: string
  Ratings: OMDbRating[]
  Metascore: string
  imdbRating: string // "8.5"
  imdbVotes: string // "1,500,000" (comma-formatted!)
  imdbID: string
  Type: string // "movie" | "series" | "episode"
  DVD: string
  BoxOffice: string
  Production: string
  Website: string
  Response: "True" | "False"
  Error?: string
}

export interface OMDbMetrics {
  imdbRating: number | null
  imdbVotes: number | null
  rottenTomatoesScore: number | null
  rottenTomatoesAudience: number | null
  metacriticScore: number | null
}

const OMDB_API_BASE = "http://www.omdbapi.com/"
const REQUEST_DELAY_MS = 200

let lastRequestTime = 0

/**
 * Rate limiter - ensures minimum 200ms delay between requests
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest),
    )
  }
  lastRequestTime = Date.now()
}

/**
 * Parse comma-formatted vote count string to integer
 * Example: "1,500,000" -> 1500000
 */
function parseVoteCount(voteStr: string): number | null {
  if (!voteStr || voteStr === "N/A") return null
  const cleaned = voteStr.replace(/,/g, "")
  const parsed = parseInt(cleaned, 10)
  return isNaN(parsed) ? null : parsed
}

/**
 * Parse rating string to float
 * Example: "8.5" -> 8.5
 */
function parseRating(ratingStr: string): number | null {
  if (!ratingStr || ratingStr === "N/A") return null
  const parsed = parseFloat(ratingStr)
  return isNaN(parsed) ? null : parsed
}

/**
 * Extract Rotten Tomatoes score from Ratings array
 * Returns critic score (Tomatometer) and audience score
 */
function extractRottenTomatoesScores(ratings: OMDbRating[]): {
  critics: number | null
  audience: number | null
} {
  let critics: number | null = null
  let audience: number | null = null

  for (const rating of ratings) {
    if (rating.Source === "Rotten Tomatoes") {
      // Format: "85%" or "85%/92%" (critics/audience)
      const match = rating.Value.match(/(\d+)%/)
      if (match) {
        critics = parseInt(match[1], 10)
      }

      // Check if there's a second percentage for audience score
      const audienceMatch = rating.Value.match(/\/(\d+)%/)
      if (audienceMatch) {
        audience = parseInt(audienceMatch[1], 10)
      }
    }
  }

  return { critics, audience }
}

/**
 * Extract Metacritic score from Ratings array
 * Returns score as 0-100 integer
 */
function extractMetacriticScore(ratings: OMDbRating[]): number | null {
  for (const rating of ratings) {
    if (rating.Source === "Metacritic") {
      // Format: "75/100"
      const match = rating.Value.match(/(\d+)\//)
      if (match) {
        return parseInt(match[1], 10)
      }
    }
  }
  return null
}

/**
 * Fetch ratings from OMDb API for a given IMDb ID
 *
 * @param imdbId - IMDb ID (e.g., "tt0111161")
 * @param apiKey - OMDb API key (defaults to OMDB_API_KEY env var)
 * @returns OMDbMetrics or null if not found or error
 */
export async function getOMDbRatings(
  imdbId: string,
  apiKey?: string,
): Promise<OMDbMetrics | null> {
  const key = apiKey || process.env.OMDB_API_KEY
  if (!key) {
    throw new Error("OMDB_API_KEY environment variable not set")
  }

  // Validate IMDb ID format
  if (!imdbId || !imdbId.match(/^tt\d+$/)) {
    return null
  }

  await waitForRateLimit()

  const url = `${OMDB_API_BASE}?apikey=${key}&i=${imdbId}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`OMDb API returned ${response.status}`)
    }

    const data = (await response.json()) as OMDbResponse

    if (data.Response === "False") {
      // Content not found or invalid IMDb ID
      return null
    }

    const imdbRating = parseRating(data.imdbRating)
    const imdbVotes = parseVoteCount(data.imdbVotes)
    const rottenTomatoes = extractRottenTomatoesScores(data.Ratings || [])
    const metacriticScore = extractMetacriticScore(data.Ratings || [])

    return {
      imdbRating,
      imdbVotes,
      rottenTomatoesScore: rottenTomatoes.critics,
      rottenTomatoesAudience: rottenTomatoes.audience,
      metacriticScore,
    }
  } catch (error) {
    console.error(`Error fetching OMDb ratings for ${imdbId}:`, error)
    return null
  }
}
