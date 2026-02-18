/**
 * Google Custom Search source for biography information.
 *
 * Uses the same Google Custom Search JSON API as death enrichment.
 * Requires GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX environment variables.
 *
 * Pricing (as of Jan 2025):
 * - Free tier: 100 queries/day (no billing required)
 * - Paid tier: $5 per 1000 queries ($0.005/query)
 *
 * @see https://developers.google.com/custom-search/v1/overview
 */

import { BiographyWebSearchBase } from "./web-search-base.js"
import type { ActorForBiography } from "../types.js"
import { BiographySourceType } from "../types.js"
import type { SearchResult, DataSourceType } from "../../death-sources/types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { extractDomain } from "../../death-sources/link-follower.js"

const GOOGLE_API_URL = "https://www.googleapis.com/customsearch/v1"

/**
 * Google Custom Search API response structure.
 */
interface GoogleSearchResponse {
  items?: Array<{
    title: string
    link: string
    snippet: string
    displayLink: string
  }>
  searchInformation?: {
    totalResults: string
    searchTime: number
  }
  error?: {
    code: number
    message: string
  }
}

/**
 * Google Custom Search source for biography information.
 * Requires API key and Custom Search Engine ID.
 */
export class GoogleBiographySearch extends BiographyWebSearchBase {
  readonly name = "Google (Bio)"
  readonly type = BiographySourceType.GOOGLE_SEARCH_BIO
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.005
  readonly reliabilityTier = ReliabilityTier.SEARCH_AGGREGATOR

  protected minDelayMs = 500

  /**
   * Check if Google search is available (API key configured).
   */
  isAvailable(): boolean {
    return !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX)
  }

  /**
   * Perform the search using Google Custom Search API.
   */
  protected async performSearch(actor: ActorForBiography): Promise<{
    results: SearchResult[]
    error?: string
  }> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY
    const cx = process.env.GOOGLE_SEARCH_CX

    if (!apiKey || !cx) {
      return {
        results: [],
        error: "Google Search API key or CX not configured",
      }
    }

    const query = this.buildBiographyQuery(actor)

    try {
      const url = new URL(GOOGLE_API_URL)
      url.searchParams.set("key", apiKey)
      url.searchParams.set("cx", cx)
      url.searchParams.set("q", query)
      url.searchParams.set("num", "10")

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": this.userAgent,
        },
        signal: this.createTimeoutSignal(),
      })

      const data = (await response.json()) as GoogleSearchResponse

      if (!response.ok || data.error) {
        const errorCode = data.error?.code || response.status
        const errorMessage = data.error?.message || `HTTP ${response.status}`

        if (errorCode === 429) {
          return {
            results: [],
            error: "Google API rate limit exceeded (100 free queries/day)",
          }
        }
        return {
          results: [],
          error: `Google API error ${errorCode}: ${errorMessage}`,
        }
      }

      if (!data.items || data.items.length === 0) {
        return {
          results: [],
          error: "No search results found",
        }
      }

      const results: SearchResult[] = data.items.map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet || "",
        source: BiographySourceType.GOOGLE_SEARCH_BIO as unknown as DataSourceType,
        domain: item.displayLink || extractDomain(item.link),
      }))

      return { results }
    } catch (error) {
      return {
        results: [],
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}
