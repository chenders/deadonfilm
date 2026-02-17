/**
 * WGA (Writers Guild of America) In Memoriam source for writer deaths.
 *
 * The WGA maintains an In Memoriam section honoring deceased members.
 * This source uses DuckDuckGo search to find WGA memorial/obituary pages
 * and extracts death-related information.
 *
 * Lower confidence (0.3-0.6) since these pages typically provide
 * career context rather than detailed cause of death information.
 *
 * Free to access via web scraping (no API key required).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"
import {
  extractDeathSentences,
  extractLocation,
  extractUrlFromSearchResults,
  searchWeb,
} from "./news-utils.js"

/**
 * WGA In Memoriam source for writer death information.
 */
export class WGASource extends BaseDataSource {
  readonly name = "WGA In Memoriam"
  readonly type = DataSourceType.WGA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TRADE_PRESS

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
      // Search via searchWeb (DDG with Google CSE fallback)
      const searchQuery = `site:wga.org "${actor.name}" "in memoriam" OR obituary`
      const { html: searchHtml, error: searchError } = await searchWeb(searchQuery, {
        userAgent: this.userAgent,
        signal: this.createTimeoutSignal(),
      })

      if (searchError || !searchHtml) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: searchError || "Search returned no results",
        }
      }

      const pageUrl = this.extractPageUrl(searchHtml, actor)

      if (!pageUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "Not found in WGA",
        }
      }

      // Fetch the WGA page
      await this.waitForRateLimit()
      const pageResponse = await fetch(pageUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (pageResponse.status === 403) {
        throw new SourceAccessBlockedError("WGA blocked access (403)", this.type, pageUrl, 403)
      }

      if (!pageResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, pageUrl),
          data: null,
          error: "Could not fetch WGA page",
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
          error: "No death information found on WGA page",
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
          additionalContext: "Source: Writers Guild of America In Memoriam",
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
   * Extract WGA page URL from DuckDuckGo search results.
   */
  private extractPageUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?wga\.org\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }
}
