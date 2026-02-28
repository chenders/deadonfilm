/**
 * Reuters source for death/obituary news.
 *
 * Searches for Reuters articles via DDG/Google CSE (with site:reuters.com),
 * then fetches and parses the article for death information.
 * Falls back to archive.org if Reuters blocks direct access (401/403).
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
 * Reuters source for actor death and obituary news.
 * Reuters is one of the world's largest wire services with extensive
 * breaking news coverage including notable deaths and obituaries.
 */
export class ReutersSource extends BaseDataSource {
  readonly name = "Reuters"
  readonly type = DataSourceType.REUTERS
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
      const searchQuery = `site:reuters.com "${actor.name}" obituary OR died OR death ${deathYear}`
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

      // Find Reuters article URLs in search results
      const articleUrl = this.extractReutersUrl(searchHtml, actor)

      if (!articleUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No Reuters obituary found in search results",
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
          error: "Could not fetch Reuters article",
        }
      }

      if (!articleData.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, articleUrl),
          data: null,
          error: "No death information found in Reuters article",
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
   * Extract Reuters URL from search results.
   * Reuters articles use paths like /world/..., /business/..., /lifestyle/...
   */
  private extractReutersUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?reuters\.com\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }

  /**
   * Fetch and parse a Reuters article.
   * Falls back to archive.org if Reuters blocks direct access.
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
      // Reuters often blocks direct access — try archive.org fallback
      console.log(`  Reuters blocked (${response.status}), trying archive.org fallback...`)
      const archiveResult = await fetchFromArchive(url)
      if (archiveResult.success && archiveResult.content) {
        console.log(`  Archive.org fallback succeeded for Reuters`)
        return this.parseArticle(archiveResult.content, actor)
      }
      throw new SourceAccessBlockedError(
        `Reuters blocked access (${response.status})`,
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
