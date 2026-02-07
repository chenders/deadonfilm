/**
 * AP News source for death/obituary news.
 *
 * Searches AP News for death and obituary articles about actors.
 * Uses web scraping as AP doesn't have a free public API.
 *
 * Free to use (web scraping).
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const AP_SEARCH_URL = "https://apnews.com/search"

/**
 * AP News source for death and obituary news.
 * The Associated Press has excellent breaking news coverage for celebrity deaths.
 */
export class APNewsSource extends BaseDataSource {
  readonly name = "AP News"
  readonly type = DataSourceType.AP_NEWS
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limit
  protected minDelayMs = 2000

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      console.log(`AP News search for: ${actor.name}`)

      // Build search query — include death year when available to help surface era-appropriate results
      const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
      const yearSuffix = deathYear ? ` ${deathYear}` : ""
      const query = `${actor.name} died OR death OR obituary${yearSuffix}`
      const searchUrl = `${AP_SEARCH_URL}?q=${encodeURIComponent(query)}`

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (response.status === 403 || response.status === 429) {
        throw new SourceAccessBlockedError(
          `AP News returned ${response.status}`,
          this.type,
          searchUrl,
          response.status
        )
      }

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: `HTTP ${response.status}`,
        }
      }

      const html = await response.text()

      // Find search results
      const articles = this.parseSearchResults(html, actor)

      if (articles.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No relevant death articles found",
        }
      }

      console.log(`  Found ${articles.length} potential articles`)

      // Fetch the most relevant article
      const bestArticle = articles[0]
      const articleData = await this.fetchArticle(bestArticle.url)

      if (!articleData) {
        // Fall back to search result snippets
        return {
          success: true,
          source: this.createSourceEntry(startTime, 0.4, bestArticle.url),
          data: {
            circumstances: bestArticle.snippet,
            rumoredCircumstances: null,
            notableFactors: this.extractNotableFactors(bestArticle.snippet),
            relatedCelebrities: [],
            locationOfDeath: null,
            additionalContext: null,
          },
        }
      }

      const circumstances = this.extractCircumstances(articleData.text, actor.name)
      const locationOfDeath = this.extractLocation(articleData.text)
      const notableFactors = this.extractNotableFactors(articleData.text)

      // Calculate confidence
      let confidence = 0.5
      if (circumstances) confidence += 0.2
      if (locationOfDeath) confidence += 0.1
      if (articleData.text.length > 500) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, bestArticle.url),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors,
          relatedCelebrities: [],
          locationOfDeath,
          additionalContext: articleData.summary || null,
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
   * Parse search results from AP News HTML.
   */
  private parseSearchResults(
    html: string,
    actor: ActorForEnrichment
  ): Array<{ url: string; title: string; snippet: string }> {
    const results: Array<{ url: string; title: string; snippet: string }> = []

    // AP News search results pattern - look for article cards
    // Pattern: <a href="/article/..." ...><h3>Title</h3>...</a>
    const articlePattern =
      /<a[^>]*href="(\/article\/[^"]+)"[^>]*>[\s\S]*?<h[23][^>]*>([^<]+)<\/h[23]>[\s\S]*?<p[^>]*>([^<]+)<\/p>/gi

    let match
    while ((match = articlePattern.exec(html)) !== null) {
      const url = `https://apnews.com${match[1]}`
      const title = htmlToText(match[2]).trim()
      const snippet = htmlToText(match[3]).trim()

      // Check if article is relevant
      const combinedText = `${title} ${snippet}`.toLowerCase()
      const hasName =
        combinedText.includes(actor.name.toLowerCase()) ||
        combinedText.includes(actor.name.split(" ")[0].toLowerCase())
      const hasDeath = DEATH_KEYWORDS.some((kw) => combinedText.includes(kw.toLowerCase()))

      if (hasName && hasDeath) {
        results.push({ url, title, snippet })
      }
    }

    // Also try alternative pattern for newer AP layout
    const altPattern =
      /<article[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?(?:<h[23][^>]*>([^<]+)<\/h[23]>|class="[^"]*title[^"]*"[^>]*>([^<]+)<)/gi

    while ((match = altPattern.exec(html)) !== null) {
      const url = match[1].startsWith("http") ? match[1] : `https://apnews.com${match[1]}`
      const title = htmlToText(match[2] || match[3] || "").trim()

      if (!title || results.some((r) => r.url === url)) continue

      const hasName =
        title.toLowerCase().includes(actor.name.toLowerCase()) ||
        title.toLowerCase().includes(actor.name.split(" ")[0].toLowerCase())
      const hasDeath = DEATH_KEYWORDS.some((kw) => title.toLowerCase().includes(kw.toLowerCase()))

      if (hasName && hasDeath) {
        results.push({ url, title, snippet: "" })
      }
    }

    return results.slice(0, 5)
  }

  /**
   * Fetch and parse an individual article.
   */
  private async fetchArticle(
    url: string
  ): Promise<{ text: string; summary: string | null } | null> {
    try {
      await this.waitForRateLimit()

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (!response.ok) {
        return null
      }

      const html = await response.text()

      // Extract article body
      const articleBody = this.extractArticleBody(html)
      const summary = this.extractSummary(html)

      if (!articleBody || articleBody.length < 100) {
        return null
      }

      return {
        text: articleBody,
        summary,
      }
    } catch {
      return null
    }
  }

  /**
   * Extract article body from HTML.
   */
  private extractArticleBody(html: string): string | null {
    // Try various article content patterns
    const patterns = [
      /<div[^>]*class="[^"]*RichTextStoryBody[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*story-body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        const text = htmlToText(match[1])
        if (text.length > 100) {
          return text.substring(0, 5000) // Limit text length
        }
      }
    }

    return null
  }

  /**
   * Extract summary/lead from HTML.
   */
  private extractSummary(html: string): string | null {
    const patterns = [
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/i,
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        return htmlToText(match[1]).trim()
      }
    }

    return null
  }

  /**
   * Extract death circumstances from text.
   */
  private extractCircumstances(text: string, actorName: string): string | null {
    if (!text || text.length < 50) return null

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
