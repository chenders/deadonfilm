/**
 * IBDB (Internet Broadway Database) source for Broadway actor deaths.
 *
 * IBDB is the official source for Broadway theatre information, maintained
 * by The Broadway League. Provides:
 * - Birth and death dates for Broadway performers
 * - Theatrical credits and roles
 * - Professional biographical information
 *
 * Note: IBDB blocks direct scraping (403). This source uses DuckDuckGo
 * HTML search to find IBDB person URLs, then fetches the page directly
 * with archive.org fallback on 403.
 *
 * IBDB returns circumstances: null — it only provides career context
 * (Broadway credits) and death date verification. Still useful as
 * supplementary data since the orchestrator merges data from multiple sources.
 *
 * Free to access via web scraping (no API key required).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"
import { fetchFromArchive } from "../archive-fallback.js"
import { extractUrlFromSearchResults, searchWeb } from "./news-utils.js"

/**
 * IBDB (Internet Broadway Database) source for Broadway actors.
 */
export class IBDBSource extends BaseDataSource {
  readonly name = "IBDB (Broadway)"
  readonly type = DataSourceType.IBDB
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Conservative rate limit to be respectful
  protected minDelayMs = 2000

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      // Search via searchWeb (DDG with Google CSE fallback; IBDB blocks direct scraping)
      const searchQuery = `site:ibdb.com "${actor.name}" broadway`
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

      // Find IBDB person URL in search results
      const personUrl = this.extractIBDBUrl(searchHtml, actor)

      if (!personUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "Actor not found in IBDB search results",
        }
      }

      // Fetch the person page
      await this.waitForRateLimit()
      const personData = await this.fetchPersonPage(personUrl)

      if (!personData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, personUrl),
          data: null,
          error: "Could not parse IBDB person page",
        }
      }

      // IBDB focuses on theatrical credits, limited death info
      // But death dates are valuable for verification
      let confidence = 0.3 // Base confidence for Broadway data
      if (personData.deathDate) confidence += 0.2
      if (personData.birthDate) confidence += 0.1
      if (personData.notableRoles.length > 0) confidence += 0.1

      // Build career context from theatrical credits
      const careerContext =
        personData.notableRoles.length > 0
          ? `Broadway credits include: ${personData.notableRoles.slice(0, 5).join(", ")}`
          : null

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, personUrl, undefined, personData),
        data: {
          circumstances: null, // IBDB doesn't have death circumstances
          rumoredCircumstances: null,
          notableFactors: ["broadway", "theater"],
          relatedCelebrities: [],
          locationOfDeath: null,
          additionalContext: careerContext,
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
   * Extract IBDB person URL from DuckDuckGo search results.
   */
  private extractIBDBUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?ibdb\.com\/broadway-cast-staff\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }

  /**
   * Fetch and parse a person's IBDB page.
   * Falls back to archive.org on 403.
   */
  private async fetchPersonPage(url: string): Promise<IBDBPersonData | null> {
    try {
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
        console.log(`  IBDB blocked (403), trying archive.org fallback...`)
        const archiveResult = await fetchFromArchive(url)
        if (archiveResult.success && archiveResult.content) {
          console.log(`  Archive.org fallback succeeded for IBDB`)
          return this.parsePersonPage(archiveResult.content)
        }
        throw new SourceAccessBlockedError(
          `IBDB returned 403 Forbidden on person page`,
          this.type,
          url,
          403
        )
      }

      if (!response.ok) {
        return null
      }

      const html = await response.text()
      return this.parsePersonPage(html)
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      return null
    }
  }

  /**
   * Parse person page HTML.
   */
  private parsePersonPage(html: string): IBDBPersonData {
    const data: IBDBPersonData = {
      name: null,
      birthDate: null,
      deathDate: null,
      birthPlace: null,
      notableRoles: [],
      awardsCount: 0,
    }

    // Extract name from title or heading
    const titleMatch = html.match(/<title>([^<|]+)/i)
    if (titleMatch) {
      data.name = this.cleanHtml(titleMatch[1]).trim()
    }

    // Look for birth/death dates
    // IBDB format varies but often: "Born: Month DD, YYYY" or "(YYYY - YYYY)"
    const dateRangeMatch = html.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/i)
    if (dateRangeMatch) {
      data.birthDate = dateRangeMatch[1]
      data.deathDate = dateRangeMatch[2]
    }

    // Alternative date formats
    const birthMatch = html.match(/(?:Born|Birth)[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4})/i)
    if (birthMatch && !data.birthDate) {
      data.birthDate = birthMatch[1]
    }

    const deathMatch = html.match(/(?:Died|Death)[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|\d{4})/i)
    if (deathMatch && !data.deathDate) {
      data.deathDate = deathMatch[1]
    }

    // Extract birth place
    const placeMatch = html.match(/(?:Born in|Birth Place)[:\s]+([A-Z][a-zA-Z\s,]+)/i)
    if (placeMatch) {
      data.birthPlace = placeMatch[1].trim()
    }

    // Extract notable roles/shows
    // Look for show titles in credits
    const showPattern = /<a[^>]*href="\/broadway-production\/[^"]*"[^>]*>([^<]+)<\/a>/gi
    let showMatch
    const shows = new Set<string>()
    while ((showMatch = showPattern.exec(html)) !== null) {
      const show = this.cleanHtml(showMatch[1]).trim()
      if (show.length > 2 && show.length < 80) {
        shows.add(show)
      }
    }
    data.notableRoles = [...shows].slice(0, 10)

    // Count awards (Tony, Drama Desk, etc.)
    const awardPatterns = [/Tony Award/gi, /Drama Desk/gi, /Theatre World/gi, /Outer Critics/gi]
    for (const pattern of awardPatterns) {
      const matches = html.match(pattern)
      if (matches) {
        data.awardsCount += matches.length
      }
    }

    return data
  }

  /**
   * Clean HTML tags and entities.
   */
  private cleanHtml(html: string): string {
    return htmlToText(html)
  }
}

interface IBDBPersonData {
  name: string | null
  birthDate: string | null
  deathDate: string | null
  birthPlace: string | null
  notableRoles: string[]
  awardsCount: number
}
