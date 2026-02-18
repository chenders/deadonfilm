/**
 * Chronicling America biography source.
 *
 * Library of Congress historical US newspaper archive covering 1756-1963.
 * Excellent for actors with coverage in that period - can find biographical
 * profiles, interviews, and feature articles from historical newspapers.
 *
 * API: https://www.loc.gov/apis/additional-apis/chronicling-america-api/
 * - Free, no API key required
 * - Rate limiting: 1 req/sec recommended
 *
 * IMPORTANT: This source ONLY works for content within 1756-1963.
 * Actors whose entire careers fall outside this range will be skipped.
 *
 * Reliability tier: ARCHIVAL (0.9) - Library of Congress primary source.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"

const LOC_BASE_URL = "https://www.loc.gov"
const CHRONICLING_AMERICA_URL = `${LOC_BASE_URL}/collections/chronicling-america/`

// Coverage dates for Chronicling America
const MIN_YEAR = 1756
const MAX_YEAR = 1963

const MIN_CONTENT_LENGTH = 100

interface ChronAmResult {
  id: string
  title: string
  date: string
  url: string
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
  }
}

/**
 * Chronicling America biography source for historical newspaper biographical content.
 */
export class ChroniclingAmericaBiographySource extends BaseBiographySource {
  readonly name = "Chronicling America"
  readonly type = BiographySourceType.CHRONICLING_AMERICA_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.ARCHIVAL

  protected minDelayMs = 1000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Determine if actor has any relevance to the 1756-1963 window
    const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

    // Skip if we can determine the actor is entirely outside the coverage range
    if (birthYear && birthYear > MAX_YEAR) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: `Birth year ${birthYear} outside Chronicling America coverage (${MIN_YEAR}-${MAX_YEAR})`,
      }
    }

    // Build the search date window
    const searchStartYear = Math.max(MIN_YEAR, birthYear ?? MIN_YEAR)
    const searchEndYear = Math.min(MAX_YEAR, deathYear ?? MAX_YEAR)

    if (searchStartYear > MAX_YEAR || searchEndYear < MIN_YEAR) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: `Actor dates outside Chronicling America coverage (${MIN_YEAR}-${MAX_YEAR})`,
      }
    }

    try {
      // Build biography-focused search query
      const searchTerms = `"${actor.name}" biography OR profile OR interview`
      const startDate = `${searchStartYear}-01-01`
      const endDate = `${searchEndYear}-12-31`

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
          source: this.createSourceEntry(startTime, 0, { url: searchUrl }),
          data: null,
          error: `Search failed: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as ChronAmResponse

      if (!data.results || data.results.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: searchTerms }),
          data: null,
          error: "No newspaper articles found in Chronicling America",
        }
      }

      // Find the most relevant result
      const relevantResult = this.findRelevantResult(data.results, actor)

      if (!relevantResult) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: searchTerms }),
          data: null,
          error: "No relevant biographical content found in search results",
        }
      }

      // Build text from result
      const combinedText = this.buildTextFromResult(relevantResult)

      if (combinedText.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: relevantResult.url,
            queryUsed: searchTerms,
          }),
          data: null,
          error: `Chronicling America content too short (${combinedText.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Run through mechanical pre-clean
      const { text } = mechanicalPreClean(combinedText)

      // Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(text || combinedText)

      const articleTitle = relevantResult.title || `${actor.name} - Chronicling America`

      const sourceData: RawBiographySourceData = {
        sourceName: "Chronicling America",
        sourceType: BiographySourceType.CHRONICLING_AMERICA_BIO,
        text: text || combinedText,
        url: relevantResult.url,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication: relevantResult.contributor?.[0] || "Chronicling America",
        articleTitle,
        domain: "loc.gov",
        contentType: "biography",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: relevantResult.url,
          queryUsed: searchTerms,
          publication: relevantResult.contributor?.[0] || "Chronicling America",
          articleTitle,
          domain: "loc.gov",
          contentType: "biography",
        }),
        data: sourceData,
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
      dl: "page",
      ops: "PHRASE",
      start_date: startDate,
      end_date: endDate,
      fo: "json",
      c: "25",
    })

    return `${CHRONICLING_AMERICA_URL}?${params.toString()}`
  }

  /**
   * Find the most relevant search result for the actor.
   */
  private findRelevantResult(
    results: ChronAmResult[],
    actor: ActorForBiography
  ): ChronAmResult | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    const bioKeywords = ["biography", "profile", "interview", "personal", "childhood", "early life"]

    for (const result of results) {
      const titleLower = result.title?.toLowerCase() || ""
      const descLower = (result.description || []).join(" ").toLowerCase()
      const combined = `${titleLower} ${descLower}`

      // Check for actor name (at least last name)
      if (!combined.includes(lastName)) {
        continue
      }

      // Prefer results with biographical keywords
      if (bioKeywords.some((kw) => combined.includes(kw))) {
        return result
      }

      // Accept full name match even without bio keywords
      if (combined.includes(actorNameLower)) {
        return result
      }
    }

    // Fallback: first result mentioning the name
    for (const result of results) {
      const combined = `${result.title || ""} ${(result.description || []).join(" ")}`.toLowerCase()
      if (combined.includes(lastName)) {
        return result
      }
    }

    return null
  }

  /**
   * Build text from a search result's fields.
   */
  private buildTextFromResult(result: ChronAmResult): string {
    const parts: string[] = []

    if (result.title) {
      parts.push(result.title)
    }

    if (result.contributor && result.contributor.length > 0) {
      parts.push(`Source: ${result.contributor[0]}`)
    }

    if (result.date) {
      parts.push(`Date: ${result.date}`)
    }

    if (result.description && result.description.length > 0) {
      parts.push(result.description.join(" "))
    }

    return parts.join(". ")
  }
}
