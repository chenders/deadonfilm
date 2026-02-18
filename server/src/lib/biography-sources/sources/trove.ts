/**
 * Trove biography source.
 *
 * Searches the National Library of Australia's Trove newspaper archive for
 * biographical content about actors including profiles, interviews, and features.
 *
 * API v3: https://trove.nla.gov.au/about/create-something/using-api/v3/api-technical-guide
 * - Requires free API key (TROVE_API_KEY environment variable)
 * - Category: newspaper
 *
 * Reliability tier: ARCHIVAL (0.9) - national library primary source.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"

const TROVE_SEARCH_URL = "https://api.trove.nla.gov.au/v3/result"
const MIN_CONTENT_LENGTH = 100

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
      article?: TroveArticle[]
    }
  }>
}

/**
 * Trove biography source for Australian newspaper biographical content.
 */
export class TroveBiographySource extends BaseBiographySource {
  readonly name = "Trove"
  readonly type = BiographySourceType.TROVE_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.ARCHIVAL

  protected minDelayMs = 1000

  private get apiKey(): string | undefined {
    return process.env.TROVE_API_KEY
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Trove API key not configured (TROVE_API_KEY)",
      }
    }

    try {
      // Build biography-focused query
      const query = `"${actor.name}" (biography OR profile OR interview OR "early life")`
      const searchUrl = this.buildSearchUrl(query)

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
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: `Search failed: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as TroveSearchResponse

      // Find newspaper category results
      const newspaperCategory = data.category?.find((c) => c.name === "newspaper")
      const articles = newspaperCategory?.records?.article || []

      if (articles.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No newspaper articles found in Trove",
        }
      }

      // Find the most relevant article
      const relevantArticle = this.findRelevantArticle(articles, actor)

      if (!relevantArticle) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No relevant biographical content found in search results",
        }
      }

      // Build text from article
      const combinedText = this.buildTextFromArticle(relevantArticle)

      if (combinedText.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: relevantArticle.troveUrl,
            queryUsed: query,
          }),
          data: null,
          error: `Trove content too short (${combinedText.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Run through mechanical pre-clean
      const { text } = mechanicalPreClean(combinedText)

      // Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(text || combinedText)

      const publication = relevantArticle.title?.value || "Australian newspaper"
      const articleTitle = relevantArticle.heading || `${actor.name} - Trove`

      const sourceData: RawBiographySourceData = {
        sourceName: "Trove",
        sourceType: BiographySourceType.TROVE_BIO,
        text: text || combinedText,
        url: relevantArticle.troveUrl,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication,
        articleTitle,
        domain: "trove.nla.gov.au",
        contentType: "biography",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: relevantArticle.troveUrl,
          queryUsed: query,
          publication,
          articleTitle,
          domain: "trove.nla.gov.au",
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
   * Build search URL for Trove API v3.
   */
  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams({
      key: this.apiKey!,
      q: query,
      category: "newspaper",
      encoding: "json",
      n: "20",
    })

    return `${TROVE_SEARCH_URL}?${params.toString()}`
  }

  /**
   * Find the most relevant article for the actor.
   */
  private findRelevantArticle(
    articles: TroveArticle[],
    actor: ActorForBiography
  ): TroveArticle | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    const bioKeywords = ["biography", "profile", "interview", "personal", "childhood", "early life"]

    // Sort by relevance score first
    const sortedArticles = [...articles].sort(
      (a, b) => (b.relevance?.score || 0) - (a.relevance?.score || 0)
    )

    for (const article of sortedArticles) {
      const headingLower = article.heading?.toLowerCase() || ""
      const snippetLower = this.cleanSnippet(article.snippet || "").toLowerCase()
      const combined = `${headingLower} ${snippetLower}`

      // Check for actor name in heading or snippet
      if (combined.includes(actorNameLower) || combined.includes(lastName)) {
        // Prefer results with biographical keywords
        if (bioKeywords.some((kw) => combined.includes(kw))) {
          return article
        }
      }

      // Accept full name match even without bio keywords
      if (headingLower.includes(actorNameLower)) {
        return article
      }
    }

    // Fallback: first article mentioning the name
    for (const article of sortedArticles) {
      const combined =
        `${article.heading || ""} ${this.cleanSnippet(article.snippet || "")}`.toLowerCase()
      if (combined.includes(lastName)) {
        return article
      }
    }

    return null
  }

  /**
   * Clean HTML tags from a Trove snippet.
   */
  private cleanSnippet(snippet: string): string {
    let cleaned = snippet
    let previousLength: number
    do {
      previousLength = cleaned.length
      cleaned = cleaned.replace(/<[^>]*>/g, "")
    } while (cleaned.length < previousLength)
    return cleaned.replace(/[<>]/g, "")
  }

  /**
   * Build text from article heading and snippet.
   */
  private buildTextFromArticle(article: TroveArticle): string {
    const parts: string[] = []

    if (article.title?.value) {
      parts.push(`Source: ${article.title.value}`)
    }

    if (article.date) {
      parts.push(`Date: ${article.date}`)
    }

    if (article.heading) {
      parts.push(article.heading)
    }

    if (article.snippet) {
      parts.push(this.cleanSnippet(article.snippet))
    }

    return parts.join(". ")
  }
}
