/**
 * Biography.com source.
 *
 * Searches for actor profiles on biography.com via web search (Google CSE with
 * DDG fallback), fetches with archive fallback on block, and cleans the page.
 *
 * Reliability tier: SECONDARY_COMPILATION (0.85) - curated biographical profiles.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { webSearch } from "../../shared/duckduckgo-search.js"
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"

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

    // Step 1: Search for biography.com pages about this actor (Google CSE → DDG fallback)
    const query = `site:biography.com "${actor.name}"`
    const searchResult = await webSearch({
      query,
      domainFilter: "biography.com",
    })
    const urls = searchResult.urls

    if (searchResult.error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: searchResult.error,
      }
    }

    if (urls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: "No Biography.com results found via web search",
      }
    }

    // Step 2: Pick the best URL (prefer profile-like paths, not list pages)
    const targetUrl = this.pickBestUrl(urls)

    // Step 3: Fetch the page (with archive fallback on block)
    const pageResult = await fetchPageWithFallbacks(targetUrl, {
      userAgent: this.userAgent,
      timeoutMs: this.requestTimeoutMs,
    })

    if (pageResult.error || !pageResult.content) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, {
          url: targetUrl,
          queryUsed: query,
        }),
        data: null,
        error: `Biography.com page fetch failed: ${pageResult.error || "empty content"}`,
      }
    }

    const pageHtml = pageResult.content

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
