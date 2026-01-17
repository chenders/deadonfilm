/**
 * Chronicling America source for historical US newspaper death information.
 *
 * Chronicling America is a Library of Congress database of digitized
 * historic American newspapers from 1756-1963. Excellent for actors
 * who died before modern web coverage.
 *
 * API: https://www.loc.gov/apis/additional-apis/chronicling-america-api/
 * - Free, no API key required
 * - Rate limiting encouraged (1 req/sec recommended)
 * - Returns JSON with newspaper page OCR text
 *
 * Strategy:
 * 1. Search for actor name + "death" or "died" + death year
 * 2. Filter results to newspapers from around the death date
 * 3. Extract death information from OCR text
 */

import { BaseDataSource, DEATH_KEYWORDS, LOW_PRIORITY_TIMEOUT_MS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

const LOC_BASE_URL = "https://www.loc.gov"
const CHRONICLING_AMERICA_URL = `${LOC_BASE_URL}/collections/chronicling-america/`

// Coverage dates for Chronicling America
const MIN_YEAR = 1756
const MAX_YEAR = 1963

interface ChronAmResult {
  id: string
  title: string
  date: string
  url: string
  image_url?: string[]
  description?: string[]
  subject?: string[]
  contributor?: string[]
  location?: string[]
}

interface ChronAmResponse {
  results: ChronAmResult[]
  pagination: {
    total: number
    current: number
    perpage: number
    next?: string
    previous?: string
  }
}

/**
 * Chronicling America source for historical newspaper obituaries.
 */
export class ChroniclingAmericaSource extends BaseDataSource {
  readonly name = "Chronicling America"
  readonly type = DataSourceType.CHRONICLING_AMERICA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Library of Congress recommends 1 request per second
  protected minDelayMs = 1000

  // Low priority archive source - use shorter timeout
  protected requestTimeoutMs = LOW_PRIORITY_TIMEOUT_MS

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

    const deathYear = new Date(actor.deathday).getFullYear()

    // Check if death is within coverage period
    if (deathYear < MIN_YEAR || deathYear > MAX_YEAR) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: `Death year ${deathYear} outside Chronicling America coverage (${MIN_YEAR}-${MAX_YEAR})`,
      }
    }

    try {
      // Build search query - search for obituary/death notice
      const searchTerms = `${actor.name} died OR death OR obituary`
      const startDate = this.formatDate(deathYear, 1, 1)
      const endDate = this.formatDate(deathYear + 1, 12, 31)

      const searchUrl = this.buildSearchUrl(searchTerms, startDate, endDate)

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: `Search failed: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as ChronAmResponse

      if (!data.results || data.results.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No newspaper articles found for this actor in Chronicling America",
        }
      }

      // Find the most relevant article
      const relevantResult = this.findRelevantResult(data.results, actor)

      if (!relevantResult) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No relevant death notice found in search results",
        }
      }

      // Extract death information from the result
      const deathInfo = this.extractDeathInfo(relevantResult, actor)

      if (!deathInfo) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, relevantResult.url),
          data: null,
          error: "Could not extract death information from newspaper article",
        }
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, deathInfo.confidence, relevantResult.url),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: null,
          notableFactors: deathInfo.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathInfo.locationOfDeath,
          additionalContext: `Source: Chronicling America (Library of Congress historic newspapers, ${relevantResult.date})`,
        },
      }
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Build search URL for Chronicling America via loc.gov API.
   */
  private buildSearchUrl(query: string, startDate: string, endDate: string): string {
    const params = new URLSearchParams({
      q: query,
      dl: "page", // Search newspaper pages
      ops: "PHRASE",
      start_date: startDate,
      end_date: endDate,
      fo: "json",
      c: "25", // Results per page
    })

    return `${CHRONICLING_AMERICA_URL}?${params.toString()}`
  }

  /**
   * Format date as YYYY-MM-DD for API.
   */
  private formatDate(year: number, month: number, day: number): string {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  /**
   * Find the most relevant search result for the actor.
   */
  private findRelevantResult(
    results: ChronAmResult[],
    actor: ActorForEnrichment
  ): ChronAmResult | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    for (const result of results) {
      // Check title and description for actor name
      const titleLower = result.title?.toLowerCase() || ""
      const descLower = (result.description || []).join(" ").toLowerCase()
      const combined = `${titleLower} ${descLower}`

      // Must contain at least the last name
      if (!combined.includes(lastName)) {
        continue
      }

      // Check for death-related keywords
      const hasDeathKeyword = DEATH_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()))

      if (hasDeathKeyword) {
        return result
      }

      // If full name matches, accept even without explicit death keyword
      if (combined.includes(actorNameLower)) {
        return result
      }
    }

    // If no good match, return the first result that mentions the name
    for (const result of results) {
      const combined = `${result.title || ""} ${(result.description || []).join(" ")}`.toLowerCase()
      if (combined.includes(lastName)) {
        return result
      }
    }

    return null
  }

  /**
   * Extract death information from a newspaper result.
   */
  private extractDeathInfo(
    result: ChronAmResult,
    actor: ActorForEnrichment
  ): {
    circumstances: string
    notableFactors: string[]
    locationOfDeath: string | null
    confidence: number
  } | null {
    // Combine all available text
    const text = [result.title, ...(result.description || [])].filter(Boolean).join(" ")

    if (!text) {
      return null
    }

    // Extract notable factors
    const notableFactors = this.extractNotableFactors(text)

    // Try to extract location
    const locationOfDeath = this.extractLocation(result, text)

    // Build circumstances text
    const circumstances = this.buildCircumstances(result, actor)

    // Calculate confidence based on available information
    let confidence = 0.3 // Base for finding a newspaper mention
    if (text.toLowerCase().includes(actor.name.toLowerCase())) {
      confidence += 0.2
    }
    if (notableFactors.length > 0) {
      confidence += 0.1
    }
    if (locationOfDeath) {
      confidence += 0.1
    }
    if (result.date) {
      confidence += 0.1
    }

    return {
      circumstances,
      notableFactors,
      locationOfDeath,
      confidence: Math.min(confidence, 0.7), // Cap at 0.7 for newspaper sources
    }
  }

  /**
   * Extract notable factors from newspaper text.
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []
    const lowerText = text.toLowerCase()

    if (lowerText.includes("accident") || lowerText.includes("accidental")) {
      factors.push("accidental death")
    }
    if (lowerText.includes("suicide") || lowerText.includes("took own life")) {
      factors.push("self-inflicted")
    }
    if (
      lowerText.includes("murder") ||
      lowerText.includes("killed") ||
      lowerText.includes("slain")
    ) {
      factors.push("homicide")
    }
    if (lowerText.includes("heart") || lowerText.includes("cardiac")) {
      factors.push("heart condition")
    }
    if (lowerText.includes("cancer") || lowerText.includes("tumor")) {
      factors.push("illness - cancer")
    }
    if (lowerText.includes("pneumonia") || lowerText.includes("influenza")) {
      factors.push("illness - respiratory")
    }
    if (lowerText.includes("stroke") || lowerText.includes("apoplexy")) {
      factors.push("stroke")
    }
    if (lowerText.includes("sudden") || lowerText.includes("unexpected")) {
      factors.push("sudden death")
    }

    return factors
  }

  /**
   * Try to extract location from result.
   */
  private extractLocation(result: ChronAmResult, text: string): string | null {
    // Check location field first
    if (result.location && result.location.length > 0) {
      return result.location[0]
    }

    // Try to extract from text
    const patterns = [
      /died\s+(?:at|in)\s+([A-Z][a-zA-Z\s,]+(?:Hospital|home|residence|city))/i,
      /(?:at|in)\s+([A-Z][a-zA-Z\s]+(?:Hospital|Sanitarium|Home))/i,
      /(?:in\s+)?(New York|Los Angeles|Chicago|Hollywood|London|Paris)/i,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        const location = match[1].trim()
        if (location.length > 2 && location.length < 100) {
          return location
        }
      }
    }

    return null
  }

  /**
   * Build circumstances text from result.
   */
  private buildCircumstances(result: ChronAmResult, actor: ActorForEnrichment): string {
    const parts: string[] = []

    // Add newspaper title/source
    if (result.contributor && result.contributor.length > 0) {
      parts.push(`Reported in ${result.contributor[0]}`)
    }

    // Add date
    if (result.date) {
      parts.push(`on ${result.date}`)
    }

    // Add description if available
    if (result.description && result.description.length > 0) {
      const desc = result.description.join(" ").substring(0, 500)
      parts.push(desc)
    }

    if (parts.length === 0) {
      return `Historical newspaper mention of ${actor.name}'s death found in Chronicling America archive.`
    }

    return parts.join(". ")
  }
}
