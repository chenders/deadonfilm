/**
 * FilmiBeat source for Indian actor death information.
 *
 * FilmiBeat is a major Indian entertainment news site covering Bollywood,
 * Tollywood (Telugu), Kollywood (Tamil), and other Indian film industries.
 * It provides detailed coverage of celebrity deaths.
 *
 * Strategy:
 * 1. Search FilmiBeat for actor name + death
 * 2. Find relevant news articles
 * 3. Extract death circumstances from article content
 */

import { BaseDataSource, DEATH_KEYWORDS, LOW_PRIORITY_TIMEOUT_MS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const FILMIBEAT_BASE_URL = "https://www.filmibeat.com"
const FILMIBEAT_SEARCH_URL = `${FILMIBEAT_BASE_URL}/search.html?q=`

// Hindi/Indian death-related keywords (commonly used in English articles about Indian celebrities)
const INDIAN_DEATH_KEYWORDS = [
  "demise",
  "passed away",
  "breathed his last",
  "breathed her last",
  "no more",
  "left for heavenly abode",
  "bid adieu",
  "mortal remains",
  "last rites",
  "cremation",
  "funeral",
  "condolences",
  "RIP",
  "tragic death",
  "untimely death",
  "sudden demise",
]

/**
 * FilmiBeat source for Indian actor information.
 */
export class FilmiBeatSource extends BaseDataSource {
  readonly name = "FilmiBeat"
  readonly type = DataSourceType.FILMIBEAT
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.UNRELIABLE_UGC

  // Be polite to FilmiBeat
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
      const searchUrl = `${FILMIBEAT_SEARCH_URL}${encodeURIComponent(searchQuery)}`

      const searchResponse = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (searchResponse.status === 403) {
        throw new SourceAccessBlockedError(
          `FilmiBeat blocked access (403)`,
          this.type,
          searchUrl,
          403
        )
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

      // Step 2: Find relevant article
      const articleUrl = this.findRelevantArticle(searchHtml, actor)

      if (!articleUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No relevant death article found on FilmiBeat",
        }
      }

      // Step 3: Fetch the article
      await this.waitForRateLimit()

      const fullArticleUrl = articleUrl.startsWith("http")
        ? articleUrl
        : `${FILMIBEAT_BASE_URL}${articleUrl}`

      const articleResponse = await fetch(fullArticleUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (articleResponse.status === 403) {
        throw new SourceAccessBlockedError(
          `FilmiBeat blocked access (403)`,
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
    // FilmiBeat article patterns
    const articlePatterns = [
      /href="((?:https:\/\/www\.filmibeat\.com)?\/[a-z]+\/news\/[^"]+(?:death|passes-away|passed-away|dies|deceased|rip|demise|no-more)[^"]*)"/gi,
      /href="((?:https:\/\/www\.filmibeat\.com)?\/[a-z]+\/news\/[^"]+)"/gi,
    ]

    const matches: string[] = []

    for (const pattern of articlePatterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        const url = match[1]

        // Check context around the link
        const urlIndex = html.indexOf(match[0])
        const context = html.substring(Math.max(0, urlIndex - 300), urlIndex + 300).toLowerCase()

        const actorNameLower = actor.name.toLowerCase()
        const hasActorName =
          context.includes(actorNameLower) || context.includes(actorNameLower.replace(/\s+/g, "-"))

        const allDeathKeywords = [...DEATH_KEYWORDS, ...INDIAN_DEATH_KEYWORDS]
        const hasDeathWord = allDeathKeywords.some((keyword) =>
          context.includes(keyword.toLowerCase())
        )

        if (hasActorName && hasDeathWord && !matches.includes(url)) {
          matches.push(url)
        }
      }
    }

    if (matches.length === 0) {
      return null
    }

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
    // Try to find article content
    const articleMatch =
      html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<div[^>]*class="[^"]*article[^"]*body[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div[^>]*class="[^"]*story[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)

    const contentHtml = articleMatch ? articleMatch[1] : html
    const text = htmlToText(contentHtml)

    // Verify this is about the correct person
    if (!this.verifyActorMatch(text, actor)) {
      return null
    }

    // Check for death-related content
    const allDeathKeywords = [...DEATH_KEYWORDS, ...INDIAN_DEATH_KEYWORDS]
    const hasDeathMention = allDeathKeywords.some((keyword) =>
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

      if (allDeathKeywords.some((keyword) => lowerPara.includes(keyword.toLowerCase()))) {
        // Check if this is rumored/alleged
        if (
          lowerPara.includes("rumour") ||
          lowerPara.includes("rumor") ||
          lowerPara.includes("alleged") ||
          lowerPara.includes("unconfirmed") ||
          lowerPara.includes("speculation")
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
    let confidence = 0.45 // Base for finding relevant article
    if (deathParagraphs.length > 1) confidence += 0.1
    if (notableFactors.length > 0) confidence += 0.1
    if (locationOfDeath) confidence += 0.05
    if (this.hasSpecificCause(allText)) confidence += 0.1

    return {
      circumstances: circumstances || null,
      rumoredCircumstances,
      notableFactors,
      locationOfDeath,
      additionalContext: `Source: FilmiBeat (Indian entertainment news)`,
      confidence: Math.min(confidence, 0.8),
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
      lowerText.includes("took his life") ||
      lowerText.includes("took her life")
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
    if (
      lowerText.includes("kidney") ||
      lowerText.includes("liver") ||
      lowerText.includes("organ failure")
    ) {
      factors.push("organ failure")
    }
    if (lowerText.includes("covid") || lowerText.includes("coronavirus")) {
      factors.push("COVID-19")
    }
    if (
      lowerText.includes("sudden") ||
      lowerText.includes("unexpected") ||
      lowerText.includes("untimely")
    ) {
      factors.push("sudden death")
    }

    // Indian cinema-specific factors
    if (lowerText.includes("depression") || lowerText.includes("mental health")) {
      factors.push("mental health related")
    }
    if (lowerText.includes("prolonged illness") || lowerText.includes("long illness")) {
      factors.push("prolonged illness")
    }

    return factors
  }

  /**
   * Try to extract location from article text.
   */
  private extractLocation(text: string): string | null {
    /* eslint-disable security/detect-unsafe-regex -- Acceptable for controlled text scraping */
    const patterns = [
      /(?:died|passed away|breathed (?:his|her) last)\s+(?:at|in)\s+(?:a\s+)?([A-Za-z][A-Za-z\s,]+(?:hospital|home|residence|mumbai|delhi|chennai|hyderabad|kolkata|bangalore|india))/i,
      /(?:at|in)\s+(?:a\s+)?([A-Za-z][A-Za-z\s]+(?:hospital|medical|nursing home))/i,
      /(?:in\s+)?(Mumbai|Delhi|Chennai|Hyderabad|Kolkata|Bangalore|Bengaluru|Pune|Lucknow|India)/i,
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
      "kidney failure",
      "liver failure",
      "covid",
      "pneumonia",
      "illness",
      "prolonged illness",
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
      // Try without middle names
      const nameParts = actorNameLower.split(/\s+/)
      if (nameParts.length > 2) {
        // Try first and last name only
        const shortName = `${nameParts[0]} ${nameParts[nameParts.length - 1]}`
        if (!lowerText.includes(shortName)) {
          return false
        }
      } else {
        return false
      }
    }

    // Check death year if available
    if (actor.deathday) {
      const deathYear = new Date(actor.deathday).getFullYear().toString()
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
