/**
 * Europeana biography source.
 *
 * Searches Europe's digital cultural heritage platform for biographical content
 * about actors. Aggregates millions of items from European galleries, libraries,
 * archives, and museums.
 *
 * API: https://pro.europeana.eu/page/apis
 * - Requires free API key (EUROPEANA_API_KEY environment variable)
 * - Search endpoint: api.europeana.eu/record/v2/search.json
 * - All metadata is CC0 licensed
 *
 * Reliability tier: ARCHIVAL (0.9) - European cultural heritage institutions.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"

const EUROPEANA_SEARCH_URL = "https://api.europeana.eu/record/v2/search.json"
const MIN_CONTENT_LENGTH = 100

interface EuropeanaItem {
  id: string
  guid: string
  title: string[]
  dcDescription?: string[]
  dcCreator?: string[]
  dcDate?: string[]
  edmIsShownAt?: string[]
  country?: string[]
  provider?: string[]
  dataProvider?: string[]
  year?: string[]
  score: number
}

interface EuropeanaResponse {
  success: boolean
  itemsCount: number
  totalResults: number
  items?: EuropeanaItem[]
}

/**
 * Europeana biography source for European cultural heritage biographical content.
 */
export class EuropeanaBiographySource extends BaseBiographySource {
  readonly name = "Europeana"
  readonly type = BiographySourceType.EUROPEANA_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.ARCHIVAL

  protected minDelayMs = 1000

  private get apiKey(): string | undefined {
    return process.env.EUROPEANA_API_KEY
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Europeana API key not configured (EUROPEANA_API_KEY)",
      }
    }

    try {
      // Build biography-focused query
      const query = `"${actor.name}" biography OR profile OR interview`
      const searchUrl = this.buildSearchUrl(query)

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
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: `Search failed: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as EuropeanaResponse

      if (!data.success || !data.items || data.items.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No items found in Europeana",
        }
      }

      // Find the most relevant item
      const relevantItem = this.findRelevantItem(data.items, actor)

      if (!relevantItem) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No relevant biographical content found in search results",
        }
      }

      // Build text from item metadata
      const combinedText = this.buildTextFromItem(relevantItem)

      if (combinedText.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: relevantItem.guid,
            queryUsed: query,
          }),
          data: null,
          error: `Europeana content too short (${combinedText.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Run through mechanical pre-clean
      const { text } = mechanicalPreClean(combinedText)

      // Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(text || combinedText)

      const itemUrl = relevantItem.edmIsShownAt?.[0] || relevantItem.guid
      const publication =
        relevantItem.dataProvider?.[0] || relevantItem.provider?.[0] || "Europeana"
      const articleTitle = (relevantItem.title || [])[0] || `${actor.name} - Europeana`

      const sourceData: RawBiographySourceData = {
        sourceName: "Europeana",
        sourceType: BiographySourceType.EUROPEANA_BIO,
        text: text || combinedText,
        url: itemUrl,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication,
        articleTitle,
        domain: "europeana.eu",
        contentType: "biography",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: itemUrl,
          queryUsed: query,
          publication,
          articleTitle,
          domain: "europeana.eu",
          contentType: "biography",
        }),
        data: sourceData,
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
  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams({
      wskey: this.apiKey!,
      query: query,
      rows: "20",
      qf: "TYPE:TEXT",
    })

    return `${EUROPEANA_SEARCH_URL}?${params.toString()}`
  }

  /**
   * Find the most relevant item for the actor.
   */
  private findRelevantItem(items: EuropeanaItem[], actor: ActorForBiography): EuropeanaItem | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    const bioKeywords = [
      "biography",
      "profile",
      "interview",
      "personal",
      "childhood",
      "early life",
      // European language variants
      "biographie",
      "biographia",
      "profil",
      "intervista",
    ]

    // Sort by score (relevance)
    const sortedItems = [...items].sort((a, b) => (b.score || 0) - (a.score || 0))

    for (const item of sortedItems) {
      const titleText = (item.title || []).join(" ").toLowerCase()
      const descText = (item.dcDescription || []).join(" ").toLowerCase()
      const combined = `${titleText} ${descText}`

      // Check for actor name
      if (combined.includes(actorNameLower) || combined.includes(lastName)) {
        // Prefer results with biographical keywords
        if (bioKeywords.some((kw) => combined.includes(kw))) {
          return item
        }
      }
    }

    // Second pass: accept full name match without bio keywords
    for (const item of sortedItems) {
      const titleText = (item.title || []).join(" ").toLowerCase()
      const descText = (item.dcDescription || []).join(" ").toLowerCase()
      const combined = `${titleText} ${descText}`

      if (combined.includes(actorNameLower)) {
        return item
      }
    }

    return null
  }

  /**
   * Build text from an item's metadata fields.
   */
  private buildTextFromItem(item: EuropeanaItem): string {
    const parts: string[] = []

    if (item.title && item.title.length > 0) {
      parts.push(item.title[0])
    }

    if (item.dcDescription && item.dcDescription.length > 0) {
      parts.push(item.dcDescription.join(" "))
    }

    if (item.dataProvider && item.dataProvider.length > 0) {
      parts.push(`Source: ${item.dataProvider[0]}`)
    }

    if (item.dcDate && item.dcDate.length > 0) {
      parts.push(`Date: ${item.dcDate[0]}`)
    } else if (item.year && item.year.length > 0) {
      parts.push(`Year: ${item.year[0]}`)
    }

    return parts.join(". ")
  }
}
