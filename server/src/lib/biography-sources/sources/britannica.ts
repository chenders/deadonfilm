/**
 * Britannica biography source.
 *
 * Searches for actor biographies on britannica.com via DuckDuckGo site-restricted
 * search, fetches the article, and cleans it through the content cleaning pipeline.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - Britannica is an authoritative encyclopedia.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { decodeHtmlEntities } from "../../death-sources/html-utils.js"

const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"
const MIN_CONTENT_LENGTH = 200

export class BritannicaBiographySource extends BaseBiographySource {
  readonly name = "Britannica"
  readonly type = BiographySourceType.BRITANNICA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  protected minDelayMs = 1500
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search DuckDuckGo for britannica.com pages about this actor
    const query = `site:britannica.com "${actor.name}" biography`
    const urls = await this.searchDuckDuckGo(query)

    if (urls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: "No Britannica results found via DuckDuckGo",
      }
    }

    // Step 2: Pick the best URL (prefer /biography/ paths)
    const targetUrl = this.pickBestUrl(urls)

    // Step 3: Fetch the page
    let pageHtml: string
    try {
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": this.userAgent },
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
          error: `Britannica page fetch failed: HTTP ${response.status}`,
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
        error: `Britannica page fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
          publication: "Encyclopaedia Britannica",
          domain: "britannica.com",
        }),
        data: null,
        error: `Britannica content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || `${actor.name} - Britannica`

    const sourceData: RawBiographySourceData = {
      sourceName: "Britannica",
      sourceType: BiographySourceType.BRITANNICA,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "Encyclopaedia Britannica",
      articleTitle,
      domain: "britannica.com",
      contentType: "biography",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "Encyclopaedia Britannica",
        articleTitle,
        domain: "britannica.com",
        contentType: "biography",
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
   * Extract URLs from DuckDuckGo HTML search results.
   */
  private extractUrlsFromDuckDuckGoHtml(html: string): string[] {
    const urls: string[] = []

    // Extract from result__url href attributes
    const urlRegex = /class="result__url"[^>]*href="([^"]+)"/g
    let match
    while ((match = urlRegex.exec(html)) !== null) {
      const cleaned = this.cleanDuckDuckGoUrl(match[1])
      if (cleaned.includes("britannica.com")) {
        urls.push(cleaned)
      }
    }

    // Fallback: try result__a href attributes
    if (urls.length === 0) {
      const linkRegex = /class="result__a"[^>]*href="([^"]+)"/g
      while ((match = linkRegex.exec(html)) !== null) {
        const cleaned = this.cleanDuckDuckGoUrl(match[1])
        if (cleaned.includes("britannica.com")) {
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
    // Handle DuckDuckGo redirect: //duckduckgo.com/l/?uddg=ENCODED_URL&...
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

    // Handle protocol-relative URLs
    if (url.startsWith("//")) {
      return "https:" + url
    }

    return url
  }

  /**
   * Pick the best URL from candidates. Prefer /biography/ paths.
   */
  private pickBestUrl(urls: string[]): string {
    const biographyUrl = urls.find((u) => u.includes("/biography/"))
    return biographyUrl ?? urls[0]
  }
}
