/**
 * AP News biography source.
 *
 * Searches for actor profiles and biographical content on apnews.com
 * via DuckDuckGo site-restricted search, then fetches and cleans the article.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - authoritative wire service.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { decodeHtmlEntities } from "../../death-sources/html-utils.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"
const MIN_CONTENT_LENGTH = 200

export class APNewsBiographySource extends BaseBiographySource {
  readonly name = "AP News"
  readonly type = BiographySourceType.AP_NEWS_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  protected minDelayMs = 1500
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search DuckDuckGo for apnews.com pages about this actor
    const query = `site:apnews.com "${actor.name}" profile OR biography OR interview`
    const urls = await this.searchDuckDuckGo(query, "apnews.com")

    if (urls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: "No AP News results found via DuckDuckGo",
      }
    }

    // Step 2: Pick the best URL (prefer /article/ paths)
    const targetUrl = this.pickBestUrl(urls)

    // Step 3: Fetch the page
    let pageHtml: string
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: targetUrl,
            queryUsed: query,
          }),
          data: null,
          error: `AP News page fetch failed: HTTP ${response.status}`,
        }
      }

      pageHtml = await response.text()
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, {
          url: targetUrl,
          queryUsed: query,
        }),
        data: null,
        error: `AP News page fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }

    // Step 4: Clean through mechanical pre-clean pipeline
    const { text, metadata } = mechanicalPreClean(pageHtml)

    // Step 5: Check minimum content length
    if (text.length < MIN_CONTENT_LENGTH) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, {
          url: targetUrl,
          queryUsed: query,
          publication: "Associated Press",
          domain: "apnews.com",
        }),
        data: null,
        error: `AP News content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || `${actor.name} - AP News`

    const sourceData: RawBiographySourceData = {
      sourceName: "AP News",
      sourceType: BiographySourceType.AP_NEWS_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "Associated Press",
      articleTitle,
      domain: "apnews.com",
      contentType: "profile",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "Associated Press",
        articleTitle,
        domain: "apnews.com",
        contentType: "profile",
      }),
      data: sourceData,
    }
  }

  /**
   * Search DuckDuckGo HTML endpoint and return matching URLs for the target domain.
   */
  private async searchDuckDuckGo(query: string, targetDomain: string): Promise<string[]> {
    const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      headers: { "User-Agent": this.userAgent },
      signal: this.createTimeoutSignal(),
    })

    if (!response.ok) {
      throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`)
    }

    const html = await response.text()

    // Detect CAPTCHA/bot detection
    if (html.includes("anomaly-modal") || html.includes("bots use DuckDuckGo too")) {
      throw new Error("DuckDuckGo CAPTCHA detected (bot rate-limited)")
    }

    return this.extractUrlsFromDuckDuckGoHtml(html, targetDomain)
  }

  /**
   * Extract URLs from DuckDuckGo HTML search results.
   */
  private extractUrlsFromDuckDuckGoHtml(html: string, targetDomain: string): string[] {
    const urls: string[] = []

    // Extract from result__url href attributes
    const urlRegex = /class="result__url"[^>]*href="([^"]+)"/g
    let match
    while ((match = urlRegex.exec(html)) !== null) {
      const cleaned = this.cleanDuckDuckGoUrl(match[1])
      if (cleaned.includes(targetDomain)) {
        urls.push(cleaned)
      }
    }

    // Fallback: try result__a href attributes
    if (urls.length === 0) {
      const linkRegex = /class="result__a"[^>]*href="([^"]+)"/g
      while ((match = linkRegex.exec(html)) !== null) {
        const cleaned = this.cleanDuckDuckGoUrl(match[1])
        if (cleaned.includes(targetDomain)) {
          urls.push(cleaned)
        }
      }
    }

    return urls
  }

  /**
   * Clean DuckDuckGo redirect URLs to extract the actual destination URL.
   */
  private cleanDuckDuckGoUrl(url: string): string {
    if (url.includes("duckduckgo.com/l/")) {
      const uddgMatch = url.match(/uddg=([^&]+)/)
      if (uddgMatch) {
        try {
          return decodeURIComponent(decodeHtmlEntities(uddgMatch[1]))
        } catch {
          // Fall through
        }
      }
    }

    if (url.startsWith("//")) {
      return "https:" + url
    }

    return url
  }

  /**
   * Pick the best URL from candidates. Prefer /article/ paths.
   */
  private pickBestUrl(urls: string[]): string {
    const articleUrl = urls.find((u) => u.includes("/article/"))
    return articleUrl ?? urls[0]
  }
}
