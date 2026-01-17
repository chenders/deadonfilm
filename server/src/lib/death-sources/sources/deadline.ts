/**
 * Deadline source for entertainment industry death information.
 *
 * Deadline Hollywood is a leading entertainment news site known for
 * breaking news and comprehensive coverage of the industry. They publish
 * detailed obituaries for actors and other entertainment professionals.
 * Their coverage often includes:
 * - Breaking news of deaths
 * - Cause of death (when publicly known)
 * - Career retrospectives
 * - Industry reactions
 *
 * Free to access via web scraping (no API key required).
 */

import {
  BaseDataSource,
  DEATH_KEYWORDS,
  CIRCUMSTANCE_KEYWORDS,
  NOTABLE_FACTOR_KEYWORDS,
} from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const _DEADLINE_BASE_URL = "https://deadline.com"

/**
 * Deadline source for actor death information.
 */
export class DeadlineSource extends BaseDataSource {
  readonly name = "Deadline"
  readonly type = DataSourceType.DEADLINE
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limiting
  protected minDelayMs = 2000

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    // Only process deceased actors
    if (!actor.deathday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Actor is not deceased",
      }
    }

    try {
      // Search for obituary using DuckDuckGo HTML (more scraping-friendly)
      const deathYear = new Date(actor.deathday).getFullYear()
      const searchQuery = `site:deadline.com "${actor.name}" obituary OR dies OR dead OR death ${deathYear}`
      const ddgSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`

      const searchResponse = await fetch(ddgSearchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (searchResponse.status === 403) {
        throw new SourceAccessBlockedError(`Search blocked (403)`, this.type, ddgSearchUrl, 403)
      }

      if (!searchResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, ddgSearchUrl),
          data: null,
          error: `Search failed: HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()

      // Find Deadline article URLs in search results
      const deadlineUrl = this.extractDeadlineUrl(searchHtml, actor)

      if (!deadlineUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, ddgSearchUrl),
          data: null,
          error: "No Deadline obituary found in search results",
        }
      }

      // Fetch the Deadline article
      await this.waitForRateLimit()
      const articleData = await this.fetchArticle(deadlineUrl, actor)

      if (!articleData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, deadlineUrl),
          data: null,
          error: "Could not fetch Deadline article",
        }
      }

      if (!articleData.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, deadlineUrl),
          data: null,
          error: "No death information found in Deadline article",
        }
      }

      // Calculate confidence
      let confidence = 0.5 // Base confidence for Deadline (authoritative source)
      if (articleData.circumstances.length > 100) confidence += 0.1
      if (articleData.locationOfDeath) confidence += 0.1
      if (articleData.notableFactors.length > 0) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, Math.min(confidence, 0.85), deadlineUrl),
        data: {
          circumstances: articleData.circumstances,
          rumoredCircumstances: null,
          notableFactors: articleData.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: articleData.locationOfDeath,
          additionalContext: "Source: Deadline Hollywood (entertainment news)",
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
   * Extract Deadline URL from search results.
   */
  private extractDeadlineUrl(html: string, actor: ActorForEnrichment): string | null {
    // Look for deadline.com URLs in search results
    const urlPattern = /https?:\/\/(?:www\.)?deadline\.com\/\d{4}\/\d{2}\/[^"'\s<>]+/gi
    const matches = html.match(urlPattern) || []

    if (matches.length === 0) {
      return null
    }

    // Prefer URLs that contain obituary-related terms (highest priority)
    const obituaryTerms = ["obituary", "obit", "dies", "dead", "death", "rip", "passes"]

    // First pass: look for obituary-related URLs
    for (const url of matches) {
      const lowerUrl = url.toLowerCase()
      const hasObituaryTerm = obituaryTerms.some((term) => lowerUrl.includes(term))
      if (hasObituaryTerm) {
        return url
      }
    }

    // Second pass: look for URLs with actor name parts
    const nameParts = actor.name.toLowerCase().split(" ")
    for (const url of matches) {
      const lowerUrl = url.toLowerCase()
      const hasNamePart = nameParts.some((part) => part.length > 2 && lowerUrl.includes(part))
      if (hasNamePart) {
        return url
      }
    }

    // Return first result if no better match
    return matches[0] ?? null
  }

  /**
   * Fetch and parse a Deadline article.
   */
  private async fetchArticle(url: string, actor: ActorForEnrichment): Promise<ArticleData | null> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: this.createTimeoutSignal(),
    })

    if (response.status === 403) {
      throw new SourceAccessBlockedError(`Deadline blocked access (403)`, this.type, url, 403)
    }

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    return this.parseArticle(html, actor)
  }

  /**
   * Parse article HTML for death information.
   */
  private parseArticle(html: string, actor: ActorForEnrichment): ArticleData {
    const data: ArticleData = {
      circumstances: null,
      locationOfDeath: null,
      notableFactors: [],
    }

    const text = htmlToText(html)
    const lowerText = text.toLowerCase()

    // Check if article mentions death
    const hasDeathMention = DEATH_KEYWORDS.some((keyword) =>
      lowerText.includes(keyword.toLowerCase())
    )

    if (!hasDeathMention) {
      return data
    }

    // Extract death-related sentences
    const sentences = text.split(/[.!?]+/)
    const deathSentences: string[] = []

    for (const sentence of sentences) {
      const trimmed = sentence.trim()
      const lowerSentence = trimmed.toLowerCase()

      // Check for death keywords
      const hasDeathKeyword = DEATH_KEYWORDS.some((kw) => lowerSentence.includes(kw.toLowerCase()))

      if (hasDeathKeyword && trimmed.length > 20 && trimmed.length < 500) {
        // Verify this is about the right person
        const nameParts = actor.name.split(" ")
        const lastName = nameParts[nameParts.length - 1].toLowerCase()
        const firstName = nameParts[0].toLowerCase()

        const isAboutActor =
          lowerSentence.includes(lastName) ||
          lowerSentence.includes(firstName) ||
          lowerSentence.includes(" he ") ||
          lowerSentence.includes(" she ") ||
          lowerSentence.includes(" his ") ||
          lowerSentence.includes(" her ") ||
          lowerSentence.startsWith("he ") ||
          lowerSentence.startsWith("she ") ||
          lowerSentence.includes(" the actor") ||
          lowerSentence.includes(" the actress") ||
          lowerSentence.includes(" the star")

        if (isAboutActor) {
          deathSentences.push(trimmed)
        }
      }
    }

    if (deathSentences.length > 0) {
      // Take up to 4 most relevant sentences
      data.circumstances = deathSentences.slice(0, 4).join(". ")
    }

    // Extract location of death
    data.locationOfDeath = this.extractLocation(text)

    // Extract notable factors
    data.notableFactors = this.extractNotableFactors(text)

    return data
  }

  /**
   * Extract location of death from text.
   */
  private extractLocation(text: string): string | null {
    const locationPatterns = [
      /died\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|at\s+age|from)|[.,]|$)/i,
      /passed\s+away\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|at\s+age|from)|[.,]|$)/i,
      /death\s+(?:in|at)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:on|from)|[.,]|$)/i,
    ]

    for (const pattern of locationPatterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        const location = match[1].trim()
        if (
          location.length >= 3 &&
          location.length <= 60 &&
          !location.match(/^\d/) &&
          !location.match(
            /january|february|march|april|may|june|july|august|september|october|november|december/i
          )
        ) {
          return location
        }
      }
    }

    return null
  }

  /**
   * Extract notable factors about the death.
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []
    const lowerText = text.toLowerCase()

    for (const keyword of NOTABLE_FACTOR_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        factors.push(keyword)
      }
    }

    // Add circumstance keywords as factors
    for (const keyword of CIRCUMSTANCE_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase()) && !factors.includes(keyword)) {
        factors.push(keyword)
      }
    }

    return [...new Set(factors)].slice(0, 5)
  }
}

interface ArticleData {
  circumstances: string | null
  locationOfDeath: string | null
  notableFactors: string[]
}
