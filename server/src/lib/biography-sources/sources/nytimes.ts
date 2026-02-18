/**
 * New York Times biography source.
 *
 * Uses the NYT Article Search API to find biographical profiles, interviews,
 * and feature articles about actors.
 *
 * Note: The NYT API returns headline, abstract, lead_paragraph, and web_url
 * but NOT full article text. Content will be limited but authoritative.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - authoritative journalism.
 *
 * @see https://developer.nytimes.com/docs/articlesearch-product/1/overview
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"

const NYT_API_URL = "https://api.nytimes.com/svc/search/v2/articlesearch.json"
const MIN_CONTENT_LENGTH = 100 // Lower than others since NYT only returns abstract/lead

/** Biographical keywords to look for in article headlines/abstract. */
const BIO_HEADLINE_KEYWORDS = [
  "profile",
  "interview",
  "early life",
  "childhood",
  "biography",
  "life of",
  "portrait",
  "who is",
  "growing up",
  "personal",
]

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
 * New York Times source for biographical content.
 * Searches the NYT's archive for profiles, interviews, and features.
 */
export class NYTimesBiographySource extends BaseBiographySource {
  readonly name = "New York Times"
  readonly type = BiographySourceType.NYTIMES_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  // NYT allows 10 calls/minute = 6 seconds between requests
  protected minDelayMs = 6000

  /**
   * Check if NYT API is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.NYTIMES_API_KEY
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
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
      // Build biography-focused query
      const query = `"${actor.name}" biography OR profile OR interview`

      const url = new URL(NYT_API_URL)
      url.searchParams.set("api-key", apiKey)
      url.searchParams.set("q", query)
      url.searchParams.set("sort", "relevance")
      url.searchParams.set("fq", 'document_type:("article")')

      const response = await fetch(url.toString(), {
        headers: { "User-Agent": this.userAgent },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        if (response.status === 429) {
          return {
            success: false,
            source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
            data: null,
            error: "NYT API rate limit exceeded",
          }
        }
        if (response.status === 401) {
          return {
            success: false,
            source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
            data: null,
            error: "Invalid NYT API key",
          }
        }
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: `NYT API error: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as NYTSearchResponse

      // Validate response structure
      if (
        !data ||
        typeof data !== "object" ||
        !data.response ||
        typeof data.response !== "object"
      ) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "Invalid API response structure",
        }
      }

      // Check for results
      const meta = data.response.meta
      const metadata = data.response.metadata
      const hits =
        (meta && typeof meta === "object" ? meta.hits : null) ??
        (metadata && typeof metadata === "object" ? metadata.hits : null) ??
        0

      if (data.status !== "OK" || hits === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No articles found",
        }
      }

      // Find the best biographical article
      const article = this.findBestBiographicalArticle(data.response.docs)

      if (!article) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No relevant biographical articles found",
        }
      }

      // Combine available text fields (NYT API doesn't return full article body)
      const combinedText = [article.lead_paragraph, article.abstract, article.snippet]
        .filter(Boolean)
        .join("\n\n")

      if (!combinedText) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: article.web_url,
            queryUsed: query,
          }),
          data: null,
          error: "Article has no text content",
        }
      }

      // Run through mechanical pre-clean pipeline
      const { text } = mechanicalPreClean(combinedText)

      // Check minimum content length
      if (text.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: article.web_url,
            queryUsed: query,
            publication: "The New York Times",
            domain: "nytimes.com",
          }),
          data: null,
          error: `NYT content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Calculate biographical confidence (conservative since we only have abstract/lead)
      const confidence = Math.min(0.7, this.calculateBiographicalConfidence(text))

      // Build result
      const articleTitle = article.headline.main

      const sourceData: RawBiographySourceData = {
        sourceName: "The New York Times",
        sourceType: BiographySourceType.NYTIMES_BIO,
        text,
        url: article.web_url,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication: "The New York Times",
        articleTitle,
        domain: "nytimes.com",
        contentType: "profile",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: article.web_url,
          queryUsed: query,
          publication: "The New York Times",
          articleTitle,
          domain: "nytimes.com",
          contentType: "profile",
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
   * Find the best biographical article from search results.
   * Prefers articles with biographical keywords in the headline/abstract.
   */
  private findBestBiographicalArticle(
    docs: NYTSearchResponse["response"]["docs"]
  ): NYTSearchResponse["response"]["docs"][0] | null {
    if (docs.length === 0) return null

    // First pass: articles with biographical keywords in headline
    for (const doc of docs) {
      const headline = doc.headline.main.toLowerCase()
      if (BIO_HEADLINE_KEYWORDS.some((kw) => headline.includes(kw))) {
        return doc
      }
    }

    // Second pass: articles with biographical keywords in abstract/snippet
    for (const doc of docs) {
      const text = (doc.abstract || doc.snippet || "").toLowerCase()
      if (BIO_HEADLINE_KEYWORDS.some((kw) => text.includes(kw))) {
        return doc
      }
    }

    // Fallback: first result
    return docs[0]
  }
}
