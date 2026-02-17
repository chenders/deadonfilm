/**
 * Bing Web Search source for death information.
 *
 * Uses the Bing Web Search API v7 (Azure Cognitive Services).
 * Requires BING_SEARCH_API_KEY environment variable.
 *
 * Setup:
 * 1. Create Azure account at https://portal.azure.com/
 * 2. Create "Bing Search" resource (search for "Bing Search v7")
 * 3. Copy key from Keys and Endpoint section
 *
 * Pricing (as of Jan 2025):
 * - Free tier (F0): 1000 queries/month
 * - S1 tier: $3 per 1000 queries ($0.003/query)
 * - Includes both web and news results in same query
 *
 * @see https://docs.microsoft.com/en-us/bing/search-apis/bing-web-search/overview
 * @see https://azure.microsoft.com/en-us/pricing/details/cognitive-services/search-api/
 */

import { WebSearchBase } from "./web-search-base.js"
import type { ActorForEnrichment, SearchResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { extractDomain } from "../link-follower.js"

const BING_API_URL = "https://api.bing.microsoft.com/v7.0/search"

/**
 * Bing Web Search API response structure.
 */
interface BingSearchResponse {
  webPages?: {
    value: Array<{
      name: string
      url: string
      displayUrl: string
      snippet: string
      dateLastCrawled?: string
      language?: string
    }>
    totalEstimatedMatches?: number
  }
  news?: {
    value: Array<{
      name: string
      url: string
      description: string
      datePublished?: string
      provider?: Array<{ name: string }>
    }>
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * Bing Web Search source for death information.
 * Requires API key from Azure Cognitive Services.
 */
export class BingSearchSource extends WebSearchBase {
  readonly name = "Bing"
  readonly type = DataSourceType.BING_SEARCH
  readonly isFree = false // Free tier is limited
  readonly estimatedCostPerQuery = 0.003 // Approximately $3 per 1000 queries
  readonly reliabilityTier = ReliabilityTier.SEARCH_AGGREGATOR

  // Bing has good rate limits
  protected minDelayMs = 500

  /**
   * Check if Bing search is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.BING_SEARCH_API_KEY
  }

  /**
   * Perform the search using Bing Web Search API.
   */
  protected async performSearch(actor: ActorForEnrichment): Promise<{
    results: SearchResult[]
    error?: string
  }> {
    const apiKey = process.env.BING_SEARCH_API_KEY

    if (!apiKey) {
      return {
        results: [],
        error: "Bing Search API key not configured",
      }
    }

    const query = this.buildSearchQuery(actor)

    try {
      const url = new URL(BING_API_URL)
      url.searchParams.set("q", query)
      url.searchParams.set("count", "20") // Request up to 20 results
      url.searchParams.set("mkt", "en-US")
      url.searchParams.set("responseFilter", "Webpages,News") // Include news results

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": this.userAgent,
          "Ocp-Apim-Subscription-Key": apiKey,
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          return {
            results: [],
            error: "Invalid Bing API key",
          }
        }
        if (response.status === 429) {
          return {
            results: [],
            error: "Bing API rate limit exceeded",
          }
        }
        return {
          results: [],
          error: `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as BingSearchResponse

      if (data.error) {
        return {
          results: [],
          error: data.error.message,
        }
      }

      const results: SearchResult[] = []

      // Add web page results
      if (data.webPages?.value) {
        for (const item of data.webPages.value) {
          results.push({
            title: item.name,
            url: item.url,
            snippet: item.snippet || "",
            source: DataSourceType.BING_SEARCH,
            domain: extractDomain(item.url),
          })
        }
      }

      // Add news results (often have good death coverage)
      if (data.news?.value) {
        for (const item of data.news.value) {
          // Avoid duplicates
          const alreadyHaveUrl = results.some((r) => r.url === item.url)
          if (!alreadyHaveUrl) {
            results.push({
              title: item.name,
              url: item.url,
              snippet: item.description || "",
              source: DataSourceType.BING_SEARCH,
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
