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
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

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

      const hits = data.response.meta?.hits ?? data.response.metadata?.hits ?? 0
      if (data.status !== "OK" || hits === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No articles found",
        }
      }

      console.log(`  Found ${data.response.docs.length} articles`)

      // Find the most relevant death-related article
      const article = this.findBestArticle(data.response.docs, actor)

      if (!article) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No relevant death articles found",
        }
      }

      // Extract death info from the article
      const text =
        article.lead_paragraph || article.snippet || article.abstract || article.headline.main
      const circumstances = this.extractCircumstances(text, actor.name)
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
        success: true,
        source: this.createSourceEntry(startTime, Math.min(0.9, confidence), article.web_url),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors,
          relatedCelebrities: [],
          locationOfDeath,
          additionalContext: article.abstract || article.snippet || null,
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
   * Find the most relevant article from search results.
   */
  private findBestArticle(docs: NYTSearchResponse["response"]["docs"], actor: ActorForEnrichment) {
    // Prioritize obituaries
    const obituaries = docs.filter(
      (d) => d.type_of_material?.toLowerCase().includes("obituary") || d.news_desk === "Obituaries"
    )

    if (obituaries.length > 0) {
      // Find one with actor name in headline
      for (const obit of obituaries) {
        if (obit.headline.main.toLowerCase().includes(actor.name.split(" ")[0].toLowerCase())) {
          return obit
        }
      }
      return obituaries[0]
    }

    // Fall back to any article mentioning death
    for (const doc of docs) {
      const title = doc.headline.main.toLowerCase()
      const hasName = title.includes(actor.name.split(" ")[0].toLowerCase())
      const hasDeath = DEATH_KEYWORDS.some((kw) => title.includes(kw.toLowerCase()))

      if (hasName && hasDeath) {
        return doc
      }
    }

    // Return first result if relevant
    if (docs[0]?.headline.main.toLowerCase().includes(actor.name.split(" ")[0].toLowerCase())) {
      return docs[0]
    }

    return null
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
