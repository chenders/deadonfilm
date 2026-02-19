/**
 * BBC News biography source.
 *
 * Searches for actor profiles and biographical content on bbc.com/bbc.co.uk
 * via DuckDuckGo site-restricted search, then fetches and cleans the article.
 *
 * Reliability tier: TIER_1_NEWS (0.95) - authoritative public service broadcaster.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import { searchDuckDuckGo } from "../../shared/duckduckgo-search.js"

const MIN_CONTENT_LENGTH = 200

export class BBCNewsBiographySource extends BaseBiographySource {
  readonly name = "BBC News"
  readonly type = BiographySourceType.BBC_NEWS_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.TIER_1_NEWS

  protected minDelayMs = 1500
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Step 1: Search DuckDuckGo for bbc.com pages about this actor
    const query = `site:bbc.com "${actor.name}" profile OR biography OR "life story"`
    const ddgResult = await searchDuckDuckGo({
      query,
      domainFilter: "bbc.com",
      additionalDomainFilters: ["bbc.co.uk"],
    })
    const urls = ddgResult.urls

    if (ddgResult.error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: ddgResult.error,
      }
    }

    if (urls.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { queryUsed: query }),
        data: null,
        error: "No BBC News results found via DuckDuckGo",
      }
    }

    // Step 2: Pick the first URL
    const targetUrl = urls[0]

    // Step 3: Fetch the page
    let pageHtml: string
    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
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
          error: `BBC page fetch failed: HTTP ${response.status}`,
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
        error: `BBC page fetch error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
          publication: "BBC",
          domain: "bbc.com",
        }),
        data: null,
        error: `BBC content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      }
    }

    // Step 6: Calculate biographical confidence
    const confidence = this.calculateBiographicalConfidence(text)

    // Step 7: Build result
    const articleTitle = metadata.title || `${actor.name} - BBC`

    const sourceData: RawBiographySourceData = {
      sourceName: "BBC News",
      sourceType: BiographySourceType.BBC_NEWS_BIO,
      text,
      url: targetUrl,
      confidence,
      reliabilityTier: this.reliabilityTier,
      reliabilityScore: this.reliabilityScore,
      publication: "BBC",
      articleTitle,
      domain: "bbc.com",
      contentType: "profile",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: targetUrl,
        queryUsed: query,
        publication: "BBC",
        articleTitle,
        domain: "bbc.com",
        contentType: "profile",
      }),
      data: sourceData,
    }
  }
}
