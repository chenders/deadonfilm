/**
 * Internet Archive biography source.
 *
 * Searches archive.org for biographical content about actors including
 * digitized books, newspapers, magazines, interviews, and memoirs.
 *
 * API: https://archive.org/developers/index-apis.html
 * - Free, no API key required
 * - Advanced Search: archive.org/advancedsearch.php
 * - Returns JSON with item metadata
 *
 * Reliability tier: ARCHIVAL (0.9) - authoritative primary archive.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"

const IA_SEARCH_URL = "https://archive.org/advancedsearch.php"
const IA_DETAILS_URL = "https://archive.org/details"
const MIN_CONTENT_LENGTH = 100

interface IASearchDoc {
  identifier: string
  title?: string
  description?: string | string[]
  creator?: string | string[]
  date?: string
  year?: number
  mediatype?: string
  subject?: string | string[]
  downloads?: number
}

interface IASearchResponse {
  responseHeader: {
    status: number
    QTime: number
  }
  response: {
    numFound: number
    start: number
    docs: IASearchDoc[]
  }
}

/**
 * Internet Archive biography source for biographical content from
 * digitized books, newspapers, interviews, and memoirs.
 */
export class InternetArchiveBiographySource extends BaseBiographySource {
  readonly name = "Internet Archive"
  readonly type = BiographySourceType.INTERNET_ARCHIVE_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.ARCHIVAL

  protected minDelayMs = 1000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    try {
      // Build biography-focused search query
      const query = `"${actor.name}" AND (biography OR "early life" OR interview OR memoir)`
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
          source: this.createSourceEntry(startTime, 0, { url: searchUrl }),
          data: null,
          error: `Search failed: HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as IASearchResponse

      if (!data.response?.docs || data.response.docs.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No items found in Internet Archive",
        }
      }

      // Find the most relevant document
      const relevantDoc = this.findRelevantDoc(data.response.docs, actor)

      if (!relevantDoc) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No relevant biographical content found in search results",
        }
      }

      // Build text from document metadata
      const combinedText = this.buildTextFromDoc(relevantDoc)

      if (combinedText.length < MIN_CONTENT_LENGTH) {
        const itemUrl = `${IA_DETAILS_URL}/${relevantDoc.identifier}`
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: itemUrl,
            queryUsed: query,
          }),
          data: null,
          error: `Internet Archive content too short (${combinedText.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Run through mechanical pre-clean (handles any HTML entities in metadata)
      const { text } = mechanicalPreClean(combinedText)

      // Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(text || combinedText)

      const itemUrl = `${IA_DETAILS_URL}/${relevantDoc.identifier}`
      const articleTitle = relevantDoc.title || `${actor.name} - Internet Archive`

      const sourceData: RawBiographySourceData = {
        sourceName: "Internet Archive",
        sourceType: BiographySourceType.INTERNET_ARCHIVE_BIO,
        text: text || combinedText,
        url: itemUrl,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication: "Internet Archive",
        articleTitle,
        domain: "archive.org",
        contentType: "biography",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: itemUrl,
          queryUsed: query,
          publication: "Internet Archive",
          articleTitle,
          domain: "archive.org",
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
   * Build search URL for Internet Archive Advanced Search.
   */
  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams({
      q: query,
      fl: [
        "identifier",
        "title",
        "description",
        "creator",
        "date",
        "year",
        "mediatype",
        "subject",
        "downloads",
      ].join(","),
      sort: "downloads desc",
      rows: "10",
      page: "1",
      output: "json",
    })

    // Filter to text-based media types
    return `${IA_SEARCH_URL}?${params.toString()}`
  }

  /**
   * Normalize description field (can be string or array).
   */
  private normalizeField(field: string | string[] | undefined): string {
    if (!field) return ""
    if (Array.isArray(field)) return field.join(" ")
    return field
  }

  /**
   * Find the most relevant document for biographical content.
   * Requires actor name match plus biographical keywords.
   */
  private findRelevantDoc(docs: IASearchDoc[], actor: ActorForBiography): IASearchDoc | null {
    const actorNameLower = actor.name.toLowerCase()
    const nameParts = actorNameLower.split(/\s+/)
    const lastName = nameParts[nameParts.length - 1]

    const bioKeywords = [
      "biography",
      "early life",
      "interview",
      "memoir",
      "profile",
      "childhood",
      "personal",
    ]

    // Sort by downloads (popularity/reliability indicator)
    const sortedDocs = [...docs].sort((a, b) => (b.downloads || 0) - (a.downloads || 0))

    // First pass: full name match + bio keywords
    for (const doc of sortedDocs) {
      const combined = this.getDocText(doc).toLowerCase()

      if (combined.includes(actorNameLower)) {
        if (bioKeywords.some((kw) => combined.includes(kw))) {
          return doc
        }
      }
    }

    // Second pass: last name + bio keywords (for multi-word names only)
    if (nameParts.length > 1) {
      for (const doc of sortedDocs) {
        const combined = this.getDocText(doc).toLowerCase()

        if (combined.includes(lastName)) {
          if (bioKeywords.some((kw) => combined.includes(kw))) {
            return doc
          }
        }
      }
    }

    return null
  }

  /**
   * Get combined text from all relevant document fields.
   */
  private getDocText(doc: IASearchDoc): string {
    return [doc.title || "", this.normalizeField(doc.description), this.normalizeField(doc.subject)]
      .filter(Boolean)
      .join(" ")
  }

  /**
   * Build biographical text from a document's metadata fields.
   */
  private buildTextFromDoc(doc: IASearchDoc): string {
    const parts: string[] = []

    if (doc.title) {
      parts.push(doc.title)
    }

    const description = this.normalizeField(doc.description)
    if (description) {
      parts.push(description)
    }

    const subject = this.normalizeField(doc.subject)
    if (subject) {
      parts.push(subject)
    }

    if (doc.creator) {
      const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator
      parts.push(`By ${creator}`)
    }

    if (doc.date || doc.year) {
      parts.push(`(${doc.date || doc.year})`)
    }

    return parts.join(". ")
  }
}
