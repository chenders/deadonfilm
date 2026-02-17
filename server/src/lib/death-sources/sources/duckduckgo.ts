/**
 * DuckDuckGo search source for death information.
 *
 * Uses DuckDuckGo's HTML search endpoint (free, no API key required).
 * Extends WebSearchBase to support link following for richer results.
 */

import { WebSearchBase } from "./web-search-base.js"
import type { ActorForEnrichment, SearchResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { decodeHtmlEntities as decodeEntities } from "../html-utils.js"
import { extractDomain } from "../link-follower.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"

/**
 * DuckDuckGo search source for death information.
 * Free and doesn't require an API key.
 */
export class DuckDuckGoSource extends WebSearchBase {
  readonly name = "DuckDuckGo"
  readonly type = DataSourceType.DUCKDUCKGO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SEARCH_AGGREGATOR

  // Be polite to DuckDuckGo
  protected minDelayMs = 1000

  /**
   * Perform the search and return standardized results with URLs.
   */
  protected async performSearch(actor: ActorForEnrichment): Promise<{
    results: SearchResult[]
    error?: string
  }> {
    const query = this.buildSearchQuery(actor)

    try {
      const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
        },
      })

      if (!response.ok) {
        return {
          results: [],
          error: `HTTP ${response.status}`,
        }
      }

      const html = await response.text()

      // Detect CAPTCHA/bot detection page
      if (html.includes("anomaly-modal") || html.includes("bots use DuckDuckGo too")) {
        return {
          results: [],
          error: "DuckDuckGo CAPTCHA detected (bot rate-limited)",
        }
      }

      // Extract search results with URLs
      const results = this.extractResultsFromHtml(html)

      return { results }
    } catch (error) {
      return {
        results: [],
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Extract search results with URLs, titles, and snippets from DuckDuckGo HTML.
   */
  private extractResultsFromHtml(html: string): SearchResult[] {
    const results: SearchResult[] = []

    // DuckDuckGo HTML structure uses result divs with links and snippets
    // Pattern: <a class="result__a" href="...">Title</a> ... <a class="result__snippet">Snippet</a>

    // Match result blocks - each result is in a div with class "result"
    const resultBlockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi
    let blockMatch

    while ((blockMatch = resultBlockRegex.exec(html)) !== null) {
      const block = blockMatch[1]

      // Extract URL from result__url or result__a href
      let resultUrl: string | null = null

      // Try result__url first (more reliable)
      const urlMatch = block.match(/class="result__url"[^>]*href="([^"]+)"/)
      if (urlMatch) {
        resultUrl = this.cleanUrl(urlMatch[1])
      }

      // Fall back to result__a href
      if (!resultUrl) {
        const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/)
        if (linkMatch) {
          resultUrl = this.cleanUrl(linkMatch[1])
        }
      }

      // Extract title from result__a text
      let title = ""
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</)
      if (titleMatch) {
        title = this.decodeHtmlEntities(titleMatch[1].trim())
      }

      // Extract snippet
      let snippet = ""
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)</)
      if (snippetMatch) {
        snippet = this.decodeHtmlEntities(snippetMatch[1].trim())
      }

      // Only include if we have a valid URL and some content
      if (resultUrl && resultUrl.startsWith("http") && (title || snippet)) {
        results.push({
          title,
          url: resultUrl,
          snippet,
          source: DataSourceType.DUCKDUCKGO,
          domain: extractDomain(resultUrl),
        })
      }
    }

    // If the block regex didn't work, try simpler extraction
    if (results.length === 0) {
      results.push(...this.extractResultsSimple(html))
    }

    return results
  }

  /**
   * Simpler extraction method as fallback.
   */
  private extractResultsSimple(html: string): SearchResult[] {
    const results: SearchResult[] = []

    // Extract URLs
    const urlRegex = /class="result__url"[^>]*href="([^"]+)"/g
    const snippetRegex = /class="result__snippet"[^>]*>([^<]+)</g
    const titleRegex = /class="result__a"[^>]*>([^<]+)</g

    const urls: string[] = []
    const snippets: string[] = []
    const titles: string[] = []

    let match
    while ((match = urlRegex.exec(html)) !== null) {
      urls.push(this.cleanUrl(match[1]))
    }
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(this.decodeHtmlEntities(match[1].trim()))
    }
    while ((match = titleRegex.exec(html)) !== null) {
      titles.push(this.decodeHtmlEntities(match[1].trim()))
    }

    // Combine - assume they're in order
    const count = Math.min(urls.length, Math.max(snippets.length, titles.length))
    for (let i = 0; i < count; i++) {
      const url = urls[i]
      if (url && url.startsWith("http")) {
        results.push({
          title: titles[i] || "",
          url,
          snippet: snippets[i] || "",
          source: DataSourceType.DUCKDUCKGO,
          domain: extractDomain(url),
        })
      }
    }

    return results
  }

  /**
   * Clean DuckDuckGo redirect URLs to get the actual destination URL.
   */
  private cleanUrl(url: string): string {
    // DuckDuckGo sometimes wraps URLs in a redirect
    // Format: //duckduckgo.com/l/?uddg=ENCODED_URL&...
    if (url.includes("duckduckgo.com/l/")) {
      const uddgMatch = url.match(/uddg=([^&]+)/)
      if (uddgMatch) {
        try {
          return decodeURIComponent(uddgMatch[1])
        } catch {
          // Fall through
        }
      }
    }

    // Handle protocol-relative URLs
    if (url.startsWith("//")) {
      return "https:" + url
    }

    return url
  }

  /**
   * Decode HTML entities in text.
   */
  private decodeHtmlEntities(text: string): string {
    return decodeEntities(text)
  }
}
