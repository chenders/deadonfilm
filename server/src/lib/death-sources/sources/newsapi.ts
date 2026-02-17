/**
 * NewsAPI source for news-based death information.
 *
 * NewsAPI aggregates news articles from 80,000+ sources worldwide.
 * Free tier: 100 requests/day (or 450 in development mode).
 * Useful for finding obituaries and death-related news coverage.
 *
 * Requires NEWSAPI_KEY environment variable.
 *
 * @see https://newsapi.org/docs/get-started
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { extractLocation, extractNotableFactors, isAboutActor } from "./news-utils.js"

const NEWSAPI_BASE_URL = "https://newsapi.org/v2"

/**
 * NewsAPI source for actor death information.
 */
export class NewsAPISource extends BaseDataSource {
  readonly name = "NewsAPI"
  readonly type = DataSourceType.NEWSAPI
  readonly isFree = true // Free tier available
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SEARCH_AGGREGATOR

  // Rate limit: be conservative with free tier
  protected minDelayMs = 1000

  private readonly apiKey: string | undefined

  constructor() {
    super()
    this.apiKey = process.env.NEWSAPI_KEY
  }

  /**
   * Check if NewsAPI is available (API key configured).
   */
  isAvailable(): boolean {
    return !!this.apiKey
  }

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

    if (!this.apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "NewsAPI key not configured",
      }
    }

    try {
      // Search for obituary/death news about the actor
      const deathDate = new Date(actor.deathday)
      // deathYear unused but kept for potential future query refinement
      const _deathYear = deathDate.getFullYear()

      // Build search query - search for obituary/death articles
      const searchQuery = `"${actor.name}" AND (obituary OR died OR death OR "passed away")`

      // Calculate date range: search from 1 week before death to 2 months after
      const fromDate = new Date(deathDate)
      fromDate.setDate(fromDate.getDate() - 7)
      const toDate = new Date(deathDate)
      toDate.setMonth(toDate.getMonth() + 2)

      const params = new URLSearchParams({
        q: searchQuery,
        from: fromDate.toISOString().split("T")[0],
        to: toDate.toISOString().split("T")[0],
        language: "en",
        sortBy: "relevancy",
        pageSize: "10",
      })

      const searchUrl = `${NEWSAPI_BASE_URL}/everything?${params.toString()}`

      const response = await fetch(searchUrl, {
        headers: {
          "X-Api-Key": this.apiKey,
          "User-Agent": this.userAgent,
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: `NewsAPI request failed: ${response.status} - ${(errorData as { message?: string }).message || "Unknown error"}`,
        }
      }

      const data = (await response.json()) as NewsAPIResponse

      if (data.status !== "ok" || !data.articles || data.articles.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No news articles found for actor",
        }
      }

      // Process articles to extract death information
      const deathInfo = this.extractDeathInfo(data.articles, actor)

      if (!deathInfo.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, searchUrl),
          data: null,
          error: "No death information found in news articles",
        }
      }

      // Calculate confidence based on what we found
      let confidence = 0.5 // Base confidence for news aggregation
      if (deathInfo.circumstances.length > 100) confidence += 0.1
      if (deathInfo.locationOfDeath) confidence += 0.1
      if (deathInfo.notableFactors.length > 0) confidence += 0.1
      if (deathInfo.sourceCount > 1) confidence += 0.1 // Multiple sources reporting

      return {
        success: true,
        source: this.createSourceEntry(
          startTime,
          Math.min(confidence, 0.85),
          deathInfo.bestArticleUrl ?? searchUrl
        ),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: null,
          notableFactors: deathInfo.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathInfo.locationOfDeath,
          additionalContext: `Source: NewsAPI (${deathInfo.sourceCount} article(s) from ${deathInfo.sources.join(", ")})`,
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
   * Extract death information from news articles.
   */
  private extractDeathInfo(
    articles: NewsAPIArticle[],
    actor: ActorForEnrichment
  ): ExtractedDeathInfo {
    const result: ExtractedDeathInfo = {
      circumstances: null,
      locationOfDeath: null,
      notableFactors: [],
      sources: [],
      sourceCount: 0,
      bestArticleUrl: null,
    }

    const allDeathSentences: string[] = []
    const sourcesSet = new Set<string>()
    let bestArticle: NewsAPIArticle | null = null
    let bestScore = 0

    for (const article of articles) {
      // Combine title, description, and content for analysis
      const text = [article.title, article.description, article.content].filter(Boolean).join(" ")

      const lowerText = text.toLowerCase()

      // Check if article mentions death
      const hasDeathMention = DEATH_KEYWORDS.some((keyword) =>
        lowerText.includes(keyword.toLowerCase())
      )

      if (!hasDeathMention) continue

      // Score this article
      let score = 0
      if (lowerText.includes("obituary")) score += 3
      if (lowerText.includes("cause of death")) score += 2
      DEATH_KEYWORDS.forEach((kw) => {
        if (lowerText.includes(kw.toLowerCase())) score += 1
      })
      CIRCUMSTANCE_KEYWORDS.forEach((kw) => {
        if (lowerText.includes(kw.toLowerCase())) score += 1
      })

      if (score > bestScore) {
        bestScore = score
        bestArticle = article
      }

      // Track source
      if (article.source?.name) {
        sourcesSet.add(article.source.name)
      }

      // Extract death-related sentences
      const sentences = text.split(/[.!?]+/)
      for (const sentence of sentences) {
        const trimmed = sentence.trim()
        const lowerSentence = trimmed.toLowerCase()

        const hasDeathKeyword = DEATH_KEYWORDS.some((kw) =>
          lowerSentence.includes(kw.toLowerCase())
        )

        if (hasDeathKeyword && trimmed.length > 20 && trimmed.length < 400) {
          // Verify this is about the right person using shared utility
          if (isAboutActor(lowerSentence, actor) && !allDeathSentences.includes(trimmed)) {
            allDeathSentences.push(trimmed)
          }
        }
      }

      // Try to extract location using shared utility
      if (!result.locationOfDeath) {
        result.locationOfDeath = extractLocation(text)
      }
    }

    // Build circumstances from best sentences
    if (allDeathSentences.length > 0) {
      result.circumstances = allDeathSentences.slice(0, 4).join(". ")
    }

    // Extract notable factors from all articles using shared utility
    const allText = articles
      .map((a) => [a.title, a.description, a.content].filter(Boolean).join(" "))
      .join(" ")
    result.notableFactors = extractNotableFactors(allText)

    result.sources = Array.from(sourcesSet).slice(0, 5)
    result.sourceCount = sourcesSet.size
    result.bestArticleUrl = bestArticle?.url ?? null

    return result
  }
}

/**
 * NewsAPI response types.
 */
interface NewsAPIResponse {
  status: string
  totalResults?: number
  articles?: NewsAPIArticle[]
  code?: string
  message?: string
}

interface NewsAPIArticle {
  source?: {
    id: string | null
    name: string
  }
  author?: string | null
  title?: string
  description?: string
  url?: string
  urlToImage?: string | null
  publishedAt?: string
  content?: string
}

interface ExtractedDeathInfo {
  circumstances: string | null
  locationOfDeath: string | null
  notableFactors: string[]
  sources: string[]
  sourceCount: number
  bestArticleUrl: string | null
}
