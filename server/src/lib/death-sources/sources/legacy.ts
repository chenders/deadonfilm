/**
 * Legacy.com source for obituary information.
 *
 * Legacy.com is one of the largest obituary sites with modern obituaries.
 * Provides:
 * - Full obituary text
 * - Death dates and locations
 * - Funeral/service information
 * - Family information that may include cause of death
 *
 * Uses DuckDuckGo HTML search to find Legacy.com obituary URLs,
 * then fetches and parses the obituary page directly.
 * Falls back to archive.org if the obituary page returns 403.
 *
 * Free to access via web scraping (no API key required).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"
import { fetchFromArchive } from "../archive-fallback.js"
import {
  extractLocation,
  extractNotableFactors,
  extractDeathSentences,
  extractUrlFromSearchResults,
  searchWeb,
} from "./news-utils.js"

/**
 * Legacy.com source for modern obituaries.
 */
export class LegacySource extends BaseDataSource {
  readonly name = "Legacy.com"
  readonly type = DataSourceType.LEGACY
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Be respectful to their servers
  protected minDelayMs = 2000

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    // Death date required for Legacy.com search (used to narrow results by year)
    if (!actor.deathday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "No death date provided",
      }
    }

    // Need at least a last name for search
    const nameParts = actor.name.split(" ")
    if (nameParts.length < 2) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Cannot search with single name",
      }
    }

    try {
      // Search via DDG with Google CSE fallback
      const deathYear = new Date(actor.deathday).getFullYear()
      const searchQuery = `site:legacy.com "${actor.name}" obituary ${deathYear}`
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

      // Find Legacy.com obituary URLs in search results
      const obituaryUrl = this.extractLegacyUrl(searchHtml, actor)

      if (!obituaryUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No Legacy.com obituary found in search results",
        }
      }

      // Fetch the obituary page
      await this.waitForRateLimit()
      const obituaryData = await this.fetchObituaryPage(obituaryUrl, actor)

      if (!obituaryData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, obituaryUrl),
          data: null,
          error: "Could not fetch Legacy.com obituary",
        }
      }

      if (!obituaryData.circumstances && !obituaryData.locationOfDeath) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, obituaryUrl),
          data: null,
          error: "No death details found in obituary",
        }
      }

      // Calculate confidence
      let confidence = 0.4 // Legacy.com obituaries tend to be reliable
      if (obituaryData.circumstances) confidence += 0.3
      if (obituaryData.locationOfDeath) confidence += 0.1
      if (obituaryData.notableFactors.length > 0) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, Math.min(confidence, 0.85), obituaryUrl),
        data: {
          circumstances: obituaryData.circumstances,
          rumoredCircumstances: null,
          notableFactors: obituaryData.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: obituaryData.locationOfDeath,
          additionalContext: "Source: Legacy.com (obituary database)",
        },
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Extract Legacy.com URL from DuckDuckGo search results.
   */
  private extractLegacyUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?legacy\.com\/(?:us\/)?obituaries\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }

  /**
   * Fetch and parse a Legacy.com obituary page.
   */
  private async fetchObituaryPage(
    url: string,
    actor: ActorForEnrichment
  ): Promise<ObituaryData | null> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: this.createTimeoutSignal(),
    })

    if (response.status === 403) {
      // Try archive.org fallback before giving up
      console.log(`  Legacy.com blocked (403), trying archive.org fallback...`)
      const archiveResult = await fetchFromArchive(url)
      if (archiveResult.success && archiveResult.content) {
        console.log(`  Archive.org fallback succeeded for Legacy.com`)
        return this.parseObituaryPage(archiveResult.content, actor)
      }
      throw new SourceAccessBlockedError(`Legacy.com blocked access (403)`, this.type, url, 403)
    }

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    return this.parseObituaryPage(html, actor)
  }

  /**
   * Parse obituary page HTML for death information.
   */
  private parseObituaryPage(html: string, actor: ActorForEnrichment): ObituaryData {
    const text = htmlToText(html)

    // Extract death-related sentences using shared utility
    const deathSentences = extractDeathSentences(text, actor, 4)

    return {
      circumstances: deathSentences.length > 0 ? deathSentences.join(". ") : null,
      locationOfDeath: extractLocation(text),
      notableFactors: extractNotableFactors(text),
    }
  }
}

interface ObituaryData {
  circumstances: string | null
  locationOfDeath: string | null
  notableFactors: string[]
}
