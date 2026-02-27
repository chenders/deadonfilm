/**
 * Internet Archive Books biography source.
 *
 * Searches the Internet Archive for digitized books about an actor, then
 * uses search-inside and OCR page retrieval to extract biographical passages.
 * Particularly useful for older, public-domain biographies.
 *
 * Reliability tier: ARCHIVAL (0.9) - institutional archive with digitized
 * published books, generally high quality.
 *
 * No API key required — Internet Archive is a free, open API.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import { BiographySourceType } from "../types.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { searchIABooks, searchInsideIA, getPageOCR } from "../../shared/ia-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

const MIN_CONTENT_LENGTH = 100

/** Keywords to search inside books for biographical content. */
const BIO_SEARCH_KEYWORDS = ["childhood", "family", "education", "early life"]

/** Maximum number of books to search inside. */
const MAX_BOOKS_TO_SEARCH = 3

/** Maximum number of OCR pages to retrieve per book. */
const MAX_OCR_PAGES = 2

/**
 * Internet Archive Books source for biographical content.
 * Searches for digitized books about the actor, then extracts biographical
 * passages via search-inside and OCR page retrieval.
 */
export class IABooksBiographySource extends BaseBiographySource {
  readonly name = "IA Books"
  readonly type = BiographySourceType.IA_BOOKS_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.ARCHIVAL

  protected minDelayMs = 1000

  /**
   * Internet Archive requires no API key — always available.
   */
  isAvailable(): boolean {
    return true
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    try {
      // Step 1: Search IA for books about this person
      const books = await searchIABooks(actor.name, 10, this.createTimeoutSignal())

      if (books.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: actor.name }),
          data: null,
          error: "No books found on Internet Archive",
        }
      }

      // Step 2: Search inside top books for biographical keywords and get OCR pages
      const textParts: string[] = []
      const booksSearched: string[] = []

      for (const book of books.slice(0, MAX_BOOKS_TO_SEARCH)) {
        booksSearched.push(book.title)

        // Try search-inside for biographical keywords
        for (const keyword of BIO_SEARCH_KEYWORDS) {
          try {
            const hits = await searchInsideIA(book.identifier, keyword, this.createTimeoutSignal())

            for (const hit of hits) {
              if (hit.text && hit.text.length > 20) {
                textParts.push(hit.text)
              }

              // Get OCR text for matching pages (limited to avoid excessive requests)
              if (hit.pageNum > 0 && textParts.length < MAX_OCR_PAGES * MAX_BOOKS_TO_SEARCH) {
                try {
                  const ocrText = await getPageOCR(
                    book.identifier,
                    hit.pageNum,
                    this.createTimeoutSignal()
                  )
                  if (ocrText && ocrText.length > 50) {
                    textParts.push(ocrText)
                  }
                } catch {
                  // OCR page retrieval failures are non-fatal
                  continue
                }
              }
            }
          } catch {
            // Individual search-inside failures are non-fatal; continue to next keyword/book
            continue
          }
        }
      }

      if (textParts.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: actor.name,
            rawData: { booksSearched },
          }),
          data: null,
          error: "No biographical passages found in Internet Archive books",
        }
      }

      // Step 3: Combine and sanitize text
      const combinedText = sanitizeSourceText(textParts.join("\n\n"))

      if (combinedText.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: actor.name,
            rawData: { booksSearched, textPartsCount: textParts.length },
          }),
          data: null,
          error: `IA Books content too short (${combinedText.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Step 4: Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(combinedText)

      if (confidence === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: actor.name,
            rawData: { booksSearched },
          }),
          data: null,
          error: "No biographical keywords found in IA book content",
        }
      }

      const sourceData: RawBiographySourceData = {
        sourceName: this.name,
        sourceType: this.type,
        text: combinedText,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        contentType: "book_excerpt",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          queryUsed: actor.name,
          contentType: "book_excerpt",
          rawData: { booksSearched, textPartsCount: textParts.length },
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
