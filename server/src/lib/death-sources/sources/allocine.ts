/**
 * AlloCiné source for French actor death information.
 *
 * AlloCiné is the leading French movie database, similar to IMDb for France.
 * It provides comprehensive information about French and international actors,
 * including death information for deceased actors.
 *
 * Search strategy:
 * 1. Search for actor by name on AlloCiné
 * 2. Find matching actor page
 * 3. Extract death information from biography section
 */

import { BaseDataSource, DEATH_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const ALLOCINE_BASE_URL = "https://www.allocine.fr"
const ALLOCINE_SEARCH_URL = `${ALLOCINE_BASE_URL}/rechercher/?q=`

// French death-related keywords
const FRENCH_DEATH_KEYWORDS = [
  "décédé",
  "décédée",
  "mort",
  "morte",
  "décès",
  "disparition",
  "disparu",
  "disparue",
  "s'est éteint",
  "s'est éteinte",
  "nous a quittés",
  "cause de la mort",
  "cause du décès",
  "succombé",
  "emporté par",
  "emportée par",
  "victime de",
  "atteint de",
  "atteinte de",
  "maladie",
  "cancer",
  "accident",
  "suicide",
  "assassiné",
  "assassinée",
  "tué",
  "tuée",
]

/**
 * AlloCiné source for French actor information.
 */
export class AlloCineSource extends BaseDataSource {
  readonly name = "AlloCiné"
  readonly type = DataSourceType.ALLOCINE
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Be polite to AlloCiné servers
  protected minDelayMs = 2000

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

    try {
      // Step 1: Search for the actor
      const searchUrl = `${ALLOCINE_SEARCH_URL}${encodeURIComponent(actor.name)}`
      const searchResponse = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (searchResponse.status === 403) {
        throw new SourceAccessBlockedError(
          `AlloCiné blocked access (403)`,
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
          error: `Search failed: HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()

      // Step 2: Find actor page link from search results
      const actorPageUrl = this.findActorPageUrl(searchHtml, actor.name)

      if (!actorPageUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "Actor not found in AlloCiné search results",
        }
      }

      // Step 3: Fetch actor page
      const fullActorUrl = actorPageUrl.startsWith("http")
        ? actorPageUrl
        : `${ALLOCINE_BASE_URL}${actorPageUrl}`

      await this.waitForRateLimit()

      const actorResponse = await fetch(fullActorUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (actorResponse.status === 403) {
        throw new SourceAccessBlockedError(
          `AlloCiné blocked access (403)`,
          this.type,
          fullActorUrl,
          403
        )
      }

      if (!actorResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, fullActorUrl),
          data: null,
          error: `Actor page fetch failed: HTTP ${actorResponse.status}`,
        }
      }

      const actorHtml = await actorResponse.text()

      // Step 4: Extract death information
      const deathInfo = this.extractDeathInfo(actorHtml, actor)

      if (!deathInfo) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, fullActorUrl),
          data: null,
          error: "No death information found on AlloCiné page",
        }
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, deathInfo.confidence, fullActorUrl),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: null,
          notableFactors: deathInfo.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathInfo.locationOfDeath,
          additionalContext: deathInfo.additionalContext,
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
   * Find actor page URL from search results.
   */
  private findActorPageUrl(html: string, actorName: string): string | null {
    // AlloCiné search results have links like /personne/fichepersonne_gen_cpersonne=XXXXX.html
    const personPattern = /href="(\/personne\/fichepersonne[^"]+)"/gi
    const matches: string[] = []

    let match
    while ((match = personPattern.exec(html)) !== null) {
      matches.push(match[1])
    }

    if (matches.length === 0) {
      return null
    }

    // Try to find the best match by looking for the actor name near the link
    const normalizedActorName = this.normalizeForComparison(actorName)

    for (const url of matches) {
      // Extract the section of HTML around this URL to check for name match
      const urlIndex = html.indexOf(url)
      const context = html.substring(Math.max(0, urlIndex - 200), urlIndex + 200)
      const contextText = htmlToText(context)

      if (this.normalizeForComparison(contextText).includes(normalizedActorName)) {
        return url
      }
    }

    // If no exact match, return the first result
    return matches[0]
  }

  /**
   * Extract death information from actor page HTML.
   */
  private extractDeathInfo(
    html: string,
    actor: ActorForEnrichment
  ): {
    circumstances: string | null
    notableFactors: string[]
    locationOfDeath: string | null
    additionalContext: string | null
    confidence: number
  } | null {
    const text = htmlToText(html)
    const lowerText = text.toLowerCase()

    // Check if this page mentions death
    const hasDeathMention = [...FRENCH_DEATH_KEYWORDS, ...DEATH_KEYWORDS].some((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    )

    if (!hasDeathMention) {
      return null
    }

    // Try to extract biography section
    const bioMatch = html.match(/<div[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const bioText = bioMatch ? htmlToText(bioMatch[1]) : text

    // Look for death-related sentences
    const sentences = bioText.split(/[.!?]+/)
    const deathSentences: string[] = []

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase()
      if (
        [...FRENCH_DEATH_KEYWORDS, ...DEATH_KEYWORDS].some((keyword) =>
          lowerSentence.includes(keyword.toLowerCase())
        )
      ) {
        const trimmed = sentence.trim()
        if (trimmed.length > 10 && trimmed.length < 500) {
          deathSentences.push(trimmed)
        }
      }
    }

    if (deathSentences.length === 0) {
      return null
    }

    // Extract notable factors
    const notableFactors = this.extractNotableFactors(deathSentences.join(" "))

    // Try to find location
    const locationOfDeath = this.extractLocation(deathSentences.join(" "))

    // Build circumstances from death sentences
    const circumstances = deathSentences.slice(0, 3).join(". ")

    // Calculate confidence
    let confidence = 0.4 // Base for finding relevant content
    if (deathSentences.length > 1) confidence += 0.1
    if (notableFactors.length > 0) confidence += 0.1
    if (locationOfDeath) confidence += 0.1
    if (this.verifyActorMatch(text, actor)) confidence += 0.1

    return {
      circumstances: circumstances || null,
      notableFactors,
      locationOfDeath,
      additionalContext: `Source: AlloCiné (French film database)`,
      confidence: Math.min(confidence, 0.8),
    }
  }

  /**
   * Extract notable factors from French text.
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []
    const lowerText = text.toLowerCase()

    if (lowerText.includes("accident") || lowerText.includes("accidentel")) {
      factors.push("accidental death")
    }
    if (lowerText.includes("suicide") || lowerText.includes("s'est donné la mort")) {
      factors.push("self-inflicted")
    }
    if (
      lowerText.includes("assassin") ||
      lowerText.includes("meurtre") ||
      lowerText.includes("tué")
    ) {
      factors.push("homicide")
    }
    if (lowerText.includes("cancer")) {
      factors.push("illness - cancer")
    }
    if (lowerText.includes("cardiaque") || lowerText.includes("crise cardiaque")) {
      factors.push("heart condition")
    }
    if (lowerText.includes("overdose") || lowerText.includes("surdose")) {
      factors.push("overdose")
    }
    if (lowerText.includes("covid") || lowerText.includes("coronavirus")) {
      factors.push("COVID-19")
    }

    return factors
  }

  /**
   * Try to extract location from French text.
   */
  private extractLocation(text: string): string | null {
    // Look for common French location patterns
    const patterns = [
      /(?:décédé|mort|décès)\s+(?:à|au|en)\s+([A-Z][a-zA-Zéèêëàâäôùûü\s-]+)/,
      /(?:à|au)\s+l'hôpital\s+(?:de\s+)?([A-Z][a-zA-Zéèêëàâäôùûü\s-]+)/,
      /(?:à|en)\s+([A-Z][a-zA-Zéèêëàâäôùûü\s-]+)(?:\s*,\s*[A-Z][a-zA-Z]+)?/,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        const location = match[1].trim()
        // Filter out common false positives
        if (location.length > 2 && location.length < 50 && !location.match(/^\d/)) {
          return location
        }
      }
    }

    return null
  }

  /**
   * Verify the page is about the correct actor.
   */
  private verifyActorMatch(text: string, actor: ActorForEnrichment): boolean {
    const normalizedText = this.normalizeForComparison(text)
    const normalizedName = this.normalizeForComparison(actor.name)

    // Check name
    if (!normalizedText.includes(normalizedName)) {
      return false
    }

    // Check birth year if available
    if (actor.birthday) {
      const birthYear = new Date(actor.birthday).getFullYear().toString()
      if (!text.includes(birthYear)) {
        return false
      }
    }

    return true
  }

  /**
   * Normalize text for comparison.
   */
  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^a-z0-9]/g, "")
  }
}
