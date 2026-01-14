/**
 * Find a Grave source for death information.
 *
 * Find a Grave has memorial pages with:
 * - Obituary text
 * - Death dates and locations
 * - Bio information that may include cause of death
 * - Cemetery/burial information
 *
 * Free to use via web scraping (no API key required).
 */

import {
  BaseDataSource,
  CIRCUMSTANCE_KEYWORDS,
  DEATH_KEYWORDS,
  NOTABLE_FACTOR_KEYWORDS,
} from "../base-source.js"
import type {
  ActorForEnrichment,
  SourceLookupResult,
} from "../types.js"
import { DataSourceType } from "../types.js"

const FINDAGRAVE_SEARCH_URL = "https://www.findagrave.com/memorial/search"
const FINDAGRAVE_BASE_URL = "https://www.findagrave.com"

/**
 * Find a Grave source for obituary and memorial information.
 */
export class FindAGraveSource extends BaseDataSource {
  readonly name = "Find a Grave"
  readonly type = DataSourceType.FINDAGRAVE
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Be respectful to their servers
  protected minDelayMs = 2000

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    // Parse name parts for search
    const nameParts = actor.name.split(" ")
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(" ")

    if (!lastName) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Cannot search with single name",
      }
    }

    // Build search URL
    const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

    const searchParams = new URLSearchParams({
      firstname: firstName,
      lastname: lastName,
    })

    if (birthYear) {
      searchParams.set("birthyear", String(birthYear))
    }
    if (deathYear) {
      searchParams.set("deathyear", String(deathYear))
    }

    const searchUrl = `${FINDAGRAVE_SEARCH_URL}?${searchParams.toString()}`

    try {
      console.log(`Find a Grave search for: ${actor.name}`)

      // Search for the person
      const searchResponse = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (!searchResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: `Search failed: HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()

      // Find memorial links in search results
      const memorialUrl = this.extractMemorialUrl(searchHtml, actor)

      if (!memorialUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No matching memorial found",
        }
      }

      console.log(`  Found memorial: ${memorialUrl}`)

      // Wait before fetching memorial page
      await this.waitForRateLimit()

      // Fetch the memorial page
      const memorialResponse = await fetch(memorialUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (!memorialResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, memorialUrl),
          data: null,
          error: `Memorial page failed: HTTP ${memorialResponse.status}`,
        }
      }

      const memorialHtml = await memorialResponse.text()

      // Extract death information from memorial page
      const data = this.parseMemorialPage(memorialHtml)

      if (!data.circumstances && !data.locationOfDeath) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, memorialUrl),
          data: null,
          error: "No death details found on memorial page",
        }
      }

      // Calculate confidence based on what we found
      let confidence = 0.3
      if (data.circumstances) confidence += 0.3
      if (data.locationOfDeath) confidence += 0.1
      if (data.notableFactors.length > 0) confidence += 0.2

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, memorialUrl),
        data: {
          circumstances: data.circumstances,
          rumoredCircumstances: null,
          notableFactors: data.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: data.locationOfDeath,
          additionalContext: data.bio,
        },
      }
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, searchUrl),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Extract memorial URL from search results.
   */
  private extractMemorialUrl(html: string, actor: ActorForEnrichment): string | null {
    // Look for memorial links in the search results
    // Pattern: <a href="/memorial/12345/name-here" class="memorial-item">
    const memorialRegex = /href="(\/memorial\/\d+\/[^"]+)"/g
    const matches: string[] = []

    let match
    while ((match = memorialRegex.exec(html)) !== null) {
      matches.push(match[1])
    }

    if (matches.length === 0) {
      return null
    }

    // Try to find the best match based on name
    const normalizedActorName = actor.name.toLowerCase().replace(/[^a-z]/g, "")

    for (const memorialPath of matches) {
      // Extract name from URL path
      const urlName = memorialPath
        .split("/")
        .pop()
        ?.replace(/-/g, "")
        .toLowerCase() || ""

      if (urlName.includes(normalizedActorName) || normalizedActorName.includes(urlName)) {
        return `${FINDAGRAVE_BASE_URL}${memorialPath}`
      }
    }

    // If no good match, return the first result
    return `${FINDAGRAVE_BASE_URL}${matches[0]}`
  }

  /**
   * Parse memorial page for death information.
   */
  private parseMemorialPage(html: string): ParsedMemorialData {
    const result: ParsedMemorialData = {
      circumstances: null,
      locationOfDeath: null,
      notableFactors: [],
      bio: null,
    }

    // Extract bio section
    const bioMatch = html.match(/<div[^>]*id="bio"[^>]*>([\s\S]*?)<\/div>/i)
    if (bioMatch) {
      result.bio = this.cleanHtml(bioMatch[1])
    }

    // Also check for obituary/death info sections
    const deathSectionMatch = html.match(
      /<div[^>]*class="[^"]*(?:obituary|death-info|memorial-text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    )
    if (deathSectionMatch) {
      const deathText = this.cleanHtml(deathSectionMatch[1])
      if (this.containsDeathInfo(deathText)) {
        result.circumstances = this.extractCircumstances(deathText)
      }
    }

    // Try to extract death info from bio
    if (!result.circumstances && result.bio) {
      if (this.containsDeathInfo(result.bio)) {
        result.circumstances = this.extractCircumstances(result.bio)
      }
    }

    // Extract location from the page (bounded quantifiers to prevent ReDoS)
    // eslint-disable-next-line security/detect-unsafe-regex
    const locationMatch = html.match(/(?:died|death|passed away)[^.]{0,50}(?:in|at)\s+([A-Z][a-zA-Z\s,]{1,50}(?:,\s*[A-Z]{2})?)/i)
    if (locationMatch) {
      result.locationOfDeath = locationMatch[1].trim()
    }

    // Also look for burial location which often indicates death location
    const burialMatch = html.match(/burial[^:]*:\s*([^<\n]+)/i)
    if (burialMatch && !result.locationOfDeath) {
      // Extract city/state from burial location
      const burialText = this.cleanHtml(burialMatch[1])
      if (burialText.length < 100) {
        result.locationOfDeath = burialText
      }
    }

    // Extract notable factors
    result.notableFactors = this.extractNotableFactors(
      `${result.bio || ""} ${result.circumstances || ""}`
    )

    return result
  }

  /**
   * Check if text contains death-related information.
   */
  private containsDeathInfo(text: string): boolean {
    const lower = text.toLowerCase()
    return DEATH_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
  }

  /**
   * Extract circumstances from text.
   */
  private extractCircumstances(text: string): string | null {
    // Find sentences mentioning death
    const sentences = text.split(/[.!?]+/).map((s) => s.trim())
    const deathSentences = sentences.filter((s) => this.containsDeathInfo(s))

    if (deathSentences.length === 0) {
      return null
    }

    // Take first 2 relevant sentences
    return deathSentences
      .slice(0, 2)
      .join(". ")
      .replace(/\s+/g, " ")
      .trim()
  }

  /**
   * Extract notable factors from text.
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []
    const lower = text.toLowerCase()

    for (const keyword of NOTABLE_FACTOR_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        factors.push(keyword)
      }
    }

    // Also check circumstance keywords
    for (const keyword of CIRCUMSTANCE_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        if (!factors.includes(keyword)) {
          factors.push(keyword)
        }
      }
    }

    return [...new Set(factors)].slice(0, 5)
  }

  /**
   * Clean HTML tags and entities from text.
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

interface ParsedMemorialData {
  circumstances: string | null
  locationOfDeath: string | null
  notableFactors: string[]
  bio: string | null
}
