/**
 * Google News RSS source for death information.
 *
 * Uses the publicly available Google News RSS feed to find obituaries
 * and death-related articles. No API key required.
 *
 * The RSS feed provides article titles, links, and brief descriptions.
 * Relevant articles are then fetched to extract detailed death information.
 *
 * Free to use but subject to rate limiting if requests are too frequent.
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"
import {
  extractLocation,
  extractNotableFactors,
  extractDeathSentences,
} from "./news-utils.js"

/**
 * Parsed RSS feed item.
 */
interface RSSItem {
  title: string
  link: string
  description: string
  pubDate: string
}

/**
 * Google News RSS source for actor death information.
 * Searches Google News RSS feeds for obituaries and death articles.
 */
export class GoogleNewsRSSSource extends BaseDataSource {
  readonly name = "Google News RSS"
  readonly type = DataSourceType.GOOGLE_NEWS_RSS
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limiting for Google
  protected minDelayMs = 1500

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
      const deathYear = new Date(actor.deathday).getFullYear()

      // Construct Google News RSS feed URL
      const searchTerms = `"${actor.name}" obituary OR died OR death ${deathYear}`
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchTerms)}&hl=en-US&gl=US&ceid=US:en`

      // Fetch RSS feed
      const rssResponse = await fetch(rssUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (rssResponse.status === 403) {
        throw new SourceAccessBlockedError(
          "Google News RSS blocked access (403)",
          this.type,
          rssUrl,
          403
        )
      }

      if (!rssResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, rssUrl),
          data: null,
          error: `RSS feed fetch failed: HTTP ${rssResponse.status}`,
        }
      }

      const xml = await rssResponse.text()

      // Parse RSS items
      const items = this.parseRSSItems(xml)

      if (items.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, rssUrl),
          data: null,
          error: "No items found in RSS feed",
        }
      }

      // Filter for relevant items
      const relevantItems = items.filter((item) => this.isRelevantItem(item, actor))

      if (relevantItems.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, rssUrl),
          data: null,
          error: "No relevant death articles found in RSS feed",
        }
      }

      // Follow the top article link to get detailed information
      const topItem = relevantItems[0]
      await this.waitForRateLimit()

      const articleResponse = await fetch(topItem.link, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: this.createTimeoutSignal(),
      })

      if (articleResponse.status === 403) {
        throw new SourceAccessBlockedError(
          "Article blocked access (403)",
          this.type,
          topItem.link,
          403
        )
      }

      if (!articleResponse.ok) {
        // Fall back to RSS snippet data if article can't be fetched
        return this.buildResultFromSnippets(startTime, relevantItems, actor, rssUrl)
      }

      const articleHtml = await articleResponse.text()
      const articleText = htmlToText(articleHtml)

      // Extract death sentences from article
      const deathSentences = extractDeathSentences(articleText, actor, 4)

      if (deathSentences.length === 0) {
        // Fall back to RSS snippet data
        return this.buildResultFromSnippets(startTime, relevantItems, actor, rssUrl)
      }

      const circumstances = deathSentences.join(". ")
      const locationOfDeath = extractLocation(articleText)
      const notableFactors = extractNotableFactors(articleText)

      // Calculate confidence
      let confidence = 0.4 // Base confidence for Google News RSS
      if (circumstances.length > 100) confidence += 0.1
      if (locationOfDeath) confidence += 0.1
      if (notableFactors.length > 0) confidence += 0.1
      if (relevantItems.length >= 3) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, Math.min(confidence, 0.8), topItem.link),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors,
          relatedCelebrities: [],
          locationOfDeath,
          additionalContext: `Source: Google News RSS (${relevantItems.length} relevant articles found)`,
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
   * Parse RSS XML to extract items.
   * Uses regex-based parsing to avoid external XML dependencies.
   */
  private parseRSSItems(xml: string): RSSItem[] {
    const items: RSSItem[] = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi
    let match
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1]
      const title = this.extractTag(itemXml, "title")
      const link = this.extractTag(itemXml, "link")
      const description = this.extractTag(itemXml, "description")
      const pubDate = this.extractTag(itemXml, "pubDate")
      if (title && link) {
        items.push({
          title,
          link,
          description: description || "",
          pubDate: pubDate || "",
        })
      }
    }
    return items
  }

  /**
   * Extract content from an XML tag, handling CDATA sections.
   */
  private extractTag(xml: string, tag: string): string | null {
    const safeTag = tag.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&")
    // eslint-disable-next-line security/detect-non-literal-regexp -- tag is always a hardcoded string literal from internal callers
    const regex = new RegExp(
      `<${safeTag}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</${safeTag}>`,
      "i"
    )
    const match = xml.match(regex)
    return match ? match[1].trim() : null
  }

  /**
   * Check if an RSS item is relevant to the actor's death.
   */
  private isRelevantItem(item: RSSItem, actor: ActorForEnrichment): boolean {
    const text = `${item.title} ${item.description}`.toLowerCase()
    const lastName = actor.name.split(" ").pop()?.toLowerCase() || ""
    const hasName = text.includes(actor.name.toLowerCase()) || text.includes(lastName)
    const deathKeywords = ["died", "dead", "death", "obituary", "passes away", "passed away"]
    const hasDeath = deathKeywords.some((kw) => text.includes(kw))
    return hasName && hasDeath
  }

  /**
   * Build a result from RSS snippet data when article fetch fails.
   */
  private buildResultFromSnippets(
    startTime: number,
    items: RSSItem[],
    actor: ActorForEnrichment,
    rssUrl: string
  ): SourceLookupResult {
    // Combine snippet text from relevant items
    const snippetText = items
      .slice(0, 3)
      .map((item) => `${item.title}. ${item.description}`)
      .join(" ")

    const cleanText = htmlToText(snippetText)
    const deathSentences = extractDeathSentences(cleanText, actor, 3)

    if (deathSentences.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, rssUrl),
        data: null,
        error: "No death information found in articles",
      }
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, 0.3, rssUrl),
      data: {
        circumstances: deathSentences.join(". "),
        rumoredCircumstances: null,
        notableFactors: extractNotableFactors(cleanText),
        relatedCelebrities: [],
        locationOfDeath: extractLocation(cleanText),
        additionalContext: "Source: Google News RSS (from snippets only)",
      },
    }
  }
}
