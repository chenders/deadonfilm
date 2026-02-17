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
import type { ActorForEnrichment, SourceLookupResult, EnrichmentSourceEntry } from "../types.js"
import { DataSourceType, DEFAULT_MAX_STORIES_PER_SOURCE, ReliabilityTier } from "../types.js"

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
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  // Guardian allows 12 requests/second
  protected minDelayMs = 200

  /** Maximum number of stories to return (configurable) */
  private maxStories: number

  constructor(maxStories?: number) {
    super()
    this.maxStories = maxStories ?? DEFAULT_MAX_STORIES_PER_SOURCE
  }

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

      // Don't filter by section - we want any article about the person's death,
      // not just obituaries. News articles, tributes, and follow-up stories are valuable.

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
          error: "No articles found",
        }
      }

      console.log(`  Found ${data.response.results.length} articles`)

      // Find multiple relevant death-related articles (up to maxStories)
      const articles = this.findRelevantArticles(data.response.results, actor, this.maxStories)

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
    article: GuardianSearchResponse["response"]["results"][0],
    actorName: string,
    startTime: number
  ) {
    const bodyText =
      article.fields?.bodyText || article.fields?.standfirst || article.fields?.trailText || ""
    const circumstances = this.extractCircumstances(bodyText, actorName)
    const locationOfDeath = this.extractLocation(bodyText)
    const notableFactors = this.extractNotableFactors(bodyText)

    // Calculate confidence
    let confidence = 0.5 // Guardian is reliable
    if (article.sectionId === "tone/obituaries") confidence += 0.2 // Obituary section bonus
    if (circumstances) confidence += 0.1
    if (bodyText.length > 500) confidence += 0.1

    return {
      source: this.createSourceEntry(startTime, confidence, article.webUrl),
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
        additionalContext: article.fields?.standfirst || null,
      },
    }
  }

  /**
   * Find multiple relevant death-related articles from search results.
   * Returns articles sorted by relevance (obituaries first, then death-keyword matches).
   */
  private findRelevantArticles(
    results: GuardianSearchResponse["response"]["results"],
    actor: ActorForEnrichment,
    maxStories: number
  ): GuardianSearchResponse["response"]["results"] {
    const relevant: GuardianSearchResponse["response"]["results"] = []
    const seen = new Set<string>()

    // Helper to add article if not duplicate
    const addArticle = (article: (typeof results)[0]) => {
      if (!seen.has(article.webUrl) && relevant.length < maxStories) {
        seen.add(article.webUrl)
        relevant.push(article)
      }
    }

    // First pass: obituaries that mention the actor name
    const obituaries = results.filter((r) => r.sectionId === "tone/obituaries")
    for (const obit of obituaries) {
      if (obit.webTitle.toLowerCase().includes(actor.name.toLowerCase())) {
        addArticle(obit)
      }
    }
    // Add remaining obituaries
    for (const obit of obituaries) {
      addArticle(obit)
    }

    // Second pass: articles with death keywords in title
    for (const result of results) {
      const title = result.webTitle.toLowerCase()
      const hasName =
        title.includes(actor.name.toLowerCase()) ||
        title.includes(actor.name.split(" ")[0].toLowerCase())
      const hasDeath = DEATH_KEYWORDS.some((kw) => title.includes(kw.toLowerCase()))

      if (hasName && hasDeath) {
        addArticle(result)
      }
    }

    // Third pass: any article that mentions the actor name
    for (const result of results) {
      if (result.webTitle.toLowerCase().includes(actor.name.split(" ")[0].toLowerCase())) {
        addArticle(result)
      }
    }

    return relevant
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
