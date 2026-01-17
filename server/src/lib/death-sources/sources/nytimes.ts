/**
 * New York Times API source for obituaries and death news.
 *
 * Uses the NYT Article Search API to find obituaries and death-related
 * articles about actors/entertainers.
 *
 * Setup:
 * 1. Register at https://developer.nytimes.com/
 * 2. Create an app and get API key
 *
 * Pricing (as of Jan 2025):
 * - Free tier: 500 requests/day, 5 requests/minute
 * - No payment required
 *
 * @see https://developer.nytimes.com/docs/articlesearch-product/1/overview
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult, EnrichmentSourceEntry } from "../types.js"
import { DataSourceType, DEFAULT_MAX_STORIES_PER_SOURCE } from "../types.js"

const NYT_API_URL = "https://api.nytimes.com/svc/search/v2/articlesearch.json"

/**
 * NYT Article Search API response structure.
 */
interface NYTSearchResponse {
  status: string
  response: {
    docs: Array<{
      web_url: string
      snippet: string
      lead_paragraph: string
      abstract: string
      headline: {
        main: string
        print_headline?: string
      }
      pub_date: string
      document_type: string
      news_desk: string
      section_name: string
      type_of_material: string
      keywords: Array<{
        name: string
        value: string
      }>
    }>
    meta?: {
      hits: number
      offset: number
    }
    metadata?: {
      hits: number
      offset: number
    }
  }
}

/**
 * New York Times source for obituaries and death news.
 * The NYT has excellent obituary coverage for notable people.
 */
export class NYTimesSource extends BaseDataSource {
  readonly name = "New York Times"
  readonly type = DataSourceType.NYTIMES
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // NYT allows 5 requests/minute = 12 seconds between requests
  protected minDelayMs = 12000

  /** Maximum number of stories to return (configurable) */
  private maxStories: number

  constructor(maxStories?: number) {
    super()
    this.maxStories = maxStories ?? DEFAULT_MAX_STORIES_PER_SOURCE
  }

  /**
   * Check if NYT API is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.NYTIMES_API_KEY
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const apiKey = process.env.NYTIMES_API_KEY

    if (!apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "NYT API key not configured",
      }
    }

    try {
      console.log(`NYT search for: ${actor.name}`)

      // Build search query
      const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
      const query = `"${actor.name}" AND (obituary OR died OR death)`

      const url = new URL(NYT_API_URL)
      url.searchParams.set("api-key", apiKey)
      url.searchParams.set("q", query)
      url.searchParams.set("sort", "relevance")

      // Don't filter by type - we want any article about the person's death,
      // not just obituaries. News articles, tributes, and follow-up stories are valuable.

      // Filter by date range if we have death year
      if (deathYear) {
        url.searchParams.set("begin_date", `${deathYear - 1}0101`)
        url.searchParams.set("end_date", `${deathYear + 1}1231`)
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
            error: "NYT API rate limit exceeded",
          }
        }
        if (response.status === 401) {
          return {
            success: false,
            source: this.createSourceEntry(startTime, 0),
            data: null,
            error: "Invalid NYT API key",
          }
        }
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as NYTSearchResponse

      // Validate response structure - API sometimes returns unexpected formats
      if (!data || typeof data !== "object") {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "Invalid API response: not an object",
        }
      }

      if (!data.response || typeof data.response !== "object") {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "Invalid API response: missing response object",
        }
      }

      // Safely extract hits count with explicit null checks
      const meta = data.response.meta
      const metadata = data.response.metadata
      const hits =
        (meta && typeof meta === "object" ? meta.hits : null) ??
        (metadata && typeof metadata === "object" ? metadata.hits : null) ??
        0
      if (data.status !== "OK" || hits === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No articles found",
        }
      }

      console.log(`  Found ${data.response.docs.length} articles`)

      // Find multiple relevant death-related articles (up to maxStories)
      const articles = this.findRelevantArticles(data.response.docs, actor, this.maxStories)

      if (articles.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No relevant death articles found",
        }
      }

      // Process the primary (best) article
      const primaryArticle = articles[0]
      const primaryResult = this.processArticle(primaryArticle, actor.name, startTime)

      // Process additional articles
      const additionalResults: Array<{
        source: EnrichmentSourceEntry
        data: typeof primaryResult.data
      }> = []

      for (let i = 1; i < articles.length; i++) {
        const additionalArticle = articles[i]
        const result = this.processArticle(additionalArticle, actor.name, startTime)
        additionalResults.push({
          source: result.source,
          data: result.data,
        })
      }

      console.log(`  Returning ${1 + additionalResults.length} stories`)

      return {
        success: true,
        source: primaryResult.source,
        data: primaryResult.data,
        additionalResults: additionalResults.length > 0 ? additionalResults : undefined,
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
   * Process a single article and extract death information.
   */
  private processArticle(
    article: NYTSearchResponse["response"]["docs"][0],
    actorName: string,
    startTime: number
  ) {
    const text =
      article.lead_paragraph || article.snippet || article.abstract || article.headline.main
    const circumstances = this.extractCircumstances(text, actorName)
    const locationOfDeath = this.extractLocation(text)
    const notableFactors = this.extractNotableFactors(text)

    // Calculate confidence
    let confidence = 0.6 // NYT is highly reliable
    if (
      article.type_of_material?.toLowerCase().includes("obituary") ||
      article.news_desk === "Obituaries"
    ) {
      confidence += 0.2 // Obituary bonus
    }
    if (circumstances) confidence += 0.1
    if (text.length > 200) confidence += 0.1

    return {
      source: this.createSourceEntry(startTime, Math.min(0.9, confidence), article.web_url),
      data: {
        circumstances,
        rumoredCircumstances: null,
        notableFactors,
        relatedCelebrities: [] as Array<{
          name: string
          tmdbId: number | null
          relationship: string
        }>,
        locationOfDeath,
        additionalContext: article.abstract || article.snippet || null,
      },
    }
  }

  /**
   * Find multiple relevant death-related articles from search results.
   * Returns articles sorted by relevance (obituaries first, then death-keyword matches).
   */
  private findRelevantArticles(
    docs: NYTSearchResponse["response"]["docs"],
    actor: ActorForEnrichment,
    maxStories: number
  ): NYTSearchResponse["response"]["docs"] {
    const relevant: NYTSearchResponse["response"]["docs"] = []
    const seen = new Set<string>()

    // Helper to add article if not duplicate
    const addArticle = (article: (typeof docs)[0]) => {
      if (!seen.has(article.web_url) && relevant.length < maxStories) {
        seen.add(article.web_url)
        relevant.push(article)
      }
    }

    // First pass: obituaries that mention the actor name
    const obituaries = docs.filter(
      (d) => d.type_of_material?.toLowerCase().includes("obituary") || d.news_desk === "Obituaries"
    )
    for (const obit of obituaries) {
      if (obit.headline.main.toLowerCase().includes(actor.name.split(" ")[0].toLowerCase())) {
        addArticle(obit)
      }
    }
    // Add remaining obituaries
    for (const obit of obituaries) {
      addArticle(obit)
    }

    // Second pass: articles with death keywords in headline
    for (const doc of docs) {
      const title = doc.headline.main.toLowerCase()
      const hasName =
        title.includes(actor.name.toLowerCase()) ||
        title.includes(actor.name.split(" ")[0].toLowerCase())
      const hasDeath = DEATH_KEYWORDS.some((kw) => title.includes(kw.toLowerCase()))

      if (hasName && hasDeath) {
        addArticle(doc)
      }
    }

    // Third pass: any article that mentions the actor name
    for (const doc of docs) {
      if (doc.headline.main.toLowerCase().includes(actor.name.split(" ")[0].toLowerCase())) {
        addArticle(doc)
      }
    }

    return relevant
  }

  /**
   * Extract death circumstances from text.
   */
  private extractCircumstances(text: string, actorName: string): string | null {
    if (!text || text.length < 20) return null

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

      if (deathSentences.length >= 3) break
    }

    if (deathSentences.length === 0) return null

    return deathSentences.join(". ").trim()
  }

  /**
   * Extract location from text.
   */
  private extractLocation(text: string): string | null {
    if (!text) return null

    const patterns = [
      /died (?:at|in) ([A-Z][a-zA-Z\s,]{2,40})/i,
      /passed away (?:at|in) ([A-Z][a-zA-Z\s,]{2,40})/i,
      /(?:at (?:his|her|their) home in) ([A-Z][a-zA-Z\s,]{2,40})/i,
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
