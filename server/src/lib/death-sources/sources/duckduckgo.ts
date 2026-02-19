/**
 * DuckDuckGo search source for death information.
 *
 * Uses DuckDuckGo's HTML search endpoint (free, no API key required).
 * Extends WebSearchBase to support link following for richer results.
 *
 * Falls back to browser-based DDG search with stealth mode when the
 * fetch-based approach hits a CAPTCHA (anomaly-modal).
 */

import { WebSearchBase } from "./web-search-base.js"
import type { ActorForEnrichment, SearchResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { decodeHtmlEntities as decodeEntities } from "../html-utils.js"
import { extractDomain } from "../link-follower.js"
import { isDuckDuckGoCaptcha, cleanDuckDuckGoUrl } from "../../shared/duckduckgo-search.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"

/** CSS selector for DDG search result elements */
const DDG_RESULTS_SELECTOR = ".result__url, .result__a, #links"

/** Time to wait after CAPTCHA solve for page reload */
const POST_CAPTCHA_WAIT_MS = 3000

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

    // Step 1: Try fetch-based DDG
    try {
      const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
        },
      })

      if (response.ok) {
        const html = await response.text()

        if (!isDuckDuckGoCaptcha(html)) {
          return { results: this.extractResultsFromHtml(html) }
        }

        // CAPTCHA detected — try browser fallback
        console.log("DuckDuckGo CAPTCHA detected, trying browser fallback...")
      }
    } catch {
      // fetch failed — try browser fallback
    }

    // Step 2: Try browser-based DDG with stealth mode
    try {
      const html = await this.fetchDdgWithBrowser(query)
      if (html) {
        return { results: this.extractResultsFromHtml(html) }
      }
    } catch (error) {
      // Browser fallback failed
      return {
        results: [],
        error: `DuckDuckGo search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }

    return {
      results: [],
      error: "DuckDuckGo CAPTCHA detected (all fallbacks exhausted)",
    }
  }

  /**
   * Fetch DDG search results using headless browser with stealth mode.
   * Returns the raw HTML or null if CAPTCHA could not be bypassed.
   */
  private async fetchDdgWithBrowser(query: string): Promise<string | null> {
    const { getBrowserPage } = await import("../browser-fetch.js")
    const { detectCaptcha, solveCaptcha, getBrowserAuthConfig } =
      await import("../browser-auth/index.js")

    const { page, context } = await getBrowserPage()

    try {
      const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
      await page.waitForSelector(DDG_RESULTS_SELECTOR, { timeout: 5000 }).catch(() => {})

      let html = await page.content()

      if (isDuckDuckGoCaptcha(html)) {
        // Try CAPTCHA solving as last resort
        const captchaResult = await detectCaptcha(page)
        if (captchaResult.detected) {
          const authConfig = getBrowserAuthConfig()
          if (authConfig.captchaSolver) {
            const solveResult = await solveCaptcha(page, captchaResult, authConfig.captchaSolver)
            if (solveResult.success) {
              await page
                .waitForLoadState("networkidle", { timeout: POST_CAPTCHA_WAIT_MS })
                .catch(() => {})
              html = await page.content()
            }
          }
        }

        if (isDuckDuckGoCaptcha(html)) {
          return null
        }
      }

      return html
    } finally {
      await page.close().catch(() => {})
      await context.close().catch(() => {})
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
        resultUrl = cleanDuckDuckGoUrl(urlMatch[1])
      }

      // Fall back to result__a href
      if (!resultUrl) {
        const linkMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/)
        if (linkMatch) {
          resultUrl = cleanDuckDuckGoUrl(linkMatch[1])
        }
      }

      // Extract title from result__a text
      let title = ""
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</)
      if (titleMatch) {
        title = decodeEntities(titleMatch[1].trim())
      }

      // Extract snippet
      let snippet = ""
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)</)
      if (snippetMatch) {
        snippet = decodeEntities(snippetMatch[1].trim())
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
      urls.push(cleanDuckDuckGoUrl(match[1]))
    }
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(decodeEntities(match[1].trim()))
    }
    while ((match = titleRegex.exec(html)) !== null) {
      titles.push(decodeEntities(match[1].trim()))
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
}
