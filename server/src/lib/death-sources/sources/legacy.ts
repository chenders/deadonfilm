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
 * Free to access via web scraping (no API key required).
 */

import {
  BaseDataSource,
  CIRCUMSTANCE_KEYWORDS,
  DEATH_KEYWORDS,
  NOTABLE_FACTOR_KEYWORDS,
} from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"
import { htmlToText } from "../html-utils.js"

const LEGACY_SEARCH_URL = "https://www.legacy.com/search"
const LEGACY_BASE_URL = "https://www.legacy.com"

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
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

    const searchParams = new URLSearchParams({
      firstName: firstName,
      lastName: lastName,
      countryId: "1", // US
    })

    // Legacy.com uses date ranges for search
    if (deathYear) {
      // Search within 1 year of death date
      searchParams.set("dateRange", "Custom")
      searchParams.set("startDate", `${deathYear - 1}-01-01`)
      searchParams.set("endDate", `${deathYear + 1}-12-31`)
    }

    const searchUrl = `${LEGACY_SEARCH_URL}?${searchParams.toString()}`

    try {
      console.log(`Legacy.com search for: ${actor.name}`)

      // Search for obituaries
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

      // Find obituary links in search results
      const obituaryUrl = this.extractObituaryUrl(searchHtml, actor)

      if (!obituaryUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No matching obituary found",
        }
      }

      console.log(`  Found obituary: ${obituaryUrl}`)

      // Wait before fetching obituary page
      await this.waitForRateLimit()

      // Fetch the obituary page
      const obituaryResponse = await fetch(obituaryUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (!obituaryResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, obituaryUrl),
          data: null,
          error: `Obituary page failed: HTTP ${obituaryResponse.status}`,
        }
      }

      const obituaryHtml = await obituaryResponse.text()

      // Extract death information from obituary page
      const data = this.parseObituaryPage(obituaryHtml)

      if (!data.circumstances && !data.locationOfDeath) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, obituaryUrl),
          data: null,
          error: "No death details found in obituary",
        }
      }

      // Calculate confidence based on what we found
      let confidence = 0.4 // Legacy.com obituaries tend to be reliable
      if (data.circumstances) confidence += 0.3
      if (data.locationOfDeath) confidence += 0.1
      if (data.notableFactors.length > 0) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, obituaryUrl),
        data: {
          circumstances: data.circumstances,
          rumoredCircumstances: null,
          notableFactors: data.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: data.locationOfDeath,
          additionalContext: data.fullText,
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
   * Extract obituary URL from search results.
   */
  private extractObituaryUrl(html: string, actor: ActorForEnrichment): string | null {
    // Look for obituary links in the search results
    // Legacy.com uses various URL patterns
    const obituaryPatterns = [/href="(\/us\/obituaries\/[^"]+)"/g, /href="(\/obituaries\/[^"]+)"/g]

    const matches: string[] = []

    for (const pattern of obituaryPatterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        matches.push(match[1])
      }
    }

    if (matches.length === 0) {
      return null
    }

    // Try to find the best match based on name
    const normalizedActorName = actor.name.toLowerCase().replace(/[^a-z]/g, "")

    for (const obituaryPath of matches) {
      // Extract name from URL path
      const urlName =
        obituaryPath.split("/").pop()?.replace(/-/g, "").replace(/\d+/g, "").toLowerCase() || ""

      if (urlName.includes(normalizedActorName) || normalizedActorName.includes(urlName)) {
        return `${LEGACY_BASE_URL}${obituaryPath}`
      }
    }

    // If no good match, return the first result
    return `${LEGACY_BASE_URL}${matches[0]}`
  }

  /**
   * Parse obituary page for death information.
   */
  private parseObituaryPage(html: string): ParsedObituaryData {
    const result: ParsedObituaryData = {
      circumstances: null,
      locationOfDeath: null,
      notableFactors: [],
      fullText: null,
    }

    // Extract obituary text - Legacy.com uses various class names
    const textPatterns = [
      /<div[^>]*class="[^"]*obit-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*obituary-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*obit-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]

    let obituaryText = ""

    for (const pattern of textPatterns) {
      const match = html.match(pattern)
      if (match) {
        obituaryText = this.cleanHtml(match[1])
        if (obituaryText.length > 50) {
          break
        }
      }
    }

    if (obituaryText) {
      result.fullText = obituaryText.substring(0, 2000) // Limit length

      // Extract death circumstances
      if (this.containsDeathInfo(obituaryText)) {
        result.circumstances = this.extractCircumstances(obituaryText)
      }

      // Extract notable factors
      result.notableFactors = this.extractNotableFactors(obituaryText)
    }

    // Extract location - look for common patterns
    const locationPatterns = [
      // eslint-disable-next-line security/detect-unsafe-regex -- Bounded quantifiers prevent catastrophic backtracking
      /(?:died|passed away)[^.]{0,50}(?:in|at)\s+([A-Z][a-zA-Z\s,]{1,50}(?:,\s*[A-Z]{2})?)/i,
      // eslint-disable-next-line security/detect-unsafe-regex -- Bounded quantifiers prevent catastrophic backtracking
      /([A-Z][a-zA-Z]+(?:,\s*[A-Z]{2})?)\s*[-–]\s*[A-Z][a-z]+\s+\d/,
    ]

    for (const pattern of locationPatterns) {
      const match = html.match(pattern)
      if (match) {
        const location = match[1].trim()
        if (location.length < 60) {
          result.locationOfDeath = location
          break
        }
      }
    }

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
   * Extract circumstances from obituary text.
   */
  private extractCircumstances(text: string): string | null {
    // Find sentences mentioning death cause or manner
    const sentences = text.split(/[.!?]+/).map((s) => s.trim())
    const deathSentences = sentences.filter((s) => this.containsDeathInfo(s))

    if (deathSentences.length === 0) {
      return null
    }

    // Look for sentences with more specific cause information
    const causeKeywords = [
      "cause of death",
      "died from",
      "died of",
      "passed away from",
      "succumbed to",
      "lost battle",
      "after battling",
      "complications from",
      "following",
    ]

    const lower = text.toLowerCase()
    for (const keyword of causeKeywords) {
      if (lower.includes(keyword)) {
        // Find the sentence containing this keyword
        for (const sentence of deathSentences) {
          if (sentence.toLowerCase().includes(keyword)) {
            return sentence.replace(/\s+/g, " ").trim()
          }
        }
      }
    }

    // Return first 2 relevant sentences
    return deathSentences.slice(0, 2).join(". ").replace(/\s+/g, " ").trim()
  }

  /**
   * Extract notable factors from obituary text.
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
    return htmlToText(html)
  }
}

interface ParsedObituaryData {
  circumstances: string | null
  locationOfDeath: string | null
  notableFactors: string[]
  fullText: string | null
}
