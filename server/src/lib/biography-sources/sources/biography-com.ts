/**
 * Biography.com source.
 *
 * Searches for actor profiles on biography.com via DuckDuckGo site-restricted
 * search, fetches the profile page, and cleans it.
 *
 * Reliability tier: SECONDARY_COMPILATION (0.85) - curated biographical profiles.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { searchDuckDuckGo } from "../../shared/duckduckgo-search.js"

const MIN_CONTENT_LENGTH = 200

export class BiographyComSource extends BaseBiographySource {
  readonly name = "Biography.com"
  readonly type = BiographySourceType.BIOGRAPHY_COM
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  protected minDelayMs = 1500
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search DuckDuckGo for biography.com pages about this actor
    const query = `site:biography.com "${actor.name}"`
    const ddgResult = await searchDuckDuckGo({
      query,
      domainFilter: "biography.com",
    })
    const urls = ddgResult.urls

    if (urls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: "No Biography.com results found via DuckDuckGo",
      }
    }

    // Step 2: Pick the best URL (prefer profile-like paths, not list pages)
    const targetUrl = this.pickBestUrl(urls)

    // Step 3: Fetch the page
    let pageHtml: string
    try {
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": this.userAgent },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: targetUrl,
            queryUsed: query,
          }),
          data: null,
          error: `Biography.com page fetch failed: HTTP ${response.status}`,
        }
      }

      pageHtml = await response.text()
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, {
          url: targetUrl,
          queryUsed: query,
        }),
        data: null,
        error: `Biography.com page fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }

    // Step 4: Clean through mechanical pre-clean pipeline
    const { text, metadata } = mechanicalPreClean(pageHtml)

    // Step 5: Check minimum content length
    if (text.length < MIN_CONTENT_LENGTH) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, {
          url: targetUrl,
          queryUsed: query,
          publication: "Biography.com",
          domain: "biography.com",
        }),
        data: null,
        error: `Biography.com content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || `${actor.name} - Biography.com`

    const sourceData: RawBiographySourceData = {
      sourceName: "Biography.com",
      sourceType: BiographySourceType.BIOGRAPHY_COM,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "Biography.com",
      articleTitle,
      domain: "biography.com",
      contentType: "biography",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "Biography.com",
        articleTitle,
        domain: "biography.com",
        contentType: "biography",
      }),
      data: sourceData,
    }
  }

  /**
   * Pick the best URL from candidates. Prefer profile paths over list/category pages.
   */
  private pickBestUrl(urls: string[]): string {
    // Avoid list/category pages
    const listPatterns = ["/lists/", "/news/", "/video/", "/gallery/"]
    const profileUrl = urls.find((u) => !listPatterns.some((pattern) => u.includes(pattern)))
    return profileUrl ?? urls[0]
  }
}
