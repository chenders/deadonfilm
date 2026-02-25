/**
 * Google Books death enrichment source.
 *
 * Searches Google Books API for volumes mentioning an actor's death,
 * extracts text snippets and descriptions, and calculates confidence
 * based on death-related keyword presence.
 *
 * Requires GOOGLE_BOOKS_API_KEY environment variable.
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import {
  searchGoogleBooks,
  extractVolumeText,
  formatVolumeAttribution,
} from "../../shared/google-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

/**
 * Google Books source for death information found in published books.
 */
export class GoogleBooksDeathSource extends BaseDataSource {
  readonly name = "Google Books"
  readonly type = DataSourceType.GOOGLE_BOOKS
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  protected minDelayMs = 1000

  /**
   * Check if GOOGLE_BOOKS_API_KEY is configured.
   */
  isAvailable(): boolean {
    return !!process.env.GOOGLE_BOOKS_API_KEY
  }

  /**
   * Search Google Books for death-related content about an actor.
   *
   * @param actor - Actor to search for
   * @returns Lookup result with combined book text and source attributions
   */
  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()
    const deathYear = actor.deathday?.slice(0, 4) ?? ""
    const query = `"${actor.name}" death cause ${deathYear}`.trim()

    try {
      const searchResult = await searchGoogleBooks(query, 5, this.createTimeoutSignal())

      if (searchResult.items.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No books found matching query",
        }
      }

      // Extract text and attributions from each volume
      const textParts: string[] = []
      const attributions: string[] = []

      for (const volume of searchResult.items) {
        const text = extractVolumeText(volume)
        if (text) {
          textParts.push(text)
          attributions.push(formatVolumeAttribution(volume))
        }
      }

      if (textParts.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No readable text found in search results",
        }
      }

      const combinedText = sanitizeSourceText(textParts.join("\n\n"))
      const confidence = this.calculateConfidence(
        combinedText,
        DEATH_KEYWORDS,
        CIRCUMSTANCE_KEYWORDS
      )

      if (confidence === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No death-related content found in book text",
        }
      }

      const sourceAttributions = attributions.map((a) => `Source: ${a}`).join("\n")

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence),
        data: {
          circumstances: combinedText,
          rumoredCircumstances: null,
          notableFactors: [],
          relatedCelebrities: [],
          locationOfDeath: null,
          additionalContext: sourceAttributions,
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
}
