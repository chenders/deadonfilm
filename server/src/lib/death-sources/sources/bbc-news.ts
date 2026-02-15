/**
 * BBC News source for actor death information.
 *
 * BBC News is one of the world's most respected and widely read news
 * organizations. Their online coverage of notable deaths includes
 * comprehensive obituaries and breaking news reports. Their coverage
 * often includes:
 * - Detailed obituaries with career histories
 * - Cause of death information
 * - Tributes from colleagues and public figures
 * - International perspective on deaths
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
} from "./news-utils.js"

const _BBC_NEWS_BASE_URL = "https://www.bbc.co.uk/news"

/**
 * BBC News source for actor death information.
 */
export class BBCNewsSource extends BaseDataSource {
  readonly name = "BBC News"
  readonly type = DataSourceType.BBC_NEWS
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

    // BBC News online archives don't reliably cover deaths before 1997
    if (deathYear < 1997) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "BBC News online archives don't cover deaths before 1997",
      }
    }

    try {
      // Search for obituary using DuckDuckGo HTML (more scraping-friendly)
      const searchQuery = `(site:bbc.co.uk OR site:bbc.com) "${actor.name}" (obituary OR dies OR dead OR death) ${deathYear}`
      const ddgSearchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`

      const searchResponse = await fetch(ddgSearchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (searchResponse.status === 403) {
        throw new SourceAccessBlockedError(`Search blocked (403)`, this.type, ddgSearchUrl, 403)
      }

      if (!searchResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, ddgSearchUrl),
          data: null,
          error: `Search failed: HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()

      // Find BBC News article URLs in search results
      const articleUrl = this.extractArticleUrl(searchHtml, actor)

      if (!articleUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, ddgSearchUrl),
          data: null,
          error: "No BBC News obituary found in search results",
        }
      }

      // Fetch the BBC News article
      await this.waitForRateLimit()
      const articleData = await this.fetchArticle(articleUrl, actor)

      if (!articleData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, articleUrl),
          data: null,
          error: "Could not fetch BBC News article",
        }
      }

      if (!articleData.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.2, articleUrl),
          data: null,
          error: "No death information found in BBC News article",
        }
      }

      // Calculate confidence
      let confidence = 0.5 // Base confidence for BBC News (highly authoritative)
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
          additionalContext: "Source: BBC News (international news)",
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
   * Extract BBC News URL from search results.
   */
  private extractArticleUrl(html: string, actor: ActorForEnrichment): string | null {
    const urlPattern = /https?:\/\/(?:www\.)?bbc\.(?:co\.uk|com)\/news\/[^"'\s<>]+/gi
    return extractUrlFromSearchResults(html, urlPattern, actor)
  }

  /**
   * Fetch and parse a BBC News article.
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
      console.log(`  BBC News blocked (403), trying archive.org fallback...`)
      const archiveResult = await fetchFromArchive(url)
      if (archiveResult.success && archiveResult.content) {
        console.log(`  Archive.org fallback succeeded for BBC News`)
        return this.parseArticle(archiveResult.content, actor)
      }
      throw new SourceAccessBlockedError(`BBC News blocked access (403)`, this.type, url, 403)
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
