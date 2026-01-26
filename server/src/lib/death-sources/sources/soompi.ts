/**
 * Soompi source for Korean actor/celebrity death information.
 *
 * Soompi is a leading English-language K-pop and K-drama news site.
 * It provides fast, reliable reporting on Korean entertainment news,
 * including celebrity deaths with detailed circumstances.
 *
 * Strategy:
 * 1. Search Soompi for actor name + death
 * 2. Find relevant articles about the actor's death
 * 3. Extract death circumstances from article content
 */

import { BaseDataSource, DEATH_KEYWORDS, LOW_PRIORITY_TIMEOUT_MS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const SOOMPI_BASE_URL = "https://www.soompi.com"
const SOOMPI_SEARCH_URL = `${SOOMPI_BASE_URL}/search?q=`

/**
 * Soompi source for Korean celebrity information.
 */
export class SoompiSource extends BaseDataSource {
  readonly name = "Soompi"
  readonly type = DataSourceType.SOOMPI
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Be polite to Soompi
  protected minDelayMs = 2000

  // Low priority source - use shorter timeout
  protected requestTimeoutMs = LOW_PRIORITY_TIMEOUT_MS

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    if (!actor.deathday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Actor is not deceased",
      }
    }

    try {
      // Step 1: Search for death-related articles
      const searchQuery = `${actor.name} death`
      const searchUrl = `${SOOMPI_SEARCH_URL}${encodeURIComponent(searchQuery)}`

      const searchResponse = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (searchResponse.status === 403) {
        throw new SourceAccessBlockedError(`Soompi blocked access (403)`, this.type, searchUrl, 403)
      }

      if (!searchResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: `Search failed: HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()

      // Step 2: Find relevant article URLs
      const articleUrl = this.findRelevantArticle(searchHtml, actor)

      if (!articleUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No relevant death article found on Soompi",
        }
      }

      // Step 3: Fetch the article
      await this.waitForRateLimit()

      const fullArticleUrl = articleUrl.startsWith("http")
        ? articleUrl
        : `${SOOMPI_BASE_URL}${articleUrl}`

      const articleResponse = await fetch(fullArticleUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (articleResponse.status === 403) {
        throw new SourceAccessBlockedError(
          `Soompi blocked access (403)`,
          this.type,
          fullArticleUrl,
          403
        )
      }

      if (!articleResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, fullArticleUrl),
          data: null,
          error: `Article fetch failed: HTTP ${articleResponse.status}`,
        }
      }

      const articleHtml = await articleResponse.text()

      // Step 4: Extract death information
      const deathInfo = this.extractDeathInfo(articleHtml, actor)

      if (!deathInfo) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, fullArticleUrl),
          data: null,
          error: "Could not extract death information from article",
        }
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, deathInfo.confidence, fullArticleUrl),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: deathInfo.rumoredCircumstances,
          notableFactors: deathInfo.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathInfo.locationOfDeath,
          additionalContext: deathInfo.additionalContext,
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
   * Find relevant death article from search results.
   */
  private findRelevantArticle(html: string, actor: ActorForEnrichment): string | null {
    // Soompi article links typically contain the slug
    const articlePattern =
      /href="((?:https:\/\/www\.soompi\.com)?\/[0-9]+\/[^"]+(?:death|passes-away|passed-away|dies|deceased|rip)[^"]*)"/gi

    const matches: string[] = []
    let match

    while ((match = articlePattern.exec(html)) !== null) {
      matches.push(match[1])
    }

    // Also try to find any article that might be about the actor's death
    const generalPattern = /href="((?:https:\/\/www\.soompi\.com)?\/[0-9]+\/[^"]+)"/gi

    while ((match = generalPattern.exec(html)) !== null) {
      const url = match[1]
      // Check if the URL context mentions the actor and death
      const urlIndex = html.indexOf(match[0])
      const context = html.substring(Math.max(0, urlIndex - 300), urlIndex + 300).toLowerCase()

      const actorNameLower = actor.name.toLowerCase()
      const hasActorName =
        context.includes(actorNameLower) ||
        context.includes(actorNameLower.split(" ").reverse().join(" ")) // Korean name order

      const hasDeathWord = DEATH_KEYWORDS.some((keyword) => context.includes(keyword.toLowerCase()))

      if (hasActorName && hasDeathWord && !matches.includes(url)) {
        matches.push(url)
      }
    }

    if (matches.length === 0) {
      return null
    }

    // Return the first (most relevant) match
    return matches[0]
  }

  /**
   * Extract death information from article HTML.
   */
  private extractDeathInfo(
    html: string,
    actor: ActorForEnrichment
  ): {
    circumstances: string | null
    rumoredCircumstances: string | null
    notableFactors: string[]
    locationOfDeath: string | null
    additionalContext: string | null
    confidence: number
  } | null {
    // Try to find the article content
    const articleMatch =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<div[^>]*class="[^"]*article[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)

    const contentHtml = articleMatch ? articleMatch[1] : html
    const text = htmlToText(contentHtml)

    // Verify this is about the correct person
    if (!this.verifyActorMatch(text, actor)) {
      return null
    }

    // Check for death-related content
    const hasDeathMention = DEATH_KEYWORDS.some((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase())
    )

    if (!hasDeathMention) {
      return null
    }

    // Extract paragraphs
    const paragraphs = text.split(/\n\n+/).filter((p: string) => p.trim().length > 20)

    // Find death-related paragraphs
    const deathParagraphs: string[] = []
    const rumoredParagraphs: string[] = []

    for (const para of paragraphs) {
      const lowerPara = para.toLowerCase()

      if (DEATH_KEYWORDS.some((keyword) => lowerPara.includes(keyword.toLowerCase()))) {
        // Check if this is rumored/alleged/unconfirmed
        if (
          lowerPara.includes("rumor") ||
          lowerPara.includes("alleged") ||
          lowerPara.includes("unconfirmed") ||
          lowerPara.includes("speculation") ||
          lowerPara.includes("reportedly")
        ) {
          rumoredParagraphs.push(para.trim())
        } else {
          deathParagraphs.push(para.trim())
        }
      }
    }

    if (deathParagraphs.length === 0 && rumoredParagraphs.length === 0) {
      return null
    }

    // Extract notable factors
    const allText = [...deathParagraphs, ...rumoredParagraphs].join(" ")
    const notableFactors = this.extractNotableFactors(allText)

    // Try to extract location
    const locationOfDeath = this.extractLocation(allText)

    // Build circumstances
    const circumstances = deathParagraphs.slice(0, 3).join(" ")
    const rumoredCircumstances =
      rumoredParagraphs.length > 0 ? rumoredParagraphs.slice(0, 2).join(" ") : null

    // Calculate confidence
    let confidence = 0.5 // Base for finding relevant article
    if (deathParagraphs.length > 1) confidence += 0.1
    if (notableFactors.length > 0) confidence += 0.1
    if (locationOfDeath) confidence += 0.05
    if (this.hasSpecificCause(allText)) confidence += 0.1

    return {
      circumstances: circumstances || null,
      rumoredCircumstances,
      notableFactors,
      locationOfDeath,
      additionalContext: `Source: Soompi (Korean entertainment news)`,
      confidence: Math.min(confidence, 0.85),
    }
  }

  /**
   * Extract notable factors from article text.
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []
    const lowerText = text.toLowerCase()

    if (lowerText.includes("accident") || lowerText.includes("accidental")) {
      factors.push("accidental death")
    }
    if (
      lowerText.includes("suicide") ||
      lowerText.includes("took") ||
      lowerText.includes("own life")
    ) {
      factors.push("self-inflicted")
    }
    if (
      lowerText.includes("murder") ||
      lowerText.includes("killed") ||
      lowerText.includes("homicide")
    ) {
      factors.push("homicide")
    }
    if (lowerText.includes("cancer")) {
      factors.push("illness - cancer")
    }
    if (
      lowerText.includes("heart") ||
      lowerText.includes("cardiac") ||
      lowerText.includes("cardiovascular")
    ) {
      factors.push("heart condition")
    }
    if (lowerText.includes("overdose") || lowerText.includes("drug")) {
      factors.push("overdose")
    }
    if (lowerText.includes("covid") || lowerText.includes("coronavirus")) {
      factors.push("COVID-19")
    }
    if (lowerText.includes("sudden") || lowerText.includes("unexpected")) {
      factors.push("sudden death")
    }

    // Korean entertainment-specific factors
    if (lowerText.includes("depression") || lowerText.includes("mental health")) {
      factors.push("mental health related")
    }
    if (lowerText.includes("exhaustion") || lowerText.includes("overwork")) {
      factors.push("exhaustion/overwork")
    }

    return factors
  }

  /**
   * Try to extract location from article text.
   */
  private extractLocation(text: string): string | null {
    /* eslint-disable security/detect-unsafe-regex -- Acceptable for controlled text scraping */
    const patterns = [
      /(?:died|passed away|found dead)\s+(?:at|in)\s+(?:a\s+)?([A-Za-z][A-Za-z\s,]+(?:hospital|home|residence|apartment|seoul|busan|korea))/i,
      /(?:at|in)\s+(?:a\s+)?([A-Za-z][A-Za-z\s]+(?:hospital|medical center))/i,
      /(?:in\s+)?(Seoul|Busan|Incheon|Daegu|Daejeon|Gwangju|Ulsan|Korea)/i,
    ]
    /* eslint-enable security/detect-unsafe-regex */

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        const location = match[1].trim()
        if (location.length > 2 && location.length < 100) {
          return location
        }
      }
    }

    return null
  }

  /**
   * Check if text contains a specific cause of death.
   */
  private hasSpecificCause(text: string): boolean {
    const specificCauses = [
      "cancer",
      "heart attack",
      "cardiac arrest",
      "stroke",
      "accident",
      "suicide",
      "overdose",
      "covid",
      "pneumonia",
      "organ failure",
      "illness",
    ]

    return specificCauses.some((cause) => text.toLowerCase().includes(cause))
  }

  /**
   * Verify the article is about the correct actor.
   */
  private verifyActorMatch(text: string, actor: ActorForEnrichment): boolean {
    const lowerText = text.toLowerCase()
    const actorNameLower = actor.name.toLowerCase()

    // Check if name appears
    if (!lowerText.includes(actorNameLower)) {
      // Try Korean name order (last name first)
      const nameParts = actorNameLower.split(/\s+/)
      if (nameParts.length > 1) {
        const koreanOrder = nameParts.reverse().join(" ")
        if (!lowerText.includes(koreanOrder) && !lowerText.includes(nameParts.join(""))) {
          return false
        }
      } else {
        return false
      }
    }

    // Check death year if available
    if (actor.deathday) {
      const deathYear = new Date(actor.deathday).getFullYear().toString()
      // Article might not mention the exact year, so this is optional
      // But if it mentions a different year, reject it
      const yearMatches = text.match(/\b(19|20)\d{2}\b/g)
      if (yearMatches && yearMatches.length > 0) {
        const hasCorrectYear = yearMatches.includes(deathYear)
        const hasWrongYear = yearMatches.some(
          (y) => Math.abs(parseInt(y) - parseInt(deathYear)) > 1
        )
        if (hasWrongYear && !hasCorrectYear) {
          return false
        }
      }
    }

    return true
  }
}
