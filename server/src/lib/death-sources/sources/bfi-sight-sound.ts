/**
 * BFI Sight & Sound source for film industry obituaries.
 *
 * BFI (British Film Institute) publishes comprehensive annual "In Memoriam"
 * lists covering international film industry professionals. Provides:
 * - Birth and death dates
 * - Brief career descriptions
 * - Sometimes death circumstances
 * - Individual obituary articles for major figures
 *
 * Coverage: ~280+ people per year across all film industry roles.
 * Free to access via web scraping (no API key required).
 */

import {
  BaseDataSource,
  CIRCUMSTANCE_KEYWORDS,
  DEATH_KEYWORDS,
  NOTABLE_FACTOR_KEYWORDS,
} from "../base-source.js"
import { escapeRegex } from "../../text-utils.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const BFI_BASE_URL = "https://www.bfi.org.uk"

/**
 * BFI Sight & Sound source for international film industry obituaries.
 */
export class BFISightSoundSource extends BaseDataSource {
  readonly name = "BFI Sight & Sound"
  readonly type = DataSourceType.BFI_SIGHT_SOUND
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limit
  protected minDelayMs = 1500

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    // Need death year to find the correct memoriam page
    if (!actor.deathday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "No death date available - cannot determine memoriam year",
      }
    }

    const deathYear = new Date(actor.deathday).getFullYear()
    const memoriamUrl = `${BFI_BASE_URL}/sight-and-sound/lists/memoriam-obituaries-those-who-died-${deathYear}`

    try {
      console.log(`BFI Sight & Sound search for: ${actor.name} (died ${deathYear})`)

      // Fetch the annual memoriam page
      const response = await fetch(memoriamUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (response.status === 403) {
        throw new SourceAccessBlockedError(
          `BFI returned 403 Forbidden for ${memoriamUrl}`,
          this.type,
          memoriamUrl,
          403
        )
      }

      if (response.status === 404) {
        // Try previous year (death may have been late December, listed in next year's memoriam)
        return this.tryAlternateYear(actor, deathYear - 1, startTime)
      }

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, memoriamUrl),
          data: null,
          error: `HTTP ${response.status}`,
        }
      }

      const html = await response.text()

      // Search for actor in the memoriam list
      const entry = this.findActorInMemoriam(html, actor)

      if (!entry) {
        // Actor not found in this year, try adjacent year
        return this.tryAlternateYear(actor, deathYear + 1, startTime)
      }

      console.log(`  Found in BFI memoriam: ${entry.name}`)

      // If there's a link to an individual obituary, fetch it for more detail
      let detailedData: ParsedBFIData | null = null
      if (entry.obituaryUrl) {
        console.log(`  Fetching individual obituary: ${entry.obituaryUrl}`)
        await this.waitForRateLimit()
        detailedData = await this.fetchIndividualObituary(entry.obituaryUrl)
      }

      // Merge data from list entry and individual obituary
      const circumstances = detailedData?.circumstances || entry.description || null
      const locationOfDeath = detailedData?.locationOfDeath || entry.locationOfDeath || null

      // Calculate confidence
      let confidence = 0.5 // BFI is a reliable professional source
      if (circumstances) confidence += 0.2
      if (locationOfDeath) confidence += 0.1
      if (detailedData) confidence += 0.1 // Detailed obituary adds confidence

      const notableFactors = this.extractNotableFactors(
        (entry.description || "") + " " + (detailedData?.fullText || "")
      )

      return {
        success: true,
        source: this.createSourceEntry(
          startTime,
          confidence,
          entry.obituaryUrl || memoriamUrl,
          undefined,
          { entry, detailedData }
        ),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors,
          relatedCelebrities: [],
          locationOfDeath,
          additionalContext: entry.description,
        },
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        // Re-throw access blocked errors for special handling
        throw error
      }

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, memoriamUrl),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Try an alternate year's memoriam page.
   */
  private async tryAlternateYear(
    actor: ActorForEnrichment,
    year: number,
    startTime: number
  ): Promise<SourceLookupResult> {
    const altUrl = `${BFI_BASE_URL}/sight-and-sound/lists/memoriam-obituaries-those-who-died-${year}`

    try {
      await this.waitForRateLimit()

      const response = await fetch(altUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, altUrl),
          data: null,
          error: `Actor not found in BFI memoriam lists`,
        }
      }

      const html = await response.text()
      const entry = this.findActorInMemoriam(html, actor)

      if (!entry) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, altUrl),
          data: null,
          error: `Actor not found in BFI memoriam lists`,
        }
      }

      // Found in alternate year
      let confidence = 0.4
      if (entry.description) confidence += 0.2

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, entry.obituaryUrl || altUrl),
        data: {
          circumstances: entry.description || null,
          rumoredCircumstances: null,
          notableFactors: this.extractNotableFactors(entry.description || ""),
          relatedCelebrities: [],
          locationOfDeath: entry.locationOfDeath,
          additionalContext: null,
        },
      }
    } catch {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, altUrl),
        data: null,
        error: "Failed to fetch alternate year memoriam",
      }
    }
  }

  /**
   * Find actor entry in the memoriam HTML.
   */
  private findActorInMemoriam(html: string, actor: ActorForEnrichment): MemoriamEntry | null {
    // BFI format: "Name (birth date – death date): description"
    // Example: "Gene Hackman (30 Jan 1930 – 26 Feb 2025): whose screen presence..."

    // Normalize actor name for matching
    const normalizedName = actor.name.toLowerCase().trim()
    const nameParts = normalizedName.split(" ")
    const lastName = nameParts[nameParts.length - 1]

    // Try multiple patterns to find the entry
    const patterns = [
      // BFI actual format: <strong>Name (dates)</strong>: description
      // Example: <strong>Gene Hackman (30 Jan 1930 – c.18 Feb 2025)</strong>: description
      // eslint-disable-next-line security/detect-non-literal-regexp -- Using escapeRegex for safe regex construction
      new RegExp(
        `<strong>\\s*(${escapeRegex(actor.name)})\\s*\\(([^)]+)\\)\\s*</strong>\\s*:?\\s*([^<]{10,500})`,
        "i"
      ),
      // Full name with dates inside any tag
      // eslint-disable-next-line security/detect-non-literal-regexp -- Using escapeRegex for safe regex construction
      new RegExp(
        `<[^>]*>\\s*(${escapeRegex(actor.name)})\\s*\\(([^)]+)\\)\\s*</[^>]*>\\s*:?\\s*([^<]{10,500})`,
        "i"
      ),
      // Full name with dates pattern (dates outside tag)
      // eslint-disable-next-line security/detect-non-literal-regexp -- Using escapeRegex for safe regex construction
      new RegExp(
        `<[^>]*>([^<]*${escapeRegex(actor.name)}[^<]*)<[^>]*>\\s*\\(([^)]+)\\)\\s*:?\\s*([^<]{10,500})`,
        "i"
      ),
      // Link with name
      // eslint-disable-next-line security/detect-non-literal-regexp -- Using escapeRegex for safe regex construction
      new RegExp(`<a[^>]*href="([^"]*)"[^>]*>([^<]*${escapeRegex(actor.name)}[^<]*)</a>`, "i"),
      // Just the name in text with dates
      // eslint-disable-next-line security/detect-non-literal-regexp -- Using escapeRegex for safe regex construction
      new RegExp(
        `(${escapeRegex(actor.name)})\\s*\\(([^)]{10,50})\\)\\s*:?\\s*([^<]{10,500})`,
        "i"
      ),
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        return this.parseMemoriamMatch(match, html)
      }
    }

    // Try searching by last name only for partial matches
    // eslint-disable-next-line security/detect-non-literal-regexp -- Using escapeRegex for safe regex construction
    const lastNamePattern = new RegExp(
      `<[^>]*>([^<]*\\b${escapeRegex(lastName)}\\b[^<]*)<[^>]*>\\s*\\(([^)]+)\\)`,
      "gi"
    )

    let lastNameMatch
    while ((lastNameMatch = lastNamePattern.exec(html)) !== null) {
      const foundName = this.cleanHtml(lastNameMatch[1]).trim()
      if (this.namesMatch(foundName, actor.name)) {
        return this.parseMemoriamMatch(lastNameMatch, html)
      }
    }

    return null
  }

  /**
   * Parse a regex match into a MemoriamEntry.
   */
  private parseMemoriamMatch(match: RegExpMatchArray, html: string): MemoriamEntry {
    const name = this.cleanHtml(match[1] || match[2] || "").trim()
    const dateStr = match[2] || ""
    const description = this.cleanHtml(match[3] || "").trim()

    // Extract obituary URL if present
    let obituaryUrl: string | null = null
    const nameIndex = match.index || 0
    const contextStart = Math.max(0, nameIndex - 500)
    const contextEnd = Math.min(html.length, nameIndex + 1000)
    const context = html.substring(contextStart, contextEnd)

    // Look for obituary link near this entry
    const linkPattern = /href="(\/features\/[^"]+)"/g
    let linkMatch
    while ((linkMatch = linkPattern.exec(context)) !== null) {
      const url = linkMatch[1]
      if (url.toLowerCase().includes(name.split(" ")[0].toLowerCase())) {
        obituaryUrl = `${BFI_BASE_URL}${url}`
        break
      }
    }

    // Parse dates from string like "30 Jan 1930 – 26 Feb 2025"
    const dates = this.parseDateRange(dateStr)

    return {
      name,
      birthDate: dates.birth,
      deathDate: dates.death,
      description: description || null,
      obituaryUrl,
      locationOfDeath: null,
    }
  }

  /**
   * Parse date range string into birth/death dates.
   */
  private parseDateRange(dateStr: string): { birth: string | null; death: string | null } {
    // Format: "30 Jan 1930 – 26 Feb 2025" or "1930-2025"
    const parts = dateStr.split(/[–-]/).map((s) => s.trim())

    return {
      birth: parts[0] || null,
      death: parts[1] || null,
    }
  }

  /**
   * Fetch and parse an individual obituary page.
   */
  private async fetchIndividualObituary(url: string): Promise<ParsedBFIData | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return null
      }

      const html = await response.text()

      // Try to extract JSON-LD structured data first
      const jsonLd = this.extractJsonLd(html)

      // Extract article body
      const articleBody = this.extractArticleBody(html)

      // Look for death circumstances in the text
      const circumstances = this.extractCircumstances(articleBody || "")
      const locationOfDeath = this.extractLocation(articleBody || "")

      return {
        circumstances,
        locationOfDeath,
        fullText: articleBody?.substring(0, 2000) || null,
        jsonLd,
      }
    } catch {
      return null
    }
  }

  /**
   * Extract JSON-LD structured data from page.
   */
  private extractJsonLd(html: string): Record<string, unknown> | null {
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)
    if (!match) return null

    try {
      return JSON.parse(match[1])
    } catch {
      return null
    }
  }

  /**
   * Extract article body from HTML.
   */
  private extractArticleBody(html: string): string | null {
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        const text = this.cleanHtml(match[1])
        if (text.length > 100) {
          return text
        }
      }
    }

    return null
  }

  /**
   * Extract death circumstances from text.
   */
  private extractCircumstances(text: string): string | null {
    if (!text) return null

    const sentences = text.split(/[.!?]+/).map((s) => s.trim())
    const deathSentences = sentences.filter((s) => {
      const lower = s.toLowerCase()
      return DEATH_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
    })

    if (deathSentences.length === 0) return null

    // Look for specific circumstance mentions
    const causeKeywords = [
      "found dead",
      "died of",
      "died from",
      "cause of death",
      "passed away",
      "succumbed",
    ]

    for (const keyword of causeKeywords) {
      for (const sentence of deathSentences) {
        if (sentence.toLowerCase().includes(keyword)) {
          return sentence.replace(/\s+/g, " ").trim()
        }
      }
    }

    // Return first death-related sentence
    return deathSentences[0]?.replace(/\s+/g, " ").trim() || null
  }

  /**
   * Extract location from text.
   */
  private extractLocation(text: string): string | null {
    if (!text) return null

    // Common patterns for death location
    const patterns = [
      /(?:died|found dead|passed away)[^.]{0,50}(?:in|at)\s+([A-Z][a-zA-Z\s,]{2,40})/i,
      /(?:at (?:his|her) home in)\s+([A-Z][a-zA-Z\s,]{2,40})/i,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        const location = match[1].trim()
        if (location.length < 50) {
          return location
        }
      }
    }

    return null
  }

  /**
   * Extract notable factors from text.
   */
  private extractNotableFactors(text: string): string[] {
    if (!text) return []

    const factors: string[] = []
    const lower = text.toLowerCase()

    for (const keyword of NOTABLE_FACTOR_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        factors.push(keyword)
      }
    }

    for (const keyword of CIRCUMSTANCE_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase()) && !factors.includes(keyword)) {
        factors.push(keyword)
      }
    }

    return [...new Set(factors)].slice(0, 5)
  }

  /**
   * Check if two names likely refer to the same person.
   */
  private namesMatch(name1: string, name2: string): boolean {
    const normalize = (n: string) =>
      n
        .toLowerCase()
        .replace(/[^a-z\s]/g, "")
        .trim()

    const n1 = normalize(name1)
    const n2 = normalize(name2)

    // Exact match
    if (n1 === n2) return true

    // Check if one contains the other
    if (n1.includes(n2) || n2.includes(n1)) return true

    // Check last name + first initial match
    const parts1 = n1.split(/\s+/)
    const parts2 = n2.split(/\s+/)

    if (parts1.length > 0 && parts2.length > 0) {
      const last1 = parts1[parts1.length - 1]
      const last2 = parts2[parts2.length - 1]
      const first1 = parts1[0][0]
      const first2 = parts2[0][0]

      if (last1 === last2 && first1 === first2) return true
    }

    return false
  }

  /**
   * Clean HTML tags and entities.
   */
  private cleanHtml(html: string): string {
    return htmlToText(html)
  }
}

interface MemoriamEntry {
  name: string
  birthDate: string | null
  deathDate: string | null
  description: string | null
  obituaryUrl: string | null
  locationOfDeath: string | null
}

interface ParsedBFIData {
  circumstances: string | null
  locationOfDeath: string | null
  fullText: string | null
  jsonLd: Record<string, unknown> | null
}
