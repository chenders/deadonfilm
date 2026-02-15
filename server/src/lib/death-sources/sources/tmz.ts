/**
 * TMZ source for entertainment industry death information.
 *
 * TMZ is a major entertainment news outlet founded in 2005, known for
 * breaking celebrity news stories quickly. They are often among the first
 * to report celebrity deaths and frequently include:
 * - Breaking death announcements
 * - Cause of death details
 * - Law enforcement and medical examiner updates
 * - Family statements
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

const _TMZ_BASE_URL = "https://www.tmz.com"

/**
 * TMZ source for actor death information.
 */
export class TMZSource extends BaseDataSource {
  readonly name = "TMZ"
  readonly type = DataSourceType.TMZ
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

    // TMZ was founded in November 2005 — no articles exist for earlier deaths
    if (deathYear < 2005) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "TMZ was not founded until 2005",
      }
    }

    try {
      // Search for article using shared web search (DDG with Google CSE fallback)
      const searchQuery = `site:tmz.com "${actor.name}" dead OR dies OR death ${deathYear}`
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

      // Find TMZ article URLs in search results
      const articleUrl = this.extractArticleUrl(searchHtml, actor)

      if (!articleUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No TMZ article found in search results",
        }
      }

      // Fetch the TMZ article
      await this.waitForRateLimit()
      const articleData = await this.fetchArticle(articleUrl, actor)

      if (!articleData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, articleUrl),
          data: null,
          error: "Could not fetch TMZ article",
        }
      }

      if (!articleData.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, articleUrl),
          data: null,
          error: "No death information found in TMZ article",
        }
      }

      // Calculate confidence
      let confidence = 0.5 // Base confidence for TMZ (fast but sometimes preliminary)
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
          additionalContext: "Source: TMZ (entertainment news)",
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
   * Extract TMZ URL from search results.
   */
  private extractArticleUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?tmz\.com\/\d{4}\/\d{2}\/\d{2}\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }

  /**
   * Fetch and parse a TMZ article.
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
      console.log(`  TMZ blocked (403), trying archive.org fallback...`)
      const archiveResult = await fetchFromArchive(url)
      if (archiveResult.success && archiveResult.content) {
        console.log(`  Archive.org fallback succeeded for TMZ`)
        return this.parseArticle(archiveResult.content, actor)
      }
      throw new SourceAccessBlockedError(`TMZ blocked access (403)`, this.type, url, 403)
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
