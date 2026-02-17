/**
 * Douban source for Chinese actor death information.
 *
 * Douban (豆瓣) is China's largest entertainment database, covering movies,
 * books, and music. It has comprehensive information about Chinese actors
 * and international actors popular in China.
 *
 * Strategy:
 * 1. First check Wikidata for Douban ID (P4529)
 * 2. If no Wikidata link, search Douban directly
 * 3. Extract death information from celebrity page
 *
 * Note: Douban may require special handling for access from outside China.
 */

import { BaseDataSource, DEATH_KEYWORDS, LOW_PRIORITY_TIMEOUT_MS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const DOUBAN_BASE_URL = "https://movie.douban.com"
const DOUBAN_SEARCH_URL = `${DOUBAN_BASE_URL}/celebrities/search?search_text=`
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"

// Chinese death-related keywords
const CHINESE_DEATH_KEYWORDS = [
  "去世",
  "逝世",
  "死亡",
  "病逝",
  "辞世",
  "离世",
  "过世",
  "亡故",
  "故去",
  "仙逝",
  "溘然长逝",
  "与世长辞",
  "死因",
  "死于",
  "因病去世",
  "病故",
  "意外身亡",
  "自杀",
  "他杀",
  "遇难",
  "癌症",
  "心脏病",
  "车祸",
]

/**
 * Douban source for Chinese actor information.
 */
export class DoubanSource extends BaseDataSource {
  readonly name = "Douban"
  readonly type = DataSourceType.DOUBAN
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.UNRELIABLE_UGC

  // Douban may rate limit aggressively
  protected minDelayMs = 3000

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
      // Step 1: Try to get Douban ID from Wikidata
      const doubanId = await this.getDoubanIdFromWikidata(actor)
      let celebrityUrl: string | null = null

      if (doubanId) {
        celebrityUrl = `${DOUBAN_BASE_URL}/celebrity/${doubanId}/`
      } else {
        // Step 2: Search Douban directly
        celebrityUrl = await this.searchDouban(actor)
      }

      if (!celebrityUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "Actor not found on Douban",
        }
      }

      // Step 3: Fetch celebrity page
      const pageResponse = await fetch(celebrityUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (pageResponse.status === 403 || pageResponse.status === 418) {
        throw new SourceAccessBlockedError(
          `Douban blocked access (${pageResponse.status})`,
          this.type,
          celebrityUrl,
          pageResponse.status
        )
      }

      if (!pageResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, celebrityUrl),
          data: null,
          error: `Celebrity page fetch failed: HTTP ${pageResponse.status}`,
        }
      }

      const html = await pageResponse.text()

      // Step 4: Extract death information
      const deathInfo = this.extractDeathInfo(html, actor)

      if (!deathInfo) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, celebrityUrl),
          data: null,
          error: "No death information found on Douban page",
        }
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, deathInfo.confidence, celebrityUrl),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: null,
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
   * Try to get Douban celebrity ID from Wikidata (P4529).
   */
  private async getDoubanIdFromWikidata(actor: ActorForEnrichment): Promise<string | null> {
    if (!actor.birthday) {
      return null
    }

    const birthYear = new Date(actor.birthday).getFullYear()
    const escapedName = actor.name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

    const query = `
      SELECT ?doubanId WHERE {
        ?person wdt:P31 wd:Q5 .
        ?person rdfs:label "${escapedName}"@en .
        ?person wdt:P569 ?birthDate .
        FILTER(YEAR(?birthDate) = ${birthYear})
        ?person wdt:P4529 ?doubanId .
      }
      LIMIT 1
    `

    try {
      const response = await fetch(`${WIKIDATA_SPARQL_URL}?query=${encodeURIComponent(query)}`, {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": this.userAgent,
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as {
        results: { bindings: Array<{ doubanId?: { value: string } }> }
      }

      if (data.results.bindings.length > 0 && data.results.bindings[0].doubanId) {
        return data.results.bindings[0].doubanId.value
      }
    } catch {
      // Wikidata lookup failed, will fall back to search
    }

    return null
  }

  /**
   * Search Douban for the actor.
   */
  private async searchDouban(actor: ActorForEnrichment): Promise<string | null> {
    const searchUrl = `${DOUBAN_SEARCH_URL}${encodeURIComponent(actor.name)}`

    try {
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return null
      }

      const html = await response.text()

      // Find celebrity links in search results
      // Pattern: /celebrity/XXXXX/
      const celebrityPattern = /href="(https:\/\/movie\.douban\.com\/celebrity\/\d+\/)"/gi
      const matches: string[] = []

      let match
      while ((match = celebrityPattern.exec(html)) !== null) {
        matches.push(match[1])
      }

      if (matches.length === 0) {
        // Try alternate pattern
        const altPattern = /href="(\/celebrity\/\d+\/)"/gi
        while ((match = altPattern.exec(html)) !== null) {
          matches.push(`${DOUBAN_BASE_URL}${match[1]}`)
        }
      }

      if (matches.length === 0) {
        return null
      }

      // Return the first match (most relevant)
      return matches[0]
    } catch {
      return null
    }
  }

  /**
   * Extract death information from Douban celebrity page.
   */
  private extractDeathInfo(
    html: string,
    actor: ActorForEnrichment
  ): {
    circumstances: string | null
    notableFactors: string[]
    locationOfDeath: string | null
    additionalContext: string | null
    confidence: number
  } | null {
    const text = htmlToText(html)

    // Check if page mentions death
    const hasDeathMention = [...CHINESE_DEATH_KEYWORDS, ...DEATH_KEYWORDS].some((keyword) =>
      text.includes(keyword)
    )

    if (!hasDeathMention) {
      return null
    }

    // Try to find biography/intro section
    const introMatch = html.match(/<div[^>]*class="[^"]*intro[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const introText = introMatch ? htmlToText(introMatch[1]) : text

    // Look for death-related content
    const deathContent = this.extractDeathContent(introText)

    if (!deathContent) {
      return null
    }

    // Extract notable factors
    const notableFactors = this.extractNotableFactors(deathContent)

    // Try to extract location
    const locationOfDeath = this.extractLocation(deathContent)

    // Calculate confidence
    let confidence = 0.4
    if (deathContent.length > 50) confidence += 0.1
    if (notableFactors.length > 0) confidence += 0.1
    if (locationOfDeath) confidence += 0.1
    if (this.verifyActorMatch(text, actor)) confidence += 0.1

    return {
      circumstances: deathContent,
      notableFactors,
      locationOfDeath,
      additionalContext: `Source: Douban (豆瓣, Chinese entertainment database)`,
      confidence: Math.min(confidence, 0.75),
    }
  }

  /**
   * Extract death-related content from text.
   */
  private extractDeathContent(text: string): string | null {
    // Split into sentences (Chinese uses different punctuation)
    const sentences = text.split(/[。！？\n]+/)
    const deathSentences: string[] = []

    for (const sentence of sentences) {
      if (
        [...CHINESE_DEATH_KEYWORDS, ...DEATH_KEYWORDS].some((keyword) => sentence.includes(keyword))
      ) {
        const trimmed = sentence.trim()
        if (trimmed.length > 5 && trimmed.length < 500) {
          deathSentences.push(trimmed)
        }
      }
    }

    if (deathSentences.length === 0) {
      return null
    }

    return deathSentences.slice(0, 3).join("。")
  }

  /**
   * Extract notable factors from Chinese text.
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []

    if (text.includes("车祸") || text.includes("意外") || text.includes("事故")) {
      factors.push("accidental death")
    }
    if (text.includes("自杀") || text.includes("自尽")) {
      factors.push("self-inflicted")
    }
    if (text.includes("他杀") || text.includes("谋杀") || text.includes("遇害")) {
      factors.push("homicide")
    }
    if (text.includes("癌症") || text.includes("癌")) {
      factors.push("illness - cancer")
    }
    if (text.includes("心脏") || text.includes("心肌梗塞")) {
      factors.push("heart condition")
    }
    if (text.includes("药物过量") || text.includes("overdose")) {
      factors.push("overdose")
    }
    if (text.includes("新冠") || text.includes("COVID") || text.includes("冠状病毒")) {
      factors.push("COVID-19")
    }

    return factors
  }

  /**
   * Try to extract location from Chinese text.
   */
  private extractLocation(text: string): string | null {
    // Common Chinese location patterns
    const patterns = [
      /(?:在|于)([^，。！？\s]{2,20})(?:去世|逝世|病逝|离世)/,
      /(?:去世|逝世|病逝)(?:于|在)([^，。！？\s]{2,20})/,
      /([^，。！？\s]{2,10}(?:医院|病院))/,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }

    return null
  }

  /**
   * Verify the page is about the correct actor.
   */
  private verifyActorMatch(text: string, actor: ActorForEnrichment): boolean {
    // Check if name appears in text
    if (!text.includes(actor.name)) {
      // Try checking just the last name (common for Chinese actors with English names)
      const nameParts = actor.name.split(/\s+/)
      const lastName = nameParts[nameParts.length - 1]
      if (!text.includes(lastName)) {
        return false
      }
    }

    // Check birth year if available
    if (actor.birthday) {
      const birthYear = new Date(actor.birthday).getFullYear().toString()
      if (!text.includes(birthYear)) {
        return false
      }
    }

    return true
  }
}
