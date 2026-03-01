/**
 * PBS biography source.
 *
 * Searches for actor profiles and biographical content on pbs.org
 * via web search (Google CSE with DDG fallback), fetches with archive fallback
 * on block, and cleans the article.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - authoritative public broadcaster.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { webSearch } from "../../shared/duckduckgo-search.js"
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"

const MIN_CONTENT_LENGTH = 200

export class PBSBiographySource extends BaseBiographySource {
  readonly name = "PBS"
  readonly type = BiographySourceType.PBS_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  protected minDelayMs = 1500
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search for pbs.org pages about this actor (Google CSE -> DDG fallback)
    const query = `site:pbs.org "${actor.name}" profile OR biography OR interview`
    const searchResult = await webSearch({
      query,
      domainFilter: "pbs.org",
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
        error: "No PBS results found via web search",
      }
    }

    // Step 2: Pick the best URL (prefer WGBH, NewsHour, Frontline, Independent Lens paths)
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
        error: `PBS page fetch failed: ${pageResult.error || "empty content"}`,
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
          publication: "PBS",
          domain: "pbs.org",
        }),
        data: null,
        error: `PBS content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || pageResult.title || `${actor.name} - PBS`

    const sourceData: RawBiographySourceData = {
      sourceName: "PBS",
      sourceType: BiographySourceType.PBS_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "PBS",
      articleTitle,
      domain: "pbs.org",
      contentType: "profile",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "PBS",
        articleTitle,
        domain: "pbs.org",
        contentType: "profile",
      }),
      data: sourceData,
    }
  }

  /**
   * Pick the best URL from candidates.
   * PBS uses paths like /wgbh/..., /newshour/..., /frontline/..., /independentlens/...
   */
  private pickBestUrl(urls: string[]): string {
    const articleUrl = urls.find(
      (u) =>
        u.includes("/wgbh/") ||
        u.includes("/newshour/") ||
        u.includes("/frontline/") ||
        u.includes("/independentlens/")
    )
    return articleUrl ?? urls[0]
  }
}
