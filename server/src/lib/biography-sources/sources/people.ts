/**
 * People Magazine biography source.
 *
 * Searches for actor profiles and biographical content on people.com
 * via DuckDuckGo site-restricted search, then fetches and cleans the article.
 *
 * Reliability tier: MARGINAL_EDITORIAL (0.65) - celebrity magazine, decent for
 * personal life details and interviews but less authoritative than news sources.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { decodeHtmlEntities } from "../../death-sources/html-utils.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"
const MIN_CONTENT_LENGTH = 200

export class PeopleBiographySource extends BaseBiographySource {
  readonly name = "People"
  readonly type = BiographySourceType.PEOPLE_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.MARGINAL_EDITORIAL

  protected minDelayMs = 1500
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search DuckDuckGo for people.com pages about this actor
    const query = `site:people.com "${actor.name}" profile OR biography OR interview OR "personal life"`
    const urls = await this.searchDuckDuckGo(query)

    if (urls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: "No People results found via DuckDuckGo",
      }
    }

    // Step 2: Pick the best URL (prefer profile pages, avoid gallery/video)
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
          error: `People page fetch failed: HTTP ${response.status}`,
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
        error: `People page fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
          publication: "People",
          domain: "people.com",
        }),
        data: null,
        error: `People content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || `${actor.name} - People`

    const sourceData: RawBiographySourceData = {
      sourceName: "People",
      sourceType: BiographySourceType.PEOPLE_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "People",
      articleTitle,
      domain: "people.com",
      contentType: "profile",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "People",
        articleTitle,
        domain: "people.com",
        contentType: "profile",
      }),
      data: sourceData,
    }
  }

  /**
   * Search DuckDuckGo HTML endpoint and return matching URLs.
   */
  private async searchDuckDuckGo(query: string): Promise<string[]> {
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

    return this.extractUrlsFromDuckDuckGoHtml(html)
  }

  /**
   * Extract People.com URLs from DuckDuckGo HTML search results.
   */
  private extractUrlsFromDuckDuckGoHtml(html: string): string[] {
    const urls: string[] = []

    // Extract from result__url href attributes
    const urlRegex = /class="result__url"[^>]*href="([^"]+)"/g
    let match
    while ((match = urlRegex.exec(html)) !== null) {
      const cleaned = this.cleanDuckDuckGoUrl(match[1])
      if (cleaned.includes("people.com")) {
        urls.push(cleaned)
      }
    }

    // Fallback: try result__a href attributes
    if (urls.length === 0) {
      const linkRegex = /class="result__a"[^>]*href="([^"]+)"/g
      while ((match = linkRegex.exec(html)) !== null) {
        const cleaned = this.cleanDuckDuckGoUrl(match[1])
        if (cleaned.includes("people.com")) {
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
   * Pick the best URL from candidates. Avoid gallery/video/list pages.
   */
  private pickBestUrl(urls: string[]): string {
    const avoidPatterns = ["/gallery/", "/video/", "/news/", "/shopping/", "/food/"]
    const profileUrl = urls.find((u) => !avoidPatterns.some((pattern) => u.includes(pattern)))
    return profileUrl ?? urls[0]
  }
}
