/**
 * The Guardian API source for obituaries and death news.
 *
 * Uses The Guardian Open Platform API to search for obituaries and death
 * articles about actors/entertainers.
 *
 * Setup:
 * 1. Register at https://open-platform.theguardian.com/access/
 * 2. Get API key (free for non-commercial use)
 *
 * Pricing (as of Jan 2025):
 * - Free tier: 12 calls/second, 5000 calls/day
 * - No payment required for non-commercial use
 *
 * @see https://open-platform.theguardian.com/documentation/
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

const GUARDIAN_API_URL = "https://content.guardianapis.com/search"

/**
 * Guardian API response structure.
 */
interface GuardianSearchResponse {
  response: {
    status: string
    total: number
    results: Array<{
      id: string
      type: string
      sectionId: string
      sectionName: string
      webPublicationDate: string
      webTitle: string
      webUrl: string
      apiUrl: string
      fields?: {
        bodyText?: string
        standfirst?: string
        trailText?: string
      }
    }>
  }
}

/**
 * The Guardian source for obituaries and death news.
 * Searches the Guardian's extensive obituary section.
 */
export class GuardianSource extends BaseDataSource {
  readonly name = "The Guardian"
  readonly type = DataSourceType.GUARDIAN
  readonly isFree = true // Free for non-commercial use
  readonly estimatedCostPerQuery = 0

  // Guardian allows 12 requests/second
  protected minDelayMs = 200

  /**
   * Check if Guardian API is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.GUARDIAN_API_KEY
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const apiKey = process.env.GUARDIAN_API_KEY

    if (!apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Guardian API key not configured",
      }
    }

    try {
      console.log(`Guardian search for: ${actor.name}`)

      // Build search query
      const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
      const query = `"${actor.name}" AND (died OR death OR obituary OR "passed away")`

      const url = new URL(GUARDIAN_API_URL)
      url.searchParams.set("api-key", apiKey)
      url.searchParams.set("q", query)
      url.searchParams.set("show-fields", "bodyText,standfirst,trailText")
      url.searchParams.set("page-size", "10")
      url.searchParams.set("order-by", "relevance")

      // Filter by section (obituaries, film, culture)
      url.searchParams.set("section", "tone/obituaries|film|culture|tv-and-radio")

      // Filter by date if we have death year
      if (deathYear) {
        url.searchParams.set("from-date", `${deathYear - 1}-01-01`)
        url.searchParams.set("to-date", `${deathYear + 1}-12-31`)
      }

      const response = await fetch(url.toString(), {
        headers: {
          "User-Agent": this.userAgent,
        },
      })

      if (!response.ok) {
        if (response.status === 429) {
          return {
            success: false,
            source: this.createSourceEntry(startTime, 0),
            data: null,
            error: "Guardian API rate limit exceeded",
          }
        }
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as GuardianSearchResponse

      if (data.response.status !== "ok" || data.response.total === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No obituary articles found",
        }
      }

      console.log(`  Found ${data.response.results.length} articles`)

      // Find the most relevant obituary
      const obituary = this.findBestObituary(data.response.results, actor)

      if (!obituary) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No relevant obituary found",
        }
      }

      // Extract death info from the article
      const bodyText =
        obituary.fields?.bodyText || obituary.fields?.standfirst || obituary.fields?.trailText || ""
      const circumstances = this.extractCircumstances(bodyText, actor.name)
      const locationOfDeath = this.extractLocation(bodyText)
      const notableFactors = this.extractNotableFactors(bodyText)

      // Calculate confidence
      let confidence = 0.5 // Guardian is reliable
      if (obituary.sectionId === "tone/obituaries") confidence += 0.2 // Obituary section
      if (circumstances) confidence += 0.1
      if (bodyText.length > 500) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, obituary.webUrl),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors,
          relatedCelebrities: [],
          locationOfDeath,
          additionalContext: obituary.fields?.standfirst || null,
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
   * Find the most relevant obituary from search results.
   */
  private findBestObituary(
    results: GuardianSearchResponse["response"]["results"],
    actor: ActorForEnrichment
  ) {
    // Prioritize actual obituaries
    const obituaries = results.filter((r) => r.sectionId === "tone/obituaries")
    if (obituaries.length > 0) {
      // Find one that mentions the actor name prominently
      for (const obit of obituaries) {
        if (obit.webTitle.toLowerCase().includes(actor.name.toLowerCase())) {
          return obit
        }
      }
      return obituaries[0]
    }

    // Fall back to any article that prominently mentions death
    for (const result of results) {
      const title = result.webTitle.toLowerCase()
      const hasName = title.includes(actor.name.split(" ")[0].toLowerCase())
      const hasDeath = DEATH_KEYWORDS.some((kw) => title.includes(kw.toLowerCase()))

      if (hasName && hasDeath) {
        return result
      }
    }

    // Return first result if it seems relevant
    if (results[0]?.webTitle.toLowerCase().includes(actor.name.split(" ")[0].toLowerCase())) {
      return results[0]
    }

    return null
  }

  /**
   * Extract death circumstances from article text.
   */
  private extractCircumstances(text: string, actorName: string): string | null {
    if (!text || text.length < 50) return null

    const sentences = text.split(/[.!?]+/).map((s) => s.trim())
    const deathSentences: string[] = []

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase()
      const hasDeath = DEATH_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
      const hasName =
        lower.includes(actorName.toLowerCase()) ||
        lower.includes(actorName.split(" ")[0].toLowerCase())

      if (hasDeath && (hasName || deathSentences.length === 0)) {
        deathSentences.push(sentence)
      }

      // Stop after collecting a few sentences
      if (deathSentences.length >= 3) break
    }

    if (deathSentences.length === 0) return null

    return deathSentences.join(". ").trim()
  }

  /**
   * Extract location of death from text.
   */
  private extractLocation(text: string): string | null {
    if (!text) return null

    const patterns = [
      /died (?:at|in) ([A-Z][a-zA-Z\s,]{2,40})/i,
      /passed away (?:at|in) ([A-Z][a-zA-Z\s,]{2,40})/i,
      /(?:at (?:his|her|their) home in) ([A-Z][a-zA-Z\s,]{2,40})/i,
      /found dead (?:at|in) ([A-Z][a-zA-Z\s,]{2,40})/i,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1].length < 50) {
        return match[1].trim()
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

    for (const keyword of CIRCUMSTANCE_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        factors.push(keyword)
      }
    }

    return [...new Set(factors)].slice(0, 5)
  }
}
