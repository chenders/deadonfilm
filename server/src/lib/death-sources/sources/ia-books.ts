/**
 * Internet Archive Books death enrichment source.
 *
 * Searches the Internet Archive for digitized books mentioning an actor,
 * then uses search-inside to locate death-related passages and retrieves
 * full OCR page text for richer context.
 *
 * No API key required — Internet Archive is a free, open API.
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { searchIABooks, searchInsideIA, getPageOCR } from "../../shared/ia-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

/**
 * Internet Archive Books source for death information from digitized public domain books.
 */
export class IABooksDeathSource extends BaseDataSource {
  readonly name = "Internet Archive Books"
  readonly type = DataSourceType.IA_BOOKS
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.ARCHIVAL

  protected minDelayMs = 1000

  /**
   * Always available — no API key required.
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * Search Internet Archive for books about an actor, search inside for
   * death-related passages, and retrieve OCR page text for context.
   *
   * @param actor - Actor to search for
   * @returns Lookup result with OCR text or search-inside matches
   */
  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      const books = await searchIABooks(actor.name, 5, this.createTimeoutSignal())

      if (books.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No books found in Internet Archive",
        }
      }

      // Build death query for search-inside
      const deathYear = actor.deathday?.slice(0, 4) ?? ""
      const deathQuery = `"${actor.name}" death ${deathYear}`.trim()

      const textParts: string[] = []

      for (const book of books) {
        let hits
        try {
          hits = await searchInsideIA(book.identifier, deathQuery, this.createTimeoutSignal())
        } catch {
          // Search-inside can fail for individual books — continue to next
          continue
        }

        if (hits.length === 0) {
          continue
        }

        // For matching pages, try to get full OCR text
        for (const hit of hits) {
          if (hit.pageNum > 0) {
            try {
              const ocrText = await getPageOCR(
                book.identifier,
                hit.pageNum,
                this.createTimeoutSignal()
              )
              if (ocrText) {
                textParts.push(ocrText)
                continue
              }
            } catch {
              // OCR unavailable — fall back to search-inside text
            }
          }

          // Fall back to search-inside match text
          if (hit.text) {
            textParts.push(hit.text)
          }
        }
      }

      if (textParts.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No death-related content found in books",
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
          error: "No death keywords found in book text",
        }
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence),
        data: {
          circumstances: combinedText,
          rumoredCircumstances: null,
          notableFactors: [],
          relatedCelebrities: [],
          locationOfDeath: null,
          additionalContext: null,
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
