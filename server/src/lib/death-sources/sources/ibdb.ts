/**
 * IBDB (Internet Broadway Database) source for Broadway actor deaths.
 *
 * IBDB is the official source for Broadway theatre information, maintained
 * by The Broadway League. Provides:
 * - Birth and death dates for Broadway performers
 * - Theatrical credits and roles
 * - Professional biographical information
 *
 * Note: IBDB has anti-scraping protection that may return 403 errors.
 * This source uses browser-like headers to attempt access. If blocked,
 * it flags the source for review to investigate alternative access methods.
 *
 * Free to access (when accessible) via web scraping (no API key required).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

const IBDB_BASE_URL = "https://www.ibdb.com"
const IBDB_SEARCH_URL = `${IBDB_BASE_URL}/search`

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

  /**
   * Browser-like headers to avoid 403 blocking.
   */
  private readonly browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      console.log(`IBDB search for: ${actor.name}`)

      // Search for the actor
      const searchUrl = `${IBDB_SEARCH_URL}?q=${encodeURIComponent(actor.name)}&type=person`

      const searchResponse = await fetch(searchUrl, {
        headers: this.browserHeaders,
      })

      // Check for blocking
      if (searchResponse.status === 403) {
        throw new SourceAccessBlockedError(
          `IBDB returned 403 Forbidden - anti-scraping protection active`,
          this.type,
          searchUrl,
          403
        )
      }

      if (!searchResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: `HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()

      // Find matching person in search results
      const personUrl = this.findPersonInResults(searchHtml, actor)

      if (!personUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "Actor not found in IBDB search results",
        }
      }

      console.log(`  Found IBDB page: ${personUrl}`)

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
        // Log this specifically - source needs review for alternative access
        console.warn(`  IBDB BLOCKED: ${error.message}`)
        throw error
      }

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, IBDB_SEARCH_URL),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Find matching person URL in search results.
   */
  private findPersonInResults(html: string, actor: ActorForEnrichment): string | null {
    // IBDB person URLs: /broadway-cast-staff/{name}-{id}
    const personPattern = /href="(\/broadway-cast-staff\/[^"]+)"/g
    const matches: string[] = []

    let match
    while ((match = personPattern.exec(html)) !== null) {
      matches.push(match[1])
    }

    if (matches.length === 0) {
      return null
    }

    // Normalize actor name for matching
    const normalizedName = actor.name.toLowerCase().replace(/[^a-z]/g, "")
    const nameParts = actor.name.toLowerCase().split(" ")
    const lastName = nameParts[nameParts.length - 1]
    const firstName = nameParts[0]

    // Try to find best match
    for (const personPath of matches) {
      const pathName = personPath
        .replace("/broadway-cast-staff/", "")
        .replace(/-\d+$/, "") // Remove ID
        .replace(/-/g, "")

      // Exact match
      if (pathName === normalizedName) {
        return `${IBDB_BASE_URL}${personPath}`
      }

      // Contains first and last name
      if (pathName.includes(firstName) && pathName.includes(lastName)) {
        return `${IBDB_BASE_URL}${personPath}`
      }
    }

    // Return first result as fallback if it contains the last name
    for (const personPath of matches) {
      if (personPath.toLowerCase().includes(lastName)) {
        return `${IBDB_BASE_URL}${personPath}`
      }
    }

    return null
  }

  /**
   * Fetch and parse a person's IBDB page.
   */
  private async fetchPersonPage(url: string): Promise<IBDBPersonData | null> {
    try {
      const response = await fetch(url, {
        headers: this.browserHeaders,
      })

      if (response.status === 403) {
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
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim()
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
