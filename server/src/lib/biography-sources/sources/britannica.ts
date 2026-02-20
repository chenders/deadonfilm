/**
 * Britannica biography source.
 *
 * Searches for actor biographies on britannica.com via web search (Google CSE
 * with DDG fallback), fetches the article with archive fallback on block,
 * and cleans it through the content cleaning pipeline.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - Britannica is an authoritative encyclopedia.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { webSearch } from "../../shared/duckduckgo-search.js"
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"

const MIN_CONTENT_LENGTH = 200

export class BritannicaBiographySource extends BaseBiographySource {
  readonly name = "Britannica"
  readonly type = BiographySourceType.BRITANNICA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  protected minDelayMs = 1500
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search for britannica.com pages about this actor (Google CSE → DDG fallback)
    const query = `site:britannica.com "${actor.name}" biography`
    const searchResult = await webSearch({
      query,
      domainFilter: "britannica.com",
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
        error: "No Britannica results found via web search",
      }
    }

    // Step 2: Pick the best URL (prefer /biography/ paths)
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
        error: `Britannica page fetch failed: ${pageResult.error || "empty content"}`,
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
          publication: "Encyclopaedia Britannica",
          domain: "britannica.com",
        }),
        data: null,
        error: `Britannica content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || `${actor.name} - Britannica`

    const sourceData: RawBiographySourceData = {
      sourceName: "Britannica",
      sourceType: BiographySourceType.BRITANNICA,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "Encyclopaedia Britannica",
      articleTitle,
      domain: "britannica.com",
      contentType: "biography",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "Encyclopaedia Britannica",
        articleTitle,
        domain: "britannica.com",
        contentType: "biography",
      }),
      data: sourceData,
    }
  }

  /**
   * Pick the best URL from candidates. Prefer /biography/ paths.
   */
  private pickBestUrl(urls: string[]): string {
    const biographyUrl = urls.find((u) => u.includes("/biography/"))
    return biographyUrl ?? urls[0]
  }
}
