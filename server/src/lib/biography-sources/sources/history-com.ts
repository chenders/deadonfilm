/**
 * History.com biography source.
 *
 * Searches for biographical content on history.com via web search
 * (Google CSE with DDG fallback), fetches with archive fallback on block,
 * and cleans the article.
 *
 * Reliability tier: TRADE_PRESS (0.9) — A+E Networks, editorially curated
 * history content.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { webSearch } from "../../shared/duckduckgo-search.js"
import { fetchPageWithFallbacks } from "../../shared/fetch-page-with-fallbacks.js"

const MIN_CONTENT_LENGTH = 200

export class HistoryComBiographySource extends BaseBiographySource {
  readonly name = "History.com"
  readonly type = BiographySourceType.HISTORY_COM_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TRADE_PRESS

  protected minDelayMs = 2000
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search for history.com pages about this actor (Google CSE → DDG fallback)
    const query = `site:history.com "${actor.name}" biography`
    const searchResult = await webSearch({
      query,
      domainFilter: "history.com",
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
        error: "No History.com results found via web search",
      }
    }

    // Step 2: Pick the best URL (prefer /topics/ curated content pages)
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
        error: `History.com page fetch failed: ${pageResult.error || "empty content"}`,
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
          publication: "History.com",
          domain: "history.com",
        }),
        data: null,
        error: `History.com content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || pageResult.title || `${actor.name} - History.com`

    const sourceData: RawBiographySourceData = {
      sourceName: "History.com",
      sourceType: BiographySourceType.HISTORY_COM_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "History.com",
      articleTitle,
      domain: "history.com",
      contentType: "profile",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "History.com",
        articleTitle,
        domain: "history.com",
        contentType: "profile",
      }),
      data: sourceData,
    }
  }

  /**
   * Pick the best URL from candidates.
   * History.com uses /topics/, /biographies/, and /people/ paths for curated biographical content.
   */
  private pickBestUrl(urls: string[]): string {
    const topicsUrl = urls.find(
      (u) => u.includes("/topics/") || u.includes("/biographies/") || u.includes("/people/")
    )
    return topicsUrl ?? urls[0]
  }
}
