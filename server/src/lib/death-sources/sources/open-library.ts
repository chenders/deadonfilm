/**
 * Open Library death enrichment source.
 *
 * Searches Open Library for books about an actor using the person-subject
 * endpoint, then uses search-inside to find death-related passages within
 * digitized books.
 *
 * No API key required — Open Library is a free, open API.
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import { searchOpenLibraryByPerson, searchInsideBook } from "../../shared/open-library-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

/**
 * Open Library source for death information found in digitized books.
 */
export class OpenLibraryDeathSource extends BaseDataSource {
  readonly name = "Open Library"
  readonly type = DataSourceType.OPEN_LIBRARY
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  // Open Library rate limit: ~3 requests per second
  protected minDelayMs = 350

  /**
   * Always available — no API key required.
   */
  isAvailable(): boolean {
    return true
  }

  /**
   * Search Open Library for books about an actor, then search inside
   * digitized books for death-related passages.
   *
   * @param actor - Actor to search for
   * @returns Lookup result with search-inside highlights or metadata-only info
   */
  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      const subjectResult = await searchOpenLibraryByPerson(
        actor.name,
        10,
        this.createTimeoutSignal()
      )

      if (subjectResult.works.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No works found about this person in Open Library",
        }
      }

      // Build death query for search-inside
      const deathYear = actor.deathday?.slice(0, 4) ?? ""
      const deathQuery = `"${actor.name}" death ${deathYear}`.trim()

      // Search inside books that have fulltext and IA identifiers
      const allHighlights: string[] = []

      for (const work of subjectResult.works) {
        if (!work.has_fulltext || !work.ia || work.ia.length === 0) {
          continue
        }

        const iaId = work.ia[0]
        try {
          const hits = await searchInsideBook(iaId, deathQuery, this.createTimeoutSignal())
          for (const hit of hits) {
            if (hit.highlight) {
              allHighlights.push(hit.highlight)
            }
          }
        } catch {
          // Search-inside can fail for individual books — continue to next
          continue
        }
      }

      if (allHighlights.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "No death-related passages found in available books",
        }
      }

      const combinedText = sanitizeSourceText(allHighlights.join("\n\n"))
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
          error: "No death keywords found in book passages",
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
