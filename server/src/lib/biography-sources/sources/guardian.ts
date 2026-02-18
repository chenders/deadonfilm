/**
 * The Guardian biography source.
 *
 * Uses The Guardian Open Platform API to search for biographical profiles,
 * interviews, and feature articles about actors.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - authoritative journalism.
 *
 * @see https://open-platform.theguardian.com/documentation/
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"

const GUARDIAN_API_URL = "https://content.guardianapis.com/search"
const MIN_CONTENT_LENGTH = 200

/** Biographical keywords to look for in article titles/body. */
const BIO_TITLE_KEYWORDS = [
  "profile",
  "interview",
  "early life",
  "childhood",
  "biography",
  "life story",
  "portrait",
  "who is",
  "growing up",
  "memoir",
]

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
 * The Guardian source for biographical content.
 * Searches the Guardian's extensive archive of profiles, interviews, and features.
 */
export class GuardianBiographySource extends BaseBiographySource {
  readonly name = "The Guardian"
  readonly type = BiographySourceType.GUARDIAN_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  // Guardian allows 12 requests/second
  protected minDelayMs = 200

  /**
   * Check if Guardian API is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.GUARDIAN_API_KEY
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
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
      // Build biography-focused query
      const query = `"${actor.name}" AND (profile OR interview OR "early life" OR childhood OR biography)`

      const url = new URL(GUARDIAN_API_URL)
      url.searchParams.set("api-key", apiKey)
      url.searchParams.set("q", query)
      url.searchParams.set("show-fields", "bodyText,standfirst,trailText")
      url.searchParams.set("page-size", "10")
      url.searchParams.set("order-by", "relevance")

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
            error: "Guardian API rate limit exceeded",
          }
        }
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: `Guardian API error: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as GuardianSearchResponse

      if (data.response.status !== "ok" || data.response.total === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No articles found",
        }
      }

      // Find the best biographical article
      const article = this.findBestBiographicalArticle(data.response.results)

      if (!article) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No relevant biographical articles found",
        }
      }

      // Get article body text
      const bodyText =
        article.fields?.bodyText || article.fields?.standfirst || article.fields?.trailText || ""

      if (!bodyText) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: article.webUrl,
            queryUsed: query,
          }),
          data: null,
          error: "Article has no body text",
        }
      }

      // Run through mechanical pre-clean pipeline
      const { text } = mechanicalPreClean(bodyText)

      // Check minimum content length
      if (text.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: article.webUrl,
            queryUsed: query,
            publication: "The Guardian",
            domain: "theguardian.com",
          }),
          data: null,
          error: `Guardian content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(text)

      // Build result
      const articleTitle = article.webTitle

      const sourceData: RawBiographySourceData = {
        sourceName: "The Guardian",
        sourceType: BiographySourceType.GUARDIAN_BIO,
        text,
        url: article.webUrl,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication: "The Guardian",
        articleTitle,
        domain: "theguardian.com",
        contentType: "profile",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: article.webUrl,
          queryUsed: query,
          publication: "The Guardian",
          articleTitle,
          domain: "theguardian.com",
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
   * Prefers articles with biographical keywords in the title.
   */
  private findBestBiographicalArticle(
    results: GuardianSearchResponse["response"]["results"]
  ): GuardianSearchResponse["response"]["results"][0] | null {
    if (results.length === 0) return null

    // First pass: articles with biographical keywords in title
    for (const result of results) {
      const title = result.webTitle.toLowerCase()
      if (BIO_TITLE_KEYWORDS.some((kw) => title.includes(kw))) {
        return result
      }
    }

    // Second pass: articles with biographical keywords in body/standfirst
    for (const result of results) {
      const body = (
        result.fields?.bodyText ||
        result.fields?.standfirst ||
        result.fields?.trailText ||
        ""
      ).toLowerCase()
      if (BIO_TITLE_KEYWORDS.some((kw) => body.includes(kw))) {
        return result
      }
    }

    // Fallback: first result
    return results[0]
  }
}
