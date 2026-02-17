/**
 * Brave Search source for death information.
 *
 * Uses the Brave Web Search API.
 * Requires BRAVE_SEARCH_API_KEY environment variable.
 *
 * Setup:
 * 1. Create account at https://brave.com/search/api/
 * 2. Subscribe to a plan (free tier: 2000 queries/month)
 * 3. Copy API key from dashboard
 *
 * Pricing (as of Jan 2025):
 * - Free tier: 2000 queries/month (1 query/second)
 * - Base plan: $5 per 1000 queries ($0.005/query)
 * - Includes both web and news results in same query
 *
 * @see https://api.search.brave.com/app/#/documentation
 * @see https://brave.com/search/api/#pricing
 */

import { WebSearchBase } from "./web-search-base.js"
import type { ActorForEnrichment, SearchResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { extractDomain } from "../link-follower.js"

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search"

/**
 * Brave Web Search API response structure.
 */
interface BraveSearchResponse {
  web?: {
    results: Array<{
      title: string
      url: string
      description: string
    }>
  }
  news?: {
    results: Array<{
      title: string
      url: string
      description: string
      age?: string
    }>
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * Brave Search source for death information.
 * Requires API key from Brave Search.
 */
export class BraveSearchSource extends WebSearchBase {
  readonly name = "Brave Search"
  readonly type = DataSourceType.BRAVE_SEARCH
  readonly isFree = false // Free tier is limited
  readonly estimatedCostPerQuery = 0.005 // Approximately $5 per 1000 queries
  readonly reliabilityTier = ReliabilityTier.SEARCH_AGGREGATOR

  // Brave has reasonable rate limits
  protected minDelayMs = 500

  /**
   * Check if Brave Search is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.BRAVE_SEARCH_API_KEY
  }

  /**
   * Perform the search using Brave Web Search API.
   */
  protected async performSearch(actor: ActorForEnrichment): Promise<{
    results: SearchResult[]
    error?: string
  }> {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY

    if (!apiKey) {
      return {
        results: [],
        error: "Brave Search API key not configured",
      }
    }

    const query = this.buildSearchQuery(actor)

    try {
      const url = new URL(BRAVE_API_URL)
      url.searchParams.set("q", query)
      url.searchParams.set("count", "20")
      url.searchParams.set("search_lang", "en")

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": this.userAgent,
          "X-Subscription-Token": apiKey,
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          return {
            results: [],
            error: "Invalid Brave Search API key",
          }
        }
        if (response.status === 429) {
          return {
            results: [],
            error: "Brave Search API rate limit exceeded",
          }
        }
        return {
          results: [],
          error: `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as BraveSearchResponse

      if (data.error) {
        return {
          results: [],
          error: data.error.message,
        }
      }

      const results: SearchResult[] = []

      // Add web results
      if (data.web?.results) {
        for (const item of data.web.results) {
          results.push({
            title: item.title,
            url: item.url,
            snippet: item.description || "",
            source: DataSourceType.BRAVE_SEARCH,
            domain: extractDomain(item.url),
          })
        }
      }

      // Add news results (often have good death coverage)
      if (data.news?.results) {
        for (const item of data.news.results) {
          // Avoid duplicates
          const alreadyHaveUrl = results.some((r) => r.url === item.url)
          if (!alreadyHaveUrl) {
            results.push({
              title: item.title,
              url: item.url,
              snippet: item.description || "",
              source: DataSourceType.BRAVE_SEARCH,
              domain: extractDomain(item.url),
            })
          }
        }
      }

      if (results.length === 0) {
        return {
          results: [],
          error: "No search results found",
        }
      }

      return { results }
    } catch (error) {
      return {
        results: [],
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}
