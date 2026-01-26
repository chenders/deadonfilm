/**
 * Europeana source for European historical archive death information.
 *
 * Europeana is Europe's digital platform for cultural heritage, aggregating
 * millions of items from European galleries, libraries, archives and museums.
 * Includes digitized newspapers, books, and documents from across Europe.
 *
 * API: https://pro.europeana.eu/page/apis
 * - Requires free API key (EUROPEANA_API_KEY environment variable)
 * - Search endpoint: api.europeana.eu/record/v2/search.json
 * - All metadata is CC0 licensed
 *
 * Strategy:
 * 1. Search for actor name + death keywords
 * 2. Filter by type (newspaper, text) and date range
 * 3. Extract death information from item descriptions
 */

import { BaseDataSource, DEATH_KEYWORDS, LOW_PRIORITY_TIMEOUT_MS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

const EUROPEANA_API_BASE = "https://api.europeana.eu"
const EUROPEANA_SEARCH_URL = `${EUROPEANA_API_BASE}/record/v2/search.json`

interface EuropeanaItem {
  id: string
  guid: string
  link?: string
  title: string[]
  dcDescription?: string[]
  dcCreator?: string[]
  dcDate?: string[]
  dcType?: string[]
  edmIsShownAt?: string[]
  edmPreview?: string[]
  country?: string[]
  provider?: string[]
  dataProvider?: string[]
  year?: string[]
  language?: string[]
  rights?: string[]
  score: number
}

interface EuropeanaResponse {
  success: boolean
  itemsCount: number
  totalResults: number
  items?: EuropeanaItem[]
  nextCursor?: string
}

/**
 * Europeana source for European newspaper and archive death information.
 */
export class EuropeanaSource extends BaseDataSource {
  readonly name = "Europeana"
  readonly type = DataSourceType.EUROPEANA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Be polite to Europeana servers
  protected minDelayMs = 1000

  // Low priority archive source - use shorter timeout
  protected requestTimeoutMs = LOW_PRIORITY_TIMEOUT_MS

  private get apiKey(): string | undefined {
    return process.env.EUROPEANA_API_KEY
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Europeana API key not configured (EUROPEANA_API_KEY)",
      }
    }

    if (!actor.deathday) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Actor is not deceased",
      }
    }

    const deathYear = new Date(actor.deathday).getFullYear()

    try {
      // Build search query
      const searchQuery = `"${actor.name}" AND (death OR died OR obituary OR funeral OR décès OR mort OR Tod OR muerte)`
      const searchUrl = this.buildSearchUrl(searchQuery, deathYear)

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: `Search failed: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as EuropeanaResponse

      if (!data.success || !data.items || data.items.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No items found for this actor in Europeana",
        }
      }

      // Find the most relevant item
      const relevantItem = this.findRelevantItem(data.items, actor)

      if (!relevantItem) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, searchUrl),
          data: null,
          error: "No relevant death record found in search results",
        }
      }

      // Extract death information
      const deathInfo = this.extractDeathInfo(relevantItem, actor)

      if (!deathInfo) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, relevantItem.guid),
          data: null,
          error: "Could not extract death information from item",
        }
      }

      const itemUrl = relevantItem.edmIsShownAt?.[0] || relevantItem.guid

      return {
        success: true,
        source: this.createSourceEntry(startTime, deathInfo.confidence, itemUrl),
        data: {
          circumstances: deathInfo.circumstances,
          rumoredCircumstances: null,
          notableFactors: deathInfo.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: deathInfo.locationOfDeath,
          additionalContext: `Source: Europeana (European digital archives, ${relevantItem.dataProvider?.[0] || relevantItem.provider?.[0] || "European archive"})`,
        },
      }
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Build search URL for Europeana API.
   */
  private buildSearchUrl(query: string, deathYear: number): string {
    const params = new URLSearchParams({
      wskey: this.apiKey!,
      query: query,
      rows: "20",
      profile: "rich",
      // Filter to text-based items (newspapers, books, documents)
      qf: "TYPE:TEXT",
    })

    // Add year filter (around death year)
    params.append("qf", `YEAR:[${deathYear - 1} TO ${deathYear + 1}]`)

    return `${EUROPEANA_SEARCH_URL}?${params.toString()}`
  }

  /**
   * Find the most relevant item for the actor.
   */
  private findRelevantItem(
    items: EuropeanaItem[],
    actor: ActorForEnrichment
  ): EuropeanaItem | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    // Sort by score (relevance)
    const sortedItems = [...items].sort((a, b) => (b.score || 0) - (a.score || 0))

    for (const item of sortedItems) {
      const titleText = (item.title || []).join(" ").toLowerCase()
      const descText = (item.dcDescription || []).join(" ").toLowerCase()
      const combined = `${titleText} ${descText}`

      // Check for actor name
      if (combined.includes(actorNameLower) || combined.includes(lastName)) {
        // Check for death keywords (multilingual)
        const deathKeywords = [
          ...DEATH_KEYWORDS,
          "décès",
          "mort",
          "décédé",
          "Tod",
          "gestorben",
          "muerte",
          "fallecido",
          "morto",
          "decesso",
        ]

        if (deathKeywords.some((kw) => combined.includes(kw.toLowerCase()))) {
          return item
        }
      }
    }

    // Fall back to first item mentioning the name
    for (const item of sortedItems) {
      const combined =
        `${(item.title || []).join(" ")} ${(item.dcDescription || []).join(" ")}`.toLowerCase()
      if (combined.includes(lastName)) {
        return item
      }
    }

    return sortedItems[0] || null
  }

  /**
   * Extract death information from a Europeana item.
   */
  private extractDeathInfo(
    item: EuropeanaItem,
    actor: ActorForEnrichment
  ): {
    circumstances: string
    notableFactors: string[]
    locationOfDeath: string | null
    confidence: number
  } | null {
    const text = [...(item.title || []), ...(item.dcDescription || [])].join(" ")

    if (!text.trim()) {
      return null
    }

    // Extract notable factors
    const notableFactors = this.extractNotableFactors(text)

    // Try to extract location
    const locationOfDeath = this.extractLocation(item, text)

    // Build circumstances
    const circumstances = this.buildCircumstances(item, actor)

    // Calculate confidence
    let confidence = 0.3
    if (text.toLowerCase().includes(actor.name.toLowerCase())) {
      confidence += 0.2
    }
    if (notableFactors.length > 0) {
      confidence += 0.1
    }
    if (locationOfDeath) {
      confidence += 0.1
    }
    if (item.score > 10) {
      confidence += 0.1
    }

    return {
      circumstances,
      notableFactors,
      locationOfDeath,
      confidence: Math.min(confidence, 0.65), // Cap confidence for archive sources
    }
  }

  /**
   * Extract notable factors from text (multilingual).
   */
  private extractNotableFactors(text: string): string[] {
    const factors: string[] = []
    const lowerText = text.toLowerCase()

    // English + European language keywords
    if (
      lowerText.includes("accident") ||
      lowerText.includes("unfall") ||
      lowerText.includes("incidente")
    ) {
      factors.push("accidental death")
    }
    if (
      lowerText.includes("suicide") ||
      lowerText.includes("selbstmord") ||
      lowerText.includes("suicidio")
    ) {
      factors.push("self-inflicted")
    }
    if (
      lowerText.includes("murder") ||
      lowerText.includes("mord") ||
      lowerText.includes("assassinat") ||
      lowerText.includes("omicidio")
    ) {
      factors.push("homicide")
    }
    if (
      lowerText.includes("heart") ||
      lowerText.includes("herz") ||
      lowerText.includes("coeur") ||
      lowerText.includes("cuore")
    ) {
      factors.push("heart condition")
    }
    if (
      lowerText.includes("cancer") ||
      lowerText.includes("krebs") ||
      lowerText.includes("cancro")
    ) {
      factors.push("illness - cancer")
    }
    if (
      lowerText.includes("war") ||
      lowerText.includes("krieg") ||
      lowerText.includes("guerre") ||
      lowerText.includes("guerra")
    ) {
      factors.push("war-related")
    }

    return factors
  }

  /**
   * Extract location from item.
   */
  private extractLocation(item: EuropeanaItem, text: string): string | null {
    // Check country field first
    if (item.country && item.country.length > 0) {
      return item.country[0]
    }

    // Try to extract from text (European cities)
    /* eslint-disable security/detect-unsafe-regex -- Acceptable for controlled text scraping */
    const patterns = [
      /died\s+(?:at|in)\s+([A-Z][a-zA-Z\s,]+)/i,
      /(?:in\s+)?(Paris|London|Berlin|Rome|Vienna|Madrid|Amsterdam|Brussels|Munich|Milan)/i,
      /(?:à|in|en)\s+([A-Z][a-zA-Zéèêëàâäôùûü\s-]+)/,
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
   * Build circumstances text from item.
   */
  private buildCircumstances(item: EuropeanaItem, actor: ActorForEnrichment): string {
    const parts: string[] = []

    if (item.dataProvider && item.dataProvider.length > 0) {
      parts.push(`From ${item.dataProvider[0]}`)
    } else if (item.provider && item.provider.length > 0) {
      parts.push(`From ${item.provider[0]}`)
    }

    if (item.dcDate && item.dcDate.length > 0) {
      parts.push(`dated ${item.dcDate[0]}`)
    } else if (item.year && item.year.length > 0) {
      parts.push(`from ${item.year[0]}`)
    }

    if (item.title && item.title.length > 0) {
      parts.push(`"${item.title[0]}"`)
    }

    if (item.dcDescription && item.dcDescription.length > 0) {
      const desc = item.dcDescription[0].substring(0, 400)
      parts.push(desc)
    }

    if (parts.length === 0) {
      return `Historical European archive mention of ${actor.name}'s death found in Europeana.`
    }

    return parts.join(". ")
  }
}
