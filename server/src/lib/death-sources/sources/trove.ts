/**
 * Trove source for Australian historical newspaper death information.
 *
 * Trove is the National Library of Australia's search service,
 * providing access to digitized Australian newspapers dating back to 1803.
 * Excellent for Australian actors and those with Australian connections.
 *
 * API v3: https://trove.nla.gov.au/about/create-something/using-api/v3/api-technical-guide
 * - Requires free API key (TROVE_API_KEY environment variable)
 * - Rate limiting: reasonable use encouraged
 * - Returns JSON with article metadata and OCR text
 *
 * Strategy:
 * 1. Search for actor name + death keywords within the newspaper category
 * 2. Filter to articles around the death date
 * 3. Extract death information from article text
 */

import { BaseDataSource, DEATH_KEYWORDS, LOW_PRIORITY_TIMEOUT_MS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"

const TROVE_API_BASE = "https://api.trove.nla.gov.au/v3"
const TROVE_SEARCH_URL = `${TROVE_API_BASE}/result`

interface TroveArticle {
  id: string
  url: string
  heading: string
  category: string
  title: {
    id: string
    value: string
  }
  date: string
  page: number
  pageSequence: number
  relevance: {
    score: number
  }
  snippet?: string
  troveUrl: string
}

interface TroveSearchResponse {
  category: Array<{
    name: string
    records: {
      total: number
      next?: string
      article?: TroveArticle[]
    }
  }>
}

/**
 * Trove source for Australian newspaper obituaries and death notices.
 */
export class TroveSource extends BaseDataSource {
  readonly name = "Trove"
  readonly type = DataSourceType.TROVE
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.ARCHIVAL

  // Be polite to NLA servers
  protected minDelayMs = 1000

  // Low priority archive source - use shorter timeout
  protected requestTimeoutMs = LOW_PRIORITY_TIMEOUT_MS

  private get apiKey(): string | undefined {
    return process.env.TROVE_API_KEY
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Trove API key not configured (TROVE_API_KEY)",
      }
    }

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
      // Build search query for obituary/death notice
      const searchQuery = `"${actor.name}" (died OR death OR obituary OR funeral)`
      const searchUrl = this.buildSearchUrl(searchQuery, deathYear)

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

      const data = (await response.json()) as TroveSearchResponse

      // Find the newspaper category results
      const newspaperCategory = data.category?.find((c) => c.name === "newspaper")
      const articles = newspaperCategory?.records?.article || []

      if (articles.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No newspaper articles found for this actor in Trove",
        }
      }

      // Find the most relevant article
      const relevantArticle = this.findRelevantArticle(articles, actor)

      if (!relevantArticle) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No relevant death notice found in search results",
        }
      }

      // Extract death information
      const deathInfo = this.extractDeathInfo(relevantArticle, actor)

      if (!deathInfo) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, relevantArticle.troveUrl),
          data: null,
          error: "Could not extract death information from article",
        }
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, deathInfo.confidence, relevantArticle.troveUrl),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: null,
          notableFactors: deathInfo.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathInfo.locationOfDeath,
          additionalContext: `Source: Trove (National Library of Australia, ${relevantArticle.title?.value || "Australian newspaper"}, ${relevantArticle.date})`,
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
   * Build search URL for Trove API v3.
   */
  private buildSearchUrl(query: string, deathYear: number): string {
    // Search within a year window around death
    const startDate = `${deathYear - 1}-01-01`
    const endDate = `${deathYear + 1}-12-31`

    const params = new URLSearchParams({
      key: this.apiKey!,
      q: query,
      category: "newspaper",
      encoding: "json",
      n: "20", // Number of results
      "l-decade": String(Math.floor(deathYear / 10) * 10), // Filter by decade
      "s-dateFrom": startDate,
      "s-dateTo": endDate,
    })

    return `${TROVE_SEARCH_URL}?${params.toString()}`
  }

  /**
   * Find the most relevant article for the actor.
   */
  private findRelevantArticle(
    articles: TroveArticle[],
    actor: ActorForEnrichment
  ): TroveArticle | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    // Sort by relevance score first
    const sortedArticles = [...articles].sort(
      (a, b) => (b.relevance?.score || 0) - (a.relevance?.score || 0)
    )

    for (const article of sortedArticles) {
      const headingLower = article.heading?.toLowerCase() || ""
      const snippetLower = article.snippet?.toLowerCase() || ""
      const combined = `${headingLower} ${snippetLower}`

      // Check for actor name in heading (most relevant)
      if (headingLower.includes(actorNameLower) || headingLower.includes(lastName)) {
        // Check for death keywords
        if (DEATH_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()))) {
          return article
        }
      }

      // Check snippet for full name match with death keyword
      if (
        snippetLower.includes(actorNameLower) &&
        DEATH_KEYWORDS.some((kw) => snippetLower.includes(kw.toLowerCase()))
      ) {
        return article
      }
    }

    // Fall back to first article mentioning the name
    for (const article of sortedArticles) {
      const combined = `${article.heading || ""} ${article.snippet || ""}`.toLowerCase()
      if (combined.includes(lastName)) {
        return article
      }
    }

    return sortedArticles[0] || null
  }

  /**
   * Extract death information from a Trove article.
   */
  private extractDeathInfo(
    article: TroveArticle,
    actor: ActorForEnrichment
  ): {
    circumstances: string
    notableFactors: string[]
    locationOfDeath: string | null
    confidence: number
  } | null {
    const text = `${article.heading || ""} ${article.snippet || ""}`

    if (!text.trim()) {
      return null
    }

    // Extract notable factors
    const notableFactors = this.extractNotableFactors(text)

    // Try to extract location (Australian cities)
    const locationOfDeath = this.extractLocation(text)

    // Build circumstances
    const circumstances = this.buildCircumstances(article, actor)

    // Calculate confidence
    let confidence = 0.3
    if (text.toLowerCase().includes(actor.name.toLowerCase())) {
      confidence += 0.2
    }
    if (notableFactors.length > 0) {
      confidence += 0.1
    }
    if (locationOfDeath) {
      confidence += 0.1
    }
    if (article.relevance?.score > 50) {
      confidence += 0.1
    }

    return {
      circumstances,
      notableFactors,
      locationOfDeath,
      confidence: Math.min(confidence, 0.7),
    }
  }

  /**
   * Extract notable factors from article text.
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
    if (lowerText.includes("cancer") || lowerText.includes("tumour")) {
      factors.push("illness - cancer")
    }
    if (lowerText.includes("pneumonia") || lowerText.includes("influenza")) {
      factors.push("illness - respiratory")
    }
    if (lowerText.includes("sudden") || lowerText.includes("unexpected")) {
      factors.push("sudden death")
    }

    return factors
  }

  /**
   * Extract location from text (Australian cities and hospitals).
   */
  private extractLocation(text: string): string | null {
    // Australian cities and common location patterns
    /* eslint-disable security/detect-unsafe-regex -- Acceptable for controlled text scraping */
    const patterns = [
      /died\s+(?:at|in)\s+([A-Z][a-zA-Z\s,]+(?:Hospital|home|residence))/i,
      /(?:in\s+)?(Sydney|Melbourne|Brisbane|Perth|Adelaide|Hobart|Darwin|Canberra)/i,
      /(?:at|in)\s+([A-Z][a-zA-Z\s]+(?:Hospital|Infirmary|Home))/i,
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
   * Build circumstances text from article.
   */
  private buildCircumstances(article: TroveArticle, actor: ActorForEnrichment): string {
    const parts: string[] = []

    if (article.title?.value) {
      parts.push(`Reported in ${article.title.value}`)
    }

    if (article.date) {
      parts.push(`dated ${article.date}`)
    }

    if (article.heading) {
      parts.push(`"${article.heading}"`)
    }

    if (article.snippet) {
      // Clean up snippet - use iterative replacement to handle malformed/nested tags
      let cleanSnippet = article.snippet
      let previousLength: number
      do {
        previousLength = cleanSnippet.length
        cleanSnippet = cleanSnippet.replace(/<[^>]*>/g, "")
      } while (cleanSnippet.length < previousLength)
      // Also remove any remaining < or > characters that could be part of incomplete tags
      cleanSnippet = cleanSnippet.replace(/[<>]/g, "").substring(0, 400)
      parts.push(cleanSnippet)
    }

    if (parts.length === 0) {
      return `Historical Australian newspaper mention of ${actor.name}'s death found in Trove archive.`
    }

    return parts.join(". ")
  }
}
