/**
 * FamilySearch source for death records.
 *
 * FamilySearch is a free genealogical database operated by The Church of
 * Jesus Christ of Latter-day Saints. It provides access to historical
 * vital records including death records.
 *
 * Setup:
 * 1. Register at https://www.familysearch.org/developers/
 * 2. Create an app and get API key
 *
 * Pricing (as of Jan 2025):
 * - Free tier: 1000 calls/day
 * - No payment required
 *
 * Note: FamilySearch is best for historical records (pre-1990s).
 * For more recent deaths, news sources are typically more useful.
 *
 * @see https://www.familysearch.org/developers/docs/api/
 */

import { BaseDataSource, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"

const FAMILYSEARCH_API_URL = "https://api.familysearch.org"

/**
 * FamilySearch API person search response.
 */
interface FamilySearchResponse {
  entries?: Array<{
    id: string
    content?: {
      gedcomx?: {
        persons?: Array<{
          id: string
          display?: {
            name?: string
            birthDate?: string
            birthPlace?: string
            deathDate?: string
            deathPlace?: string
            lifespan?: string
          }
          facts?: Array<{
            type: string
            date?: { original?: string }
            place?: { original?: string }
            value?: string
          }>
        }>
      }
    }
  }>
  results?: Array<{
    score: number
    id: string
  }>
}

/**
 * FamilySearch source for death records.
 * Good for historical death records, especially for actors who died
 * before the internet era.
 */
export class FamilySearchSource extends BaseDataSource {
  readonly name = "FamilySearch"
  readonly type = DataSourceType.FAMILYSEARCH
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.MARGINAL_MIXED

  // Rate limit: be respectful
  protected minDelayMs = 2000

  /**
   * Check if FamilySearch API is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.FAMILYSEARCH_API_KEY
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const apiKey = process.env.FAMILYSEARCH_API_KEY

    if (!apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "FamilySearch API key not configured",
      }
    }

    try {
      console.log(`FamilySearch search for: ${actor.name}`)

      // Parse dates for search
      const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
      const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

      // Build search parameters
      const searchParams = new URLSearchParams()
      searchParams.set("q.name", actor.name)

      // Add date constraints if available
      if (birthYear) {
        searchParams.set("q.birthLikeDate", `${birthYear}`)
      }
      if (deathYear) {
        searchParams.set("q.deathLikeDate", `${deathYear}`)
      }

      // Only search for deceased persons
      searchParams.set("q.deathLikePlace", "*")

      const searchUrl = `${FAMILYSEARCH_API_URL}/platform/tree/search?${searchParams.toString()}`

      const response = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            source: this.createSourceEntry(startTime, 0),
            data: null,
            error: "Invalid FamilySearch API key",
          }
        }
        if (response.status === 429) {
          return {
            success: false,
            source: this.createSourceEntry(startTime, 0),
            data: null,
            error: "FamilySearch API rate limit exceeded",
          }
        }
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as FamilySearchResponse

      if (!data.entries || data.entries.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No matching person found",
        }
      }

      console.log(`  Found ${data.entries.length} potential matches`)

      // Find the best matching person
      const bestMatch = this.findBestMatch(data.entries, actor)

      if (!bestMatch) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No matching deceased person found",
        }
      }

      // Extract death information
      const person = bestMatch.content?.gedcomx?.persons?.[0]
      if (!person) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No person data in match",
        }
      }

      const deathPlace = person.display?.deathPlace || this.getFactPlace(person.facts, "Death")
      const deathDate = person.display?.deathDate || this.getFactDate(person.facts, "Death")

      // Build circumstances from available data
      let circumstances: string | null = null
      if (deathDate || deathPlace) {
        const parts: string[] = []
        if (deathDate) parts.push(`Died ${deathDate}`)
        if (deathPlace) parts.push(`in ${deathPlace}`)
        circumstances = parts.join(" ")
      }

      // Look for burial information which sometimes includes cause of death
      const burialPlace = this.getFactPlace(person.facts, "Burial")
      const additionalContext = burialPlace ? `Buried at ${burialPlace}` : null

      // Extract any notable factors from facts
      const notableFactors = this.extractNotableFactors(person.facts)

      // Calculate confidence - FamilySearch is good for dates/places but rarely has cause
      let confidence = 0.3 // Base confidence is lower since it usually lacks cause
      if (deathDate && actor.deathday) {
        // Verify death year matches
        const fsDeathYear = parseInt(deathDate)
        const actualDeathYear = new Date(actor.deathday).getFullYear()
        if (fsDeathYear === actualDeathYear) {
          confidence += 0.3
        }
      }
      if (deathPlace) confidence += 0.1

      // Build person URL
      const personUrl = `https://www.familysearch.org/tree/person/details/${bestMatch.id}`

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, personUrl),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathPlace || null,
          additionalContext,
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
   * Find the best matching person from search results.
   */
  private findBestMatch(
    entries: NonNullable<FamilySearchResponse["entries"]>,
    actor: ActorForEnrichment
  ) {
    const nameLower = actor.name.toLowerCase()
    const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

    // Score each entry
    const scored = entries.map((entry) => {
      let score = 0
      const person = entry.content?.gedcomx?.persons?.[0]
      if (!person) return { entry, score: -1 }

      // Must have death info
      if (!person.display?.deathDate && !this.getFactDate(person.facts, "Death")) {
        return { entry, score: -1 }
      }

      // Name match
      const displayName = person.display?.name?.toLowerCase() || ""
      if (displayName === nameLower) {
        score += 100
      } else if (displayName.includes(nameLower.split(" ")[0])) {
        score += 50
      }

      // Birth year match
      if (birthYear && person.display?.birthDate) {
        const fsBirthYear = parseInt(person.display.birthDate)
        if (fsBirthYear === birthYear) {
          score += 30
        } else if (Math.abs(fsBirthYear - birthYear) <= 2) {
          score += 15
        }
      }

      // Death year match
      if (deathYear && person.display?.deathDate) {
        const fsDeathYear = parseInt(person.display.deathDate)
        if (fsDeathYear === deathYear) {
          score += 30
        } else if (Math.abs(fsDeathYear - deathYear) <= 2) {
          score += 15
        }
      }

      return { entry, score }
    })

    // Sort by score and return best match with positive score
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]

    return best && best.score > 0 ? best.entry : null
  }

  /**
   * Get fact date by type.
   */
  private getFactDate(
    facts: Array<{ type: string; date?: { original?: string } }> | undefined,
    factType: string
  ): string | null {
    if (!facts) return null

    const fact = facts.find(
      (f) => f.type.toLowerCase().includes(factType.toLowerCase()) && f.date?.original
    )
    return fact?.date?.original || null
  }

  /**
   * Get fact place by type.
   */
  private getFactPlace(
    facts: Array<{ type: string; place?: { original?: string } }> | undefined,
    factType: string
  ): string | null {
    if (!facts) return null

    const fact = facts.find(
      (f) => f.type.toLowerCase().includes(factType.toLowerCase()) && f.place?.original
    )
    return fact?.place?.original || null
  }

  /**
   * Extract notable factors from facts.
   */
  private extractNotableFactors(
    facts: Array<{ type: string; value?: string }> | undefined
  ): string[] {
    if (!facts) return []

    const factors: string[] = []

    for (const fact of facts) {
      const factText = `${fact.type} ${fact.value || ""}`.toLowerCase()

      for (const keyword of CIRCUMSTANCE_KEYWORDS) {
        if (factText.includes(keyword.toLowerCase())) {
          factors.push(keyword)
        }
      }
    }

    return [...new Set(factors)].slice(0, 5)
  }
}
