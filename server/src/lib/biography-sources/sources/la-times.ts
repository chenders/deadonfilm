/**
 * LA Times biography source.
 *
 * Searches for actor profiles and biographical content on latimes.com
 * via web search (Google CSE with DDG fallback), fetches with archive fallback
 * on block, and cleans the article.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - major metropolitan newspaper.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { webSearch } from "../../shared/duckduckgo-search.js"
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"

const MIN_CONTENT_LENGTH = 200

export class LATimesBiographySource extends BaseBiographySource {
  readonly name = "Los Angeles Times"
  readonly type = BiographySourceType.LA_TIMES_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  protected minDelayMs = 2000
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search for latimes.com pages about this actor (Google CSE -> DDG fallback)
    const query = `site:latimes.com "${actor.name}" profile OR biography OR interview`
    const searchResult = await webSearch({
      query,
      domainFilter: "latimes.com",
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
        error: "No Los Angeles Times results found via web search",
      }
    }

    // Step 2: Pick the best URL (prefer article-like paths)
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
        error: `Los Angeles Times page fetch failed: ${pageResult.error || "empty content"}`,
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
          publication: "Los Angeles Times",
          domain: "latimes.com",
        }),
        data: null,
        error: `Los Angeles Times content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || pageResult.title || `${actor.name} - Los Angeles Times`

    const sourceData: RawBiographySourceData = {
      sourceName: "Los Angeles Times",
      sourceType: BiographySourceType.LA_TIMES_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "Los Angeles Times",
      articleTitle,
      domain: "latimes.com",
      contentType: "profile",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "Los Angeles Times",
        articleTitle,
        domain: "latimes.com",
        contentType: "profile",
      }),
      data: sourceData,
    }
  }

  /**
   * Pick the best URL from candidates.
   * LA Times uses paths like /entertainment/, /obituaries/, /california/, /world-nation/
   */
  private pickBestUrl(urls: string[]): string {
    const articleUrl = urls.find(
      (u) =>
        u.includes("/entertainment/") ||
        u.includes("/obituaries/") ||
        u.includes("/california/") ||
        u.includes("/world-nation/")
    )
    return articleUrl ?? urls[0]
  }
}
