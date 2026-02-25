/**
 * Google Books biography source.
 *
 * Searches the Google Books API for biographical content about actors,
 * combining search snippets and volume descriptions to provide personal
 * life context from published books.
 *
 * Reliability tier: SECONDARY_COMPILATION (0.85) - published books vary in
 * editorial rigor, but generally provide substantive biographical detail.
 *
 * Requires GOOGLE_BOOKS_API_KEY environment variable.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import { BiographySourceType } from "../types.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import {
  searchGoogleBooks,
  extractVolumeText,
  formatVolumeAttribution,
} from "../../shared/google-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

const MIN_CONTENT_LENGTH = 100

/**
 * Google Books source for biographical content.
 * Searches for books mentioning the actor and extracts biographical snippets
 * and descriptions for synthesis.
 */
export class GoogleBooksBiographySource extends BaseBiographySource {
  readonly name = "Google Books"
  readonly type = BiographySourceType.GOOGLE_BOOKS_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  protected minDelayMs = 1000

  /**
   * Check if Google Books API is available (API key configured).
   */
  isAvailable(): boolean {
    return !!process.env.GOOGLE_BOOKS_API_KEY
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    try {
      // Build biography-focused search query
      const query = `"${actor.name}" biography personal life`

      const searchResult = await searchGoogleBooks(query, 5, this.createTimeoutSignal())

      if (searchResult.totalItems === 0 || searchResult.items.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No books found for actor biography",
        }
      }

      // Extract and combine text from top results
      const textParts: string[] = []
      const attributions: string[] = []

      for (const volume of searchResult.items) {
        const rawText = extractVolumeText(volume)
        if (rawText) {
          const cleanText = sanitizeSourceText(rawText)
          if (cleanText.length > 0) {
            textParts.push(cleanText)
            attributions.push(formatVolumeAttribution(volume))
          }
        }
      }

      if (textParts.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No readable text found in book results",
        }
      }

      const combinedText = textParts.join("\n\n")

      // Check minimum content length
      if (combinedText.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: `Book content too short (${combinedText.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Calculate biographical confidence from the combined text
      const confidence = this.calculateBiographicalConfidence(combinedText)

      if (confidence === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
          data: null,
          error: "No biographical keywords found in book content",
        }
      }

      const sourceData: RawBiographySourceData = {
        sourceName: this.name,
        sourceType: this.type,
        text: combinedText,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        contentType: "book_summary",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          queryUsed: query,
          contentType: "book_summary",
          rawData: { attributions },
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
}
