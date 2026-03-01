/**
 * Washington Post source for death/obituary news.
 *
 * Searches for Washington Post articles via DDG/Google CSE (with site:washingtonpost.com),
 * then fetches and parses the article for death information.
 * Falls back to archive.org if WaPo blocks direct access (401/403).
 *
 * Free to use (web scraping).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"
import { fetchFromArchive } from "../archive-fallback.js"
import {
  extractLocation,
  extractNotableFactors,
  extractDeathSentences,
  extractUrlFromSearchResults,
  searchWeb,
} from "./news-utils.js"

/**
 * Washington Post source for actor death and obituary news.
 * The Washington Post is a major American newspaper with extensive
 * obituary coverage, particularly for notable figures in politics,
 * entertainment, and culture.
 */
export class WashingtonPostSource extends BaseDataSource {
  readonly name = "Washington Post"
  readonly type = DataSourceType.WASHINGTON_POST
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  // Respectful rate limit
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

    try {
      // Search for obituary using shared web search (DDG with Google CSE fallback)
      const deathYear = new Date(actor.deathday).getFullYear()
      const searchQuery = `site:washingtonpost.com "${actor.name}" obituary OR died OR death ${deathYear}`
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

      // Find Washington Post article URLs in search results
      const articleUrl = this.extractWaPoUrl(searchHtml, actor)

      if (!articleUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No Washington Post obituary found in search results",
        }
      }

      // Fetch the article
      await this.waitForRateLimit()
      const articleData = await this.fetchArticle(articleUrl, actor)

      if (!articleData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, articleUrl),
          data: null,
          error: "Could not fetch Washington Post article",
        }
      }

      if (!articleData.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, articleUrl),
          data: null,
          error: "No death information found in Washington Post article",
        }
      }

      // Calculate confidence
      let confidence = 0.5
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
          additionalContext: null,
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
   * Extract Washington Post URL from search results.
   * WaPo articles use paths like /obituaries/..., /entertainment/..., /nation/...
   */
  private extractWaPoUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?washingtonpost\.com\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }

  /**
   * Fetch and parse a Washington Post article.
   * Falls back to archive.org if WaPo blocks direct access.
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

    if (response.status === 403 || response.status === 401) {
      // WaPo often blocks direct access — try archive.org fallback
      console.log(`  Washington Post blocked (${response.status}), trying archive.org fallback...`)
      const archiveResult = await fetchFromArchive(url)
      if (archiveResult.success && archiveResult.content) {
        console.log(`  Archive.org fallback succeeded for Washington Post`)
        return this.parseArticle(archiveResult.content, actor)
      }
      throw new SourceAccessBlockedError(
        `Washington Post blocked access (${response.status})`,
        this.type,
        url,
        response.status
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
