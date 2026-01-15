/**
 * DuckDuckGo search source for death information.
 *
 * Uses DuckDuckGo's Instant Answer API (free, no API key required).
 * Also uses DuckDuckGo HTML search for web results.
 */

import {
  BaseDataSource,
  CIRCUMSTANCE_KEYWORDS,
  DEATH_KEYWORDS,
  NOTABLE_FACTOR_KEYWORDS,
} from "../base-source.js"
import type { ActorForEnrichment, SearchQualityScore, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"
import { decodeHtmlEntities as decodeEntities } from "../html-utils.js"

const DUCKDUCKGO_API_URL = "https://api.duckduckgo.com/"
const DUCKDUCKGO_HTML_URL = "https://html.duckduckgo.com/html/"

interface DuckDuckGoResponse {
  Abstract?: string
  AbstractText?: string
  AbstractSource?: string
  AbstractURL?: string
  Definition?: string
  DefinitionSource?: string
  DefinitionURL?: string
  Heading?: string
  Image?: string
  ImageWidth?: number
  ImageHeight?: number
  Infobox?: {
    content?: Array<{
      label?: string
      value?: string
    }>
  }
  Results?: Array<{
    FirstURL?: string
    Text?: string
  }>
  RelatedTopics?: Array<{
    FirstURL?: string
    Text?: string
    Result?: string
  }>
  Type?: string
}

/**
 * DuckDuckGo search source for death information.
 * Free and doesn't require an API key.
 */
export class DuckDuckGoSource extends BaseDataSource {
  readonly name = "DuckDuckGo"
  readonly type = DataSourceType.DUCKDUCKGO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Be polite to DuckDuckGo
  protected minDelayMs = 1000

  /**
   * Query strategies for iterative refinement.
   */
  private buildQueryStrategies(actor: ActorForEnrichment): string[] {
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
    const yearStr = deathYear ? ` ${deathYear}` : ""
    const deathDateStr = actor.deathday
      ? new Date(actor.deathday).toISOString().split("T")[0]
      : null

    const queries = [
      // Start broad
      `"${actor.name}" death cause${yearStr}`,
      // Add circumstances
      `"${actor.name}" death circumstances details${yearStr}`,
      // Try obituary-specific
      `"${actor.name}" obituary${yearStr}`,
      // Try with full name + death quoted
      `"${actor.name} death" cause manner`,
    ]

    // Add date-specific query for recent deaths
    if (deathDateStr) {
      queries.push(`"${actor.name}" died ${deathDateStr}`)
    }

    return queries
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const queries = this.buildQueryStrategies(actor)

    // Try instant answer API first
    const instantResult = await this.tryInstantAnswer(actor)
    if (instantResult.success && instantResult.data?.circumstances) {
      return instantResult
    }

    // Try iterative search queries
    for (const query of queries) {
      const result = await this.trySearchQuery(actor, query, startTime)

      // Evaluate result quality
      if (result.success && result.data) {
        const quality = this.evaluateQuality(
          result.data.circumstances || "",
          result.data.additionalContext || ""
        )

        if (quality.hasRelevantInfo && quality.confidence > 0.5) {
          // Good quality result - return it
          return {
            ...result,
            source: {
              ...result.source,
              confidence: quality.confidence,
            },
          }
        }
      }

      // Short delay between queries
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // No good results found
    return {
      success: false,
      source: this.createSourceEntry(startTime, 0, undefined, queries.join(" | ")),
      data: null,
      error: "No relevant death information found",
    }
  }

  /**
   * Try DuckDuckGo Instant Answer API for Wikipedia-style summaries.
   */
  private async tryInstantAnswer(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const query = actor.name

    try {
      console.log(`DuckDuckGo instant answer for: ${actor.name}`)

      const url = `${DUCKDUCKGO_API_URL}?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
        },
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, url),
          data: null,
          error: `HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as DuckDuckGoResponse

      // Check for death info in the abstract
      const abstract = data.AbstractText || data.Abstract || ""
      const infobox = data.Infobox?.content || []

      // Look for death-related info in infobox
      let deathInfo: string | null = null
      for (const item of infobox) {
        const label = item.label?.toLowerCase() || ""
        if (label.includes("death") || label.includes("died") || label.includes("cause")) {
          deathInfo = item.value || null
          break
        }
      }

      // Check if abstract mentions death
      if (this.containsDeathInfo(abstract) || deathInfo) {
        const circumstances = this.extractCircumstances(abstract, deathInfo)

        return {
          success: true,
          source: this.createSourceEntry(
            startTime,
            0.5,
            data.AbstractURL || undefined,
            query,
            data
          ),
          data: {
            circumstances,
            rumoredCircumstances: null,
            notableFactors: this.extractNotableFactors(abstract),
            relatedCelebrities: [],
            locationOfDeath: null,
            additionalContext: abstract,
          },
        }
      }

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, url, query),
        data: null,
        error: "No death information in instant answer",
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
   * Try a search query and extract death information from results.
   */
  private async trySearchQuery(
    actor: ActorForEnrichment,
    query: string,
    startTime: number
  ): Promise<SourceLookupResult> {
    try {
      console.log(`DuckDuckGo search: ${query}`)

      // Use HTML search endpoint
      const url = `${DUCKDUCKGO_HTML_URL}?q=${encodeURIComponent(query)}`

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
        },
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, url, query),
          data: null,
          error: `HTTP ${response.status}`,
        }
      }

      const html = await response.text()

      // Extract snippets from HTML results
      const snippets = this.extractSnippetsFromHtml(html)

      if (snippets.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, url, query),
          data: null,
          error: "No search results",
        }
      }

      // Find snippets with death info
      const relevantSnippets = snippets.filter((s) => this.containsDeathInfo(s))

      if (relevantSnippets.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, url, query),
          data: null,
          error: "No relevant death information in results",
        }
      }

      // Combine relevant snippets
      const combinedText = relevantSnippets.slice(0, 3).join(" ")
      const circumstances = this.extractCircumstances(combinedText, null)

      return {
        success: true,
        source: this.createSourceEntry(startTime, 0.4, url, query),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors: this.extractNotableFactors(combinedText),
          relatedCelebrities: [],
          locationOfDeath: null,
          additionalContext: relevantSnippets[0] || null,
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
   * Extract text snippets from DuckDuckGo HTML search results.
   */
  private extractSnippetsFromHtml(html: string): string[] {
    const snippets: string[] = []

    // Match result snippets (class="result__snippet")
    const snippetRegex = /class="result__snippet"[^>]*>([^<]+)</g
    let match
    while ((match = snippetRegex.exec(html)) !== null) {
      const snippet = this.decodeHtmlEntities(match[1].trim())
      if (snippet.length > 20) {
        snippets.push(snippet)
      }
    }

    // Also try result__a (title links that sometimes have info)
    const titleRegex = /class="result__a"[^>]*>([^<]+)</g
    while ((match = titleRegex.exec(html)) !== null) {
      const title = this.decodeHtmlEntities(match[1].trim())
      if (title.length > 10 && this.containsDeathInfo(title)) {
        snippets.push(title)
      }
    }

    return snippets
  }

  /**
   * Check if text contains death-related information.
   */
  private containsDeathInfo(text: string): boolean {
    const lower = text.toLowerCase()
    return DEATH_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
  }

  /**
   * Extract circumstances from text.
   */
  private extractCircumstances(text: string, infoboxDeathInfo: string | null): string | null {
    const sources: string[] = []

    if (infoboxDeathInfo) {
      sources.push(infoboxDeathInfo)
    }

    // Extract sentences mentioning death
    const sentences = text.split(/[.!?]+/).map((s) => s.trim())
    const deathSentences = sentences.filter((s) => this.containsDeathInfo(s))

    if (deathSentences.length > 0) {
      sources.push(...deathSentences.slice(0, 2))
    }

    if (sources.length === 0) {
      return null
    }

    // Clean and combine
    return sources
      .map((s) => s.trim())
      .filter((s) => s.length > 10)
      .slice(0, 2)
      .join(". ")
      .replace(/\s+/g, " ")
      .trim()
  }

  /**
   * Extract notable factors from text.
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []
    const lower = text.toLowerCase()

    for (const keyword of NOTABLE_FACTOR_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        factors.push(keyword)
      }
    }

    return [...new Set(factors)] // Deduplicate
  }

  /**
   * Evaluate quality of search results.
   */
  private evaluateQuality(circumstances: string, context: string): SearchQualityScore {
    const combinedText = `${circumstances} ${context}`.toLowerCase()

    const deathKeywordsFound = DEATH_KEYWORDS.filter((kw) =>
      combinedText.includes(kw.toLowerCase())
    )

    const circumstanceKeywordsFound = CIRCUMSTANCE_KEYWORDS.filter((kw) =>
      combinedText.includes(kw.toLowerCase())
    )

    const hasRelevantInfo = deathKeywordsFound.length > 0

    // Calculate confidence
    let confidence = 0
    if (deathKeywordsFound.length > 0) {
      confidence += Math.min(0.4, deathKeywordsFound.length * 0.15)
    }
    if (circumstanceKeywordsFound.length > 0) {
      confidence += Math.min(0.4, circumstanceKeywordsFound.length * 0.1)
    }
    if (circumstances.length > 50) {
      confidence += 0.2
    }

    return {
      hasRelevantInfo,
      confidence: Math.min(1.0, confidence),
      deathKeywordsFound,
      circumstanceKeywordsFound,
    }
  }

  /**
   * Decode HTML entities in text.
   */
  private decodeHtmlEntities(text: string): string {
    return decodeEntities(text)
  }
}
