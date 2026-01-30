/**
 * Internet Archive source for historical death information.
 *
 * The Internet Archive (archive.org) is a non-profit library containing
 * millions of free books, movies, software, music, websites, and more.
 * Includes digitized books, newspapers, magazines, and documents.
 *
 * API: https://archive.org/developers/index-apis.html
 * - Free, no API key required
 * - Advanced Search: archive.org/advancedsearch.php
 * - Returns JSON with item metadata
 *
 * Strategy:
 * 1. Search for actor name + death keywords in text/book collections
 * 2. Filter by date and media type
 * 3. Extract death information from item descriptions and OCR text
 */

import { BaseDataSource, DEATH_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"
import { aiSelectLinks, type SearchResultForRanking } from "../ai-helpers.js"
import { getEnrichmentLogger } from "../logger.js"

const IA_SEARCH_URL = "https://archive.org/advancedsearch.php"
const IA_DETAILS_URL = "https://archive.org/details"

interface IASearchDoc {
  identifier: string
  title?: string
  description?: string | string[]
  creator?: string | string[]
  date?: string
  year?: number
  mediatype?: string
  collection?: string[]
  subject?: string | string[]
  downloads?: number
  avg_rating?: number
}

interface IASearchResponse {
  responseHeader: {
    status: number
    QTime: number
  }
  response: {
    numFound: number
    start: number
    docs: IASearchDoc[]
  }
}

// Minimum AI relevance score to consider a result valid
const MIN_AI_RELEVANCE_SCORE = 0.5

/**
 * Internet Archive source for historical death information.
 *
 * Uses AI-powered relevance evaluation to filter out irrelevant results
 * when ANTHROPIC_API_KEY is available.
 */
export class InternetArchiveSource extends BaseDataSource {
  readonly name = "Internet Archive"
  readonly type = DataSourceType.INTERNET_ARCHIVE
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Be polite to Internet Archive servers
  protected minDelayMs = 1500

  // Track AI costs for this lookup
  private aiCostUsd = 0

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

    try {
      // Build search query
      const searchQuery = this.buildSearchQuery(actor.name, deathYear)
      const searchUrl = this.buildSearchUrl(searchQuery)

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

      const data = (await response.json()) as IASearchResponse

      if (!data.response?.docs || data.response.docs.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No items found for this actor in Internet Archive",
        }
      }

      // Find the most relevant item using AI if available, otherwise keyword matching
      const relevantDoc = await this.findRelevantDocWithAI(data.response.docs, actor, searchUrl)

      if (!relevantDoc) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No relevant death record found in search results",
        }
      }

      // Extract death information
      const deathInfo = this.extractDeathInfo(relevantDoc, actor)

      if (!deathInfo) {
        return {
          success: false,
          source: this.createSourceEntry(
            startTime,
            0,
            `${IA_DETAILS_URL}/${relevantDoc.identifier}`
          ),
          data: null,
          error: "Could not extract death information from item",
        }
      }

      const itemUrl = `${IA_DETAILS_URL}/${relevantDoc.identifier}`

      return {
        success: true,
        source: this.createSourceEntry(startTime, deathInfo.confidence, itemUrl),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: null,
          notableFactors: deathInfo.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathInfo.locationOfDeath,
          additionalContext: `Source: Internet Archive (${relevantDoc.mediatype || "text"}, ${relevantDoc.date || relevantDoc.year || "historical"})`,
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
   * Build search query for Internet Archive.
   */
  private buildSearchQuery(actorName: string, deathYear: number): string {
    // Search for actor name with death-related terms
    // Focus on text-based collections (books, magazines, newspapers)
    const deathTerms = "death OR died OR obituary OR funeral OR memorial"
    const yearRange = `year:[${deathYear - 5} TO ${deathYear + 5}]`
    const mediaTypes = "(mediatype:texts OR mediatype:audio)"

    return `"${actorName}" AND (${deathTerms}) AND ${yearRange} AND ${mediaTypes}`
  }

  /**
   * Build search URL for Internet Archive Advanced Search.
   */
  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams({
      q: query,
      fl: [
        "identifier",
        "title",
        "description",
        "creator",
        "date",
        "year",
        "mediatype",
        "collection",
        "subject",
        "downloads",
      ].join(","),
      sort: "downloads desc",
      rows: "20",
      page: "1",
      output: "json",
    })

    return `${IA_SEARCH_URL}?${params.toString()}`
  }

  /**
   * Find the most relevant document using AI evaluation when available.
   *
   * Strategy:
   * 1. If ANTHROPIC_API_KEY is available, use AI to evaluate all results
   * 2. AI ranks results by likelihood of containing actual death information
   * 3. Only accept results with relevance score >= MIN_AI_RELEVANCE_SCORE
   * 4. Fall back to keyword matching if AI is not available
   */
  private async findRelevantDocWithAI(
    docs: IASearchDoc[],
    actor: ActorForEnrichment,
    _searchUrl: string
  ): Promise<IASearchDoc | null> {
    const logger = getEnrichmentLogger()

    // Try AI-powered evaluation if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        // Convert docs to search results format for AI evaluation
        const searchResults: SearchResultForRanking[] = docs.slice(0, 10).map((doc) => ({
          url: `${IA_DETAILS_URL}/${doc.identifier}`,
          title: doc.title || doc.identifier,
          snippet: this.normalizeDescription(doc.description).substring(0, 300),
        }))

        logger.debug(`[IA_AI_EVAL] ${actor.name}`, {
          resultCount: searchResults.length,
        })

        // Use AI to rank relevance
        const aiResult = await aiSelectLinks(actor, searchResults, 3)
        this.aiCostUsd = aiResult.costUsd

        // Find the highest-scoring result that meets our threshold
        const bestMatch = aiResult.data
          .filter((r) => r.score >= MIN_AI_RELEVANCE_SCORE)
          .sort((a, b) => b.score - a.score)[0]

        if (bestMatch) {
          // Find the corresponding doc
          const matchedDoc = docs.find(
            (doc) => `${IA_DETAILS_URL}/${doc.identifier}` === bestMatch.url
          )

          if (matchedDoc) {
            logger.debug(`[IA_AI_MATCH] ${actor.name}`, {
              identifier: matchedDoc.identifier,
              score: bestMatch.score,
              reason: bestMatch.reason,
            })
            return matchedDoc
          }
        }

        logger.debug(`[IA_AI_NO_MATCH] ${actor.name}`, {
          topScore: aiResult.data[0]?.score || 0,
          threshold: MIN_AI_RELEVANCE_SCORE,
        })

        // AI found no relevant results
        return null
      } catch (error) {
        logger.debug(`[IA_AI_ERROR] ${actor.name}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        })
        // Fall back to keyword matching on AI error
      }
    }

    // Fall back to keyword-based matching when AI is not available
    return this.findRelevantDoc(docs, actor)
  }

  /**
   * Find the most relevant document for the actor using keyword matching.
   *
   * IMPORTANT: This method is intentionally strict to avoid returning garbage results.
   * It requires BOTH the actor's full name AND death keywords to appear in the document.
   * If no match is found, it returns null rather than a potentially irrelevant document.
   */
  private findRelevantDoc(docs: IASearchDoc[], actor: ActorForEnrichment): IASearchDoc | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]
    const isSingleWordName = nameParts.length === 1

    // Sort by downloads (popularity/reliability indicator)
    const sortedDocs = [...docs].sort((a, b) => (b.downloads || 0) - (a.downloads || 0))

    // First pass: require FULL name match + death keywords (strictest)
    for (const doc of sortedDocs) {
      const titleLower = doc.title?.toLowerCase() || ""
      const descLower = this.normalizeDescription(doc.description).toLowerCase()
      const subjectLower = this.normalizeDescription(doc.subject).toLowerCase()
      const combined = `${titleLower} ${descLower} ${subjectLower}`

      // Must contain full name
      if (combined.includes(actorNameLower)) {
        // Must also contain death keywords
        if (DEATH_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()))) {
          return doc
        }
      }
    }

    // Second pass: for multi-word names only, try last name + death keywords
    // Skip this for single-word names like "D'Angelo" to avoid false positives
    if (!isSingleWordName) {
      for (const doc of sortedDocs) {
        const titleLower = doc.title?.toLowerCase() || ""
        const descLower = this.normalizeDescription(doc.description).toLowerCase()
        const subjectLower = this.normalizeDescription(doc.subject).toLowerCase()
        const combined = `${titleLower} ${descLower} ${subjectLower}`

        if (combined.includes(lastName)) {
          // Still require death keywords for relevance
          if (DEATH_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()))) {
            return doc
          }
        }
      }
    }

    // No fallback - return null if no relevant document found
    // This prevents returning garbage results like random audio files
    return null
  }

  /**
   * Normalize description field (can be string or array).
   */
  private normalizeDescription(desc: string | string[] | undefined): string {
    if (!desc) return ""
    if (Array.isArray(desc)) return desc.join(" ")
    return desc
  }

  /**
   * Extract death information from an Internet Archive document.
   */
  private extractDeathInfo(
    doc: IASearchDoc,
    actor: ActorForEnrichment
  ): {
    circumstances: string
    notableFactors: string[]
    locationOfDeath: string | null
    confidence: number
  } | null {
    const text = [
      doc.title,
      this.normalizeDescription(doc.description),
      this.normalizeDescription(doc.subject),
    ]
      .filter(Boolean)
      .join(" ")

    if (!text.trim()) {
      return null
    }

    // Extract notable factors
    const notableFactors = this.extractNotableFactors(text)

    // Try to extract location
    const locationOfDeath = this.extractLocation(text)

    // Build circumstances
    const circumstances = this.buildCircumstances(doc, actor)

    // Calculate confidence
    let confidence = 0.25 // Lower base for archive sources
    if (text.toLowerCase().includes(actor.name.toLowerCase())) {
      confidence += 0.2
    }
    if (notableFactors.length > 0) {
      confidence += 0.1
    }
    if (locationOfDeath) {
      confidence += 0.1
    }
    if ((doc.downloads || 0) > 100) {
      confidence += 0.1 // Higher downloads = more reliable source
    }

    return {
      circumstances,
      notableFactors,
      locationOfDeath,
      confidence: Math.min(confidence, 0.65),
    }
  }

  /**
   * Extract notable factors from text.
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
      lowerText.includes("assassination")
    ) {
      factors.push("homicide")
    }
    if (lowerText.includes("heart") || lowerText.includes("cardiac")) {
      factors.push("heart condition")
    }
    if (lowerText.includes("cancer") || lowerText.includes("tumor")) {
      factors.push("illness - cancer")
    }
    if (lowerText.includes("biography") || lowerText.includes("memoir")) {
      factors.push("biographical source")
    }
    if (lowerText.includes("filmography") || lowerText.includes("hollywood")) {
      factors.push("film industry source")
    }

    return factors
  }

  /**
   * Extract location from text.
   */
  private extractLocation(text: string): string | null {
    /* eslint-disable security/detect-unsafe-regex -- Acceptable for controlled text scraping */
    const patterns = [
      /died\s+(?:at|in)\s+([A-Z][a-zA-Z\s,]+(?:Hospital|home|residence|California|New York))/i,
      /(?:in\s+)?(Hollywood|Los Angeles|New York|London|Paris|Beverly Hills)/i,
      /(?:at|in)\s+([A-Z][a-zA-Z\s]+(?:Hospital|Sanitarium|Home))/i,
    ]
    /* eslint-enable security/detect-unsafe-regex */

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
   * Build circumstances text from document.
   */
  private buildCircumstances(doc: IASearchDoc, actor: ActorForEnrichment): string {
    const parts: string[] = []

    if (doc.title) {
      parts.push(`From "${doc.title}"`)
    }

    if (doc.creator) {
      const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator
      parts.push(`by ${creator}`)
    }

    if (doc.date || doc.year) {
      parts.push(`(${doc.date || doc.year})`)
    }

    if (doc.description) {
      const desc = this.normalizeDescription(doc.description).substring(0, 400)
      parts.push(desc)
    }

    if (parts.length === 0) {
      return `Historical archive record of ${actor.name} found in Internet Archive.`
    }

    return parts.join(" ")
  }
}
