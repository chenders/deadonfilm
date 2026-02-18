/**
 * Brave Search source for biography information.
 *
 * Uses the Brave Web Search API.
 * Requires BRAVE_SEARCH_API_KEY environment variable.
 *
 * Pricing (as of Jan 2025):
 * - Free tier: 2000 queries/month (1 query/second)
 * - Base plan: $5 per 1000 queries ($0.005/query)
 * - Includes both web and news results in same query
 *
 * @see https://api.search.brave.com/app/#/documentation
 */

import { BiographyWebSearchBase } from "./web-search-base.js"
import type { ActorForBiography } from "../types.js"
import { BiographySourceType } from "../types.js"
import type { SearchResult, DataSourceType } from "../../death-sources/types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { extractDomain } from "../../death-sources/link-follower.js"

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
 * Brave Search source for biography information.
 * Requires API key from Brave Search.
 */
export class BraveBiographySearch extends BiographyWebSearchBase {
  readonly name = "Brave (Bio)"
  readonly type = BiographySourceType.BRAVE_SEARCH_BIO
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.005
  readonly reliabilityTier = ReliabilityTier.SEARCH_AGGREGATOR

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
  protected async performSearch(actor: ActorForBiography): Promise<{
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

    const query = this.buildBiographyQuery(actor)

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
        signal: this.createTimeoutSignal(),
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
            source: BiographySourceType.BRAVE_SEARCH_BIO as unknown as DataSourceType,
            domain: extractDomain(item.url),
          })
        }
      }

      // Add news results (often have good biographical coverage)
      if (data.news?.results) {
        for (const item of data.news.results) {
          // Avoid duplicates
          const alreadyHaveUrl = results.some((r) => r.url === item.url)
          if (!alreadyHaveUrl) {
            results.push({
              title: item.title,
              url: item.url,
              snippet: item.description || "",
              source: BiographySourceType.BRAVE_SEARCH_BIO as unknown as DataSourceType,
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
