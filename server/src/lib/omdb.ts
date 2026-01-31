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
  totalSeasons?: string // TV series only - "8"
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

export interface OMDbSearchResult {
  Title: string
  Year: string
  imdbID: string
  Type: string // "movie" | "series" | "episode" | "game"
  Poster: string
}

export interface OMDbSearchResponse {
  Search?: OMDbSearchResult[]
  totalResults?: string
  Response: "True" | "False"
  Error?: string
}

export interface OMDbExtendedMetrics extends OMDbMetrics {
  boxOfficeCents: number | null // Movies only - revenue in cents
  awardsWins: number | null // Both movies and shows
  awardsNominations: number | null // Both movies and shows
  totalSeasons: number | null // TV shows only
}

const OMDB_API_BASE = "https://www.omdbapi.com/"
const REQUEST_DELAY_MS = 200

let lastRequestTime = 0

/**
 * Rate limiter - ensures minimum 200ms delay between requests
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest))
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
 * Parse box office revenue string to cents
 * Example: "$58,300,000" -> 5830000000
 * Returns null for "N/A" or invalid formats
 */
export function parseBoxOffice(boxOffice: string): number | null {
  if (!boxOffice || boxOffice === "N/A") return null

  // Remove $ and commas, then parse
  const cleaned = boxOffice.replace(/[$,]/g, "").trim()

  // Validate that the cleaned string contains only digits
  if (!/^\d+$/.test(cleaned)) return null

  const dollars = parseInt(cleaned, 10)

  if (isNaN(dollars) || dollars < 0) return null

  // Convert to cents
  return dollars * 100
}

/**
 * Parse awards string to extract wins and nominations
 * Examples:
 *   "Won 7 Oscars. 90 wins & 100 nominations" -> { wins: 90, nominations: 100 }
 *   "Won 2 Emmys. 45 wins & 200 nominations total" -> { wins: 45, nominations: 200 }
 *   "1 win & 2 nominations" -> { wins: 1, nominations: 2 }
 *   "N/A" -> { wins: null, nominations: null }
 */
export function parseAwards(awards: string): { wins: number | null; nominations: number | null } {
  if (!awards || awards === "N/A") {
    return { wins: null, nominations: null }
  }

  let wins: number | null = null
  let nominations: number | null = null

  // Match "X wins" or "X win" (case-insensitive)
  const winsMatch = awards.match(/(\d+)\s*wins?/i)
  if (winsMatch) {
    wins = parseInt(winsMatch[1], 10)
  }

  // Match "X nominations" or "X nomination" (case-insensitive)
  const nominationsMatch = awards.match(/(\d+)\s*nominations?/i)
  if (nominationsMatch) {
    nominations = parseInt(nominationsMatch[1], 10)
  }

  return { wins, nominations }
}

/**
 * Parse total seasons string to number
 * Example: "8" -> 8
 * Returns null for "N/A" or invalid values
 */
export function parseTotalSeasons(seasons: string): number | null {
  if (!seasons || seasons === "N/A") return null

  const trimmed = seasons.trim()

  // Validate that the string contains only digits
  if (!/^\d+$/.test(trimmed)) return null

  const parsed = parseInt(trimmed, 10)
  if (isNaN(parsed) || parsed < 0) return null

  return parsed
}

/**
 * Fetch ratings from OMDb API for a given IMDb ID
 *
 * @param imdbId - IMDb ID (e.g., "tt0111161")
 * @param apiKey - OMDb API key (defaults to OMDB_API_KEY env var)
 * @returns OMDbExtendedMetrics or null if not found or error
 */
export async function getOMDbRatings(
  imdbId: string,
  apiKey?: string
): Promise<OMDbExtendedMetrics | null> {
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

    // Parse extended fields
    const boxOfficeCents = parseBoxOffice(data.BoxOffice)
    const awards = parseAwards(data.Awards)
    const totalSeasons = parseTotalSeasons(data.totalSeasons || "")

    return {
      imdbRating,
      imdbVotes,
      rottenTomatoesScore: rottenTomatoes.critics,
      rottenTomatoesAudience: rottenTomatoes.audience,
      metacriticScore,
      boxOfficeCents,
      awardsWins: awards.wins,
      awardsNominations: awards.nominations,
      totalSeasons,
    }
  } catch (error) {
    console.error(`Error fetching OMDb ratings for ${imdbId}:`, error)
    return null
  }
}

/**
 * Search OMDb by exact title match.
 *
 * Uses the "t" (title) parameter which returns a single result
 * if an exact match is found.
 *
 * @param title - Movie/series title to search for
 * @param year - Optional release year to narrow results
 * @param type - Content type filter ("movie" or "series")
 * @param apiKey - OMDb API key (defaults to OMDB_API_KEY env var)
 * @returns Single search result or null if not found
 */
export async function searchOMDbByTitle(
  title: string,
  year?: number,
  type: "movie" | "series" = "movie",
  apiKey?: string
): Promise<OMDbSearchResult | null> {
  const key = apiKey || process.env.OMDB_API_KEY
  if (!key) {
    throw new Error("OMDB_API_KEY environment variable not set")
  }

  await waitForRateLimit()

  const params = new URLSearchParams({
    apikey: key,
    t: title,
    type,
  })
  if (year) {
    params.set("y", year.toString())
  }

  const url = `${OMDB_API_BASE}?${params.toString()}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`OMDb API returned ${response.status}`)
    }

    const data = (await response.json()) as OMDbResponse

    if (data.Response === "False") {
      return null
    }

    return {
      Title: data.Title,
      Year: data.Year,
      imdbID: data.imdbID,
      Type: data.Type,
      Poster: data.Poster,
    }
  } catch (error) {
    console.error(`Error searching OMDb for title "${title}":`, error)
    return null
  }
}

/**
 * Search OMDb by keyword.
 *
 * Uses the "s" (search) parameter which returns multiple results.
 * Returns up to 10 results per page (OMDb default).
 *
 * @param title - Movie/series title to search for
 * @param year - Optional release year to narrow results
 * @param type - Content type filter ("movie" or "series")
 * @param apiKey - OMDb API key (defaults to OMDB_API_KEY env var)
 * @returns Array of search results (may be empty)
 */
export async function searchOMDb(
  title: string,
  year?: number,
  type: "movie" | "series" = "movie",
  apiKey?: string
): Promise<OMDbSearchResult[]> {
  const key = apiKey || process.env.OMDB_API_KEY
  if (!key) {
    throw new Error("OMDB_API_KEY environment variable not set")
  }

  await waitForRateLimit()

  const params = new URLSearchParams({
    apikey: key,
    s: title,
    type,
  })
  if (year) {
    params.set("y", year.toString())
  }

  const url = `${OMDB_API_BASE}?${params.toString()}`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`OMDb API returned ${response.status}`)
    }

    const data = (await response.json()) as OMDbSearchResponse

    if (data.Response === "False" || !data.Search) {
      return []
    }

    return data.Search
  } catch (error) {
    console.error(`Error searching OMDb for "${title}":`, error)
    return []
  }
}
