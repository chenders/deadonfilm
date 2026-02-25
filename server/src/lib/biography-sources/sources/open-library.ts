/**
 * Open Library biography source.
 *
 * Searches Open Library for books about a person via the subject API,
 * then uses search-inside to find biographical passages (childhood, family,
 * education, early life) within digitized books.
 *
 * Reliability tier: SECONDARY_COMPILATION (0.85) - published books with
 * varying editorial standards, but generally substantive content.
 *
 * No API key required — Open Library is a free, open API.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import { BiographySourceType } from "../types.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { searchOpenLibraryByPerson, searchInsideBook } from "../../shared/open-library-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

const MIN_CONTENT_LENGTH = 80

/** Keywords to search inside books for biographical content. */
const BIO_SEARCH_KEYWORDS = ["childhood", "family", "education", "early life"]

/** Maximum number of books to search inside. */
const MAX_BOOKS_TO_SEARCH = 3

/**
 * Open Library source for biographical content.
 * Searches for books about the actor, then searches inside digitized copies
 * for passages containing biographical keywords.
 */
export class OpenLibraryBiographySource extends BaseBiographySource {
  readonly name = "Open Library"
  readonly type = BiographySourceType.OPEN_LIBRARY_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  protected minDelayMs = 350

  /**
   * Open Library requires no API key — always available.
   */
  isAvailable(): boolean {
    return true
  }

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    try {
      // Step 1: Find books about this person via subject search
      const subjectResult = await searchOpenLibraryByPerson(
        actor.name,
        20,
        this.createTimeoutSignal()
      )

      if (subjectResult.subject_count === 0 || subjectResult.works.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { queryUsed: actor.name }),
          data: null,
          error: "No books found about this person on Open Library",
        }
      }

      // Step 2: Find books with Internet Archive identifiers for search-inside
      const booksWithIA = subjectResult.works.filter(
        (work) => work.ia && work.ia.length > 0 && work.has_fulltext
      )

      if (booksWithIA.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: actor.name,
            rawData: { worksFound: subjectResult.works.length },
          }),
          data: null,
          error: "No digitized books available for search-inside",
        }
      }

      // Step 3: Search inside top books for biographical content
      const highlights: string[] = []
      const booksSearched: string[] = []

      for (const work of booksWithIA.slice(0, MAX_BOOKS_TO_SEARCH)) {
        const iaId = work.ia![0]
        booksSearched.push(work.title)

        for (const keyword of BIO_SEARCH_KEYWORDS) {
          try {
            const hits = await searchInsideBook(iaId, keyword, this.createTimeoutSignal())

            for (const hit of hits) {
              if (hit.highlight && hit.highlight.length > 20) {
                highlights.push(hit.highlight)
              }
            }
          } catch {
            // Individual search-inside failures are non-fatal; continue to next keyword/book
            continue
          }
        }
      }

      if (highlights.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: actor.name,
            rawData: { booksSearched },
          }),
          data: null,
          error: "No biographical passages found inside books",
        }
      }

      // Step 4: Combine and sanitize highlights
      const combinedText = sanitizeSourceText(highlights.join("\n\n"))

      if (combinedText.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: actor.name,
            rawData: { booksSearched, highlightCount: highlights.length },
          }),
          data: null,
          error: `Open Library content too short (${combinedText.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Step 5: Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(combinedText)

      if (confidence === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            queryUsed: actor.name,
            rawData: { booksSearched },
          }),
          data: null,
          error: "No biographical keywords found in book passages",
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
          rawData: { booksSearched, highlightCount: highlights.length },
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
