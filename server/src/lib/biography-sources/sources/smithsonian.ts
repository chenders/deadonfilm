/**
 * Smithsonian Magazine biography source.
 *
 * Searches for biographical profiles and historical articles on smithsonianmag.com
 * via web search (Google CSE with DDG fallback), fetches with archive fallback
 * on block, and cleans the article.
 *
 * Reliability tier: TRADE_PRESS (0.9) — Smithsonian Institution publication,
 * domain-specific authority on history, science, and culture.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { webSearch } from "../../shared/duckduckgo-search.js"
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"

const MIN_CONTENT_LENGTH = 200

export class SmithsonianBiographySource extends BaseBiographySource {
  readonly name = "Smithsonian Magazine"
  readonly type = BiographySourceType.SMITHSONIAN_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TRADE_PRESS

  protected minDelayMs = 2000
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search for smithsonianmag.com pages about this actor (Google CSE → DDG fallback)
    const query = `site:smithsonianmag.com "${actor.name}" biography OR profile`
    const searchResult = await webSearch({
      query,
      domainFilter: "smithsonianmag.com",
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
        error: "No Smithsonian Magazine results found via web search",
      }
    }

    // Step 2: Pick the best URL (prefer /history/ and /biography/ paths)
    const targetUrl = this.pickBestUrl(urls)

    // Step 3: Fetch the page (with archive fallback on block)
    const pageResult = await fetchPageWithFallbacks(targetUrl, {
      userAgent: this.userAgent,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
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
        error: `Smithsonian Magazine page fetch failed: ${pageResult.error || "empty content"}`,
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
          publication: "Smithsonian Magazine",
          domain: "smithsonianmag.com",
        }),
        data: null,
        error: `Smithsonian Magazine content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle =
      metadata.title || pageResult.title || `${actor.name} - Smithsonian Magazine`

    const sourceData: RawBiographySourceData = {
      sourceName: "Smithsonian Magazine",
      sourceType: BiographySourceType.SMITHSONIAN_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "Smithsonian Magazine",
      articleTitle,
      domain: "smithsonianmag.com",
      contentType: "profile",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "Smithsonian Magazine",
        articleTitle,
        domain: "smithsonianmag.com",
        contentType: "profile",
      }),
      data: sourceData,
    }
  }

  /**
   * Pick the best URL from candidates.
   * Smithsonian Magazine uses /history/, /biography/, and /people-places/ paths for biographical content.
   */
  private pickBestUrl(urls: string[]): string {
    const bioUrl = urls.find(
      (u) => u.includes("/history/") || u.includes("/biography/") || u.includes("/people-places/")
    )
    return bioUrl ?? urls[0]
  }
}
