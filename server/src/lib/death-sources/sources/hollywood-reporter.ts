/**
 * Hollywood Reporter source for entertainment industry death information.
 *
 * The Hollywood Reporter is one of the premier entertainment industry
 * trade publications, covering film, TV, and entertainment news since 1930.
 * They publish detailed obituaries for actors and other entertainment
 * professionals. Their coverage often includes:
 * - Breaking news of deaths
 * - Cause of death (when publicly known)
 * - Career retrospectives
 * - Industry tributes and reactions
 *
 * Free to access via web scraping (no API key required).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"
import { fetchFromArchive } from "../archive-fallback.js"
import {
  extractLocation,
  extractNotableFactors,
  extractDeathSentences,
  extractUrlFromSearchResults,
  searchWeb,
} from "./news-utils.js"

const _HOLLYWOOD_REPORTER_BASE_URL = "https://www.hollywoodreporter.com"

/**
 * Hollywood Reporter source for actor death information.
 */
export class HollywoodReporterSource extends BaseDataSource {
  readonly name = "Hollywood Reporter"
  readonly type = DataSourceType.HOLLYWOOD_REPORTER
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limiting
  protected minDelayMs = 2000

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

    const deathYear = new Date(actor.deathday).getFullYear()

    // Hollywood Reporter online archives don't reliably cover deaths before 2000
    if (deathYear < 2000) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Hollywood Reporter online archives don't cover deaths before 2000",
      }
    }

    try {
      // Search for obituary using shared web search (DDG with Google CSE fallback)
      const searchQuery = `site:hollywoodreporter.com "${actor.name}" obituary OR dies OR dead OR death ${deathYear}`
      const { html: searchHtml, error: searchError } = await searchWeb(searchQuery, {
        userAgent: this.userAgent,
        signal: this.createTimeoutSignal(),
      })

      if (searchError || !searchHtml) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: searchError || "Search returned no results",
        }
      }

      // Find Hollywood Reporter article URLs in search results
      const articleUrl = this.extractArticleUrl(searchHtml, actor)

      if (!articleUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No Hollywood Reporter obituary found in search results",
        }
      }

      // Fetch the Hollywood Reporter article
      await this.waitForRateLimit()
      const articleData = await this.fetchArticle(articleUrl, actor)

      if (!articleData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, articleUrl),
          data: null,
          error: "Could not fetch Hollywood Reporter article",
        }
      }

      if (!articleData.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, articleUrl),
          data: null,
          error: "No death information found in Hollywood Reporter article",
        }
      }

      // Calculate confidence
      let confidence = 0.5 // Base confidence for Hollywood Reporter (authoritative source)
      if (articleData.circumstances.length > 100) confidence += 0.1
      if (articleData.locationOfDeath) confidence += 0.1
      if (articleData.notableFactors.length > 0) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, Math.min(confidence, 0.85), articleUrl),
        data: {
          circumstances: articleData.circumstances,
          rumoredCircumstances: null,
          notableFactors: articleData.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: articleData.locationOfDeath,
          additionalContext: "Source: The Hollywood Reporter (entertainment industry news)",
        },
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Extract Hollywood Reporter URL from search results.
   */
  private extractArticleUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?hollywoodreporter\.com\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }

  /**
   * Fetch and parse a Hollywood Reporter article.
   */
  private async fetchArticle(url: string, actor: ActorForEnrichment): Promise<ArticleData | null> {
    const response = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: this.createTimeoutSignal(),
    })

    if (response.status === 403) {
      // Try archive.org fallback before giving up
      console.log(`  Hollywood Reporter blocked (403), trying archive.org fallback...`)
      const archiveResult = await fetchFromArchive(url)
      if (archiveResult.success && archiveResult.content) {
        console.log(`  Archive.org fallback succeeded for Hollywood Reporter`)
        return this.parseArticle(archiveResult.content, actor)
      }
      throw new SourceAccessBlockedError(
        `Hollywood Reporter blocked access (403)`,
        this.type,
        url,
        403
      )
    }

    if (!response.ok) {
      return null
    }

    const html = await response.text()
    return this.parseArticle(html, actor)
  }

  /**
   * Parse article HTML for death information.
   */
  private parseArticle(html: string, actor: ActorForEnrichment): ArticleData {
    const text = htmlToText(html)

    // Extract death-related sentences using shared utility
    const deathSentences = extractDeathSentences(text, actor, 4)

    return {
      circumstances: deathSentences.length > 0 ? deathSentences.join(". ") : null,
      locationOfDeath: extractLocation(text),
      notableFactors: extractNotableFactors(text),
    }
  }
}

interface ArticleData {
  circumstances: string | null
  locationOfDeath: string | null
  notableFactors: string[]
}
