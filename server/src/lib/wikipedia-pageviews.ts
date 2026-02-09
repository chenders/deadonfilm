/**
 * Wikipedia Pageviews API Client
 *
 * Fetches monthly pageview data from the Wikimedia REST API for use as a
 * fame signal in actor popularity scoring.
 *
 * API docs: https://wikimedia.org/api/rest_v1/
 * Rate limit: 200 req/s stated, but in practice ~10 req/s avoids 429s
 * Auth: None required, but User-Agent header is mandatory per Wikimedia policy
 */

const WIKIMEDIA_API_BASE =
  "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents"

const USER_AGENT = "DeadOnFilm/1.0 (https://deadonfilm.com; contact@deadonfilm.com)"

const REQUEST_DELAY_MS = 100

/** Max retries on 429 responses */
const MAX_RETRIES = 3

/** Base delay for retry backoff (ms) */
const RETRY_BASE_DELAY_MS = 2000

/** Months to consider as a "death spike" window */
const DEATH_SPIKE_MONTHS = 3

export interface MonthlyPageview {
  timestamp: string // YYYYMMDDHH format from API (e.g. "2025010100" for 2025-01-01 00:00 UTC)
  views: number
}

/**
 * Rate limiter to enforce minimum delay between requests (~10 req/s)
 */
class WikipediaRateLimiter {
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

const rateLimiter = new WikipediaRateLimiter()

/**
 * Extract the article title from a Wikipedia URL.
 *
 * Handles various URL formats:
 * - https://en.wikipedia.org/wiki/Tom_Cruise
 * - https://en.wikipedia.org/wiki/Tom_Cruise#section
 * - https://en.m.wikipedia.org/wiki/Tom_Cruise
 */
export function extractArticleTitle(wikipediaUrl: string): string | null {
  if (!wikipediaUrl) return null

  try {
    const url = new URL(wikipediaUrl)
    const hostname = url.hostname

    // Must be an English Wikipedia URL
    if (!hostname.match(/^en\.(?:m\.)?wikipedia\.org$/)) {
      return null
    }

    const pathMatch = url.pathname.match(/^\/wiki\/(.+)$/)
    if (!pathMatch) return null

    // Decode percent-encoded characters, strip fragment
    const title = decodeURIComponent(pathMatch[1]).split("#")[0]
    return title || null
  } catch {
    return null
  }
}

/**
 * Format a date as YYYYMMDDHH for the Wikimedia API.
 * The hour component is always "00" (UTC midnight).
 */
function formatApiDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  return `${y}${m}${d}00`
}

/**
 * Fetch monthly pageview data for a Wikipedia article.
 *
 * @param articleTitle - The article title (e.g. "Tom_Cruise")
 * @param months - Number of trailing months to fetch (default 12)
 * @returns Array of monthly pageview data, or empty array on error
 */
export async function fetchMonthlyPageviews(
  articleTitle: string,
  months: number = 12
): Promise<MonthlyPageview[]> {
  await rateLimiter.waitForRateLimit()

  // Align to full calendar months for the Wikimedia monthly endpoint.
  // Use the first day of the previous month as the end boundary (the API
  // range is inclusive), so we get exactly `months` complete months of data.
  const now = new Date()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - (months - 1))

  const url = `${WIKIMEDIA_API_BASE}/${encodeURIComponent(articleTitle)}/monthly/${formatApiDate(start)}/${formatApiDate(end)}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await rateLimiter.waitForRateLimit()
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
        },
      })

      if (response.status === 404) {
        // Article doesn't exist or has no pageview data
        return []
      }

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      if (!response.ok) {
        console.error(`Wikipedia pageviews API error: ${response.status} for "${articleTitle}"`)
        return []
      }

      const data = (await response.json()) as {
        items: Array<{ timestamp: string; views: number }>
      }

      return (data.items ?? []).map((item) => ({
        timestamp: item.timestamp,
        views: item.views,
      }))
    } catch (error) {
      // Network errors (DNS, connection refused) are not retryable
      console.error(`Wikipedia pageviews fetch error for "${articleTitle}":`, error)
      return []
    }
  }

  return []
}

/**
 * Calculate annual pageviews with death spike handling.
 *
 * If the actor died within the last DEATH_SPIKE_MONTHS months, the death
 * causes a temporary traffic spike that doesn't reflect true fame.
 * In that case, we use pre-death monthly baseline × 12.
 *
 * @param monthlyData - Monthly pageview data from the API
 * @param deathDate - ISO date string of actor's death, or null/undefined
 * @returns Estimated annual pageviews
 */
export function calculateAnnualPageviews(
  monthlyData: MonthlyPageview[],
  deathDate?: string | null
): number {
  if (monthlyData.length === 0) return 0

  // Check if actor died recently (within DEATH_SPIKE_MONTHS)
  if (deathDate) {
    const death = new Date(deathDate)
    const now = new Date()
    const monthsSinceDeath =
      (now.getUTCFullYear() - death.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - death.getUTCMonth())

    if (monthsSinceDeath >= 0 && monthsSinceDeath < DEATH_SPIKE_MONTHS) {
      // Use pre-death baseline: find months before death month
      const deathYM = death.getUTCFullYear() * 100 + (death.getUTCMonth() + 1)

      const preDeathMonths = monthlyData.filter((m) => {
        // Timestamp format: "2025010100" — extract YYYYMM
        const ym = parseInt(m.timestamp.slice(0, 6), 10)
        return ym < deathYM
      })

      if (preDeathMonths.length > 0) {
        const preDeathAvg =
          preDeathMonths.reduce((sum, m) => sum + m.views, 0) / preDeathMonths.length
        return Math.round(preDeathAvg * 12)
      }
      // If no pre-death data available, fall through to simple sum
    }
  }

  // Simple sum of all monthly data
  return monthlyData.reduce((sum, m) => sum + m.views, 0)
}

/**
 * Convenience wrapper: extract title → fetch pageviews → calculate annual total.
 *
 * @param wikipediaUrl - Full Wikipedia URL
 * @param deathDate - ISO date string of actor's death, or null
 * @returns Estimated annual pageviews, or null if URL is invalid/no data
 */
export async function fetchActorPageviews(
  wikipediaUrl: string,
  deathDate?: string | null
): Promise<number | null> {
  const title = extractArticleTitle(wikipediaUrl)
  if (!title) return null

  const monthlyData = await fetchMonthlyPageviews(title)
  if (monthlyData.length === 0) return null

  return calculateAnnualPageviews(monthlyData, deathDate)
}
