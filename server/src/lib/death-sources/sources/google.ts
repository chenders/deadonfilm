/**
 * Google Custom Search source for death information.
 *
 * Uses the Google Custom Search JSON API (Programmable Search Engine).
 * Requires GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX environment variables.
 *
 * Setup:
 * 1. Enable Custom Search API at https://console.cloud.google.com/apis/library
 * 2. Create API key at APIs & Services → Credentials → Create Credentials → API Key
 * 3. Create search engine at https://programmablesearchengine.google.com/
 * 4. Set "Search the entire web" option
 *
 * Pricing (as of Jan 2025):
 * - Free tier: 100 queries/day (no billing required)
 * - Paid tier: $5 per 1000 queries ($0.005/query)
 * - No IAM roles needed - uses simple API key authentication
 *
 * @see https://developers.google.com/custom-search/v1/overview
 * @see https://developers.google.com/custom-search/v1/overview#pricing
 */

import { WebSearchBase } from "./web-search-base.js"
import type { ActorForEnrichment, SearchResult } from "../types.js"
import { DataSourceType } from "../types.js"
import { extractDomain } from "../link-follower.js"

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
    pagemap?: {
      metatags?: Array<{
        "og:title"?: string
        "og:description"?: string
      }>
    }
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
 * Google Custom Search source for death information.
 * Requires API key and Custom Search Engine ID.
 */
export class GoogleSearchSource extends WebSearchBase {
  readonly name = "Google"
  readonly type = DataSourceType.GOOGLE_SEARCH
  readonly isFree = false // Free tier is limited
  readonly estimatedCostPerQuery = 0.005 // $5 per 1000 queries

  // Google has good rate limits
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
  protected async performSearch(actor: ActorForEnrichment): Promise<{
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

    const query = this.buildSearchQuery(actor)

    try {
      const url = new URL(GOOGLE_API_URL)
      url.searchParams.set("key", apiKey)
      url.searchParams.set("cx", cx)
      url.searchParams.set("q", query)
      url.searchParams.set("num", "10") // Max results per request

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": this.userAgent,
        },
      })

      const data = (await response.json()) as GoogleSearchResponse

      if (!response.ok || data.error) {
        const errorCode = data.error?.code || response.status
        const errorMessage = data.error?.message || `HTTP ${response.status}`

        // Provide helpful error messages for common issues
        if (errorCode === 404) {
          return {
            results: [],
            error: `Invalid GOOGLE_SEARCH_CX: Search engine "${cx}" not found. Create one at https://programmablesearchengine.google.com/`,
          }
        }
        if (errorCode === 400) {
          return {
            results: [],
            error: `Invalid request: ${errorMessage}. Check GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX format`,
          }
        }
        if (errorCode === 403) {
          return {
            results: [],
            error: `API access denied: ${errorMessage}. Enable Custom Search API at https://console.cloud.google.com/apis/library/customsearch.googleapis.com`,
          }
        }
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

      // Convert to SearchResult format
      const results: SearchResult[] = data.items.map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet || "",
        source: DataSourceType.GOOGLE_SEARCH,
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
