/**
 * Legacy.com biography source.
 *
 * Searches Legacy.com for obituaries, which often contain extensive biographical
 * detail including family background, education, military service, career highlights,
 * and personal interests.
 *
 * Uses DuckDuckGo site-restricted search to find obituary pages, then fetches
 * and cleans them through the content cleaning pipeline.
 *
 * Reliability tier: MARGINAL_MIXED (0.6) - user-submitted obituaries with
 * editorial oversight; quality varies.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { searchDuckDuckGo } from "../../shared/duckduckgo-search.js"

const MIN_CONTENT_LENGTH = 200

/**
 * Legacy.com biography source for obituary-based biographical content.
 */
export class LegacyBiographySource extends BaseBiographySource {
  readonly name = "Legacy.com"
  readonly type = BiographySourceType.LEGACY_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.MARGINAL_MIXED

  protected minDelayMs = 2000
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search DuckDuckGo for Legacy.com obituary pages
    const query = `site:legacy.com "${actor.name}" obituary`
    const ddgResult = await searchDuckDuckGo({
      query,
      domainFilter: "legacy.com",
    })
    const urls = ddgResult.urls

    if (urls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: "No Legacy.com results found via DuckDuckGo",
      }
    }

    // Step 2: Pick the best URL (prefer /obituaries/ paths)
    const targetUrl = this.pickBestUrl(urls)

    // Step 3: Fetch the obituary page
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
          error: `Legacy.com page fetch failed: HTTP ${response.status}`,
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
        error: `Legacy.com page fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
          publication: "Legacy.com",
          domain: "legacy.com",
        }),
        data: null,
        error: `Legacy.com content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || `${actor.name} Obituary - Legacy.com`

    const sourceData: RawBiographySourceData = {
      sourceName: "Legacy.com",
      sourceType: BiographySourceType.LEGACY_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "Legacy.com",
      articleTitle,
      domain: "legacy.com",
      contentType: "obituary",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "Legacy.com",
        articleTitle,
        domain: "legacy.com",
        contentType: "obituary",
      }),
      data: sourceData,
    }
  }

  /**
   * Pick the best URL from candidates. Prefer /obituaries/ paths.
   */
  private pickBestUrl(urls: string[]): string {
    const obituaryUrl = urls.find((u) => u.includes("/obituaries/"))
    return obituaryUrl ?? urls[0]
  }
}
