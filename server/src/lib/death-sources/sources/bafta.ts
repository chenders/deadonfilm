/**
 * BAFTA source for film/television industry deaths.
 *
 * BAFTA (British Academy of Film and Television Arts) publishes
 * memorial and tribute pages for deceased members. This source uses
 * DuckDuckGo search to find BAFTA memorial/obituary pages and
 * extracts death-related information.
 *
 * Lower confidence (0.3-0.6) since these pages typically provide
 * career context rather than detailed cause of death information.
 *
 * Free to access via web scraping (no API key required).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"
import { extractDeathSentences, extractLocation, extractUrlFromSearchResults } from "./news-utils.js"

/**
 * BAFTA source for industry professional death information.
 */
export class BAFTASource extends BaseDataSource {
  readonly name = "BAFTA"
  readonly type = DataSourceType.BAFTA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limit
  protected minDelayMs = 1500

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    if (!actor.deathday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Actor is not deceased",
      }
    }

    try {
      // Search via DuckDuckGo HTML
      const searchQuery = `site:bafta.org "${actor.name}" "in memory" OR obituary OR tribute`
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`

      const searchResponse = await fetch(ddgUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (searchResponse.status === 403) {
        throw new SourceAccessBlockedError("Search blocked (403)", this.type, ddgUrl, 403)
      }

      if (!searchResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, ddgUrl),
          data: null,
          error: `Search failed: HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()
      const pageUrl = this.extractPageUrl(searchHtml, actor)

      if (!pageUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, ddgUrl),
          data: null,
          error: "Not found in BAFTA",
        }
      }

      // Fetch the BAFTA page
      await this.waitForRateLimit()
      const pageResponse = await fetch(pageUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (pageResponse.status === 403) {
        throw new SourceAccessBlockedError("BAFTA blocked access (403)", this.type, pageUrl, 403)
      }

      if (!pageResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, pageUrl),
          data: null,
          error: "Could not fetch BAFTA page",
        }
      }

      // Extract info
      const pageHtml = await pageResponse.text()
      const text = htmlToText(pageHtml)
      const deathSentences = extractDeathSentences(text, actor, 4)
      const locationOfDeath = extractLocation(text)

      if (deathSentences.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, pageUrl),
          data: null,
          error: "No death information found on BAFTA page",
        }
      }

      const circumstances = deathSentences.join(". ")
      let confidence = 0.3
      if (circumstances.length > 100) confidence += 0.1
      if (locationOfDeath) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, Math.min(confidence, 0.6), pageUrl),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors: [],
          relatedCelebrities: [],
          locationOfDeath,
          additionalContext: "Source: BAFTA (British Academy of Film and Television Arts)",
        },
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) throw error
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Extract BAFTA page URL from DuckDuckGo search results.
   */
  private extractPageUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?bafta\.org\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }
}
