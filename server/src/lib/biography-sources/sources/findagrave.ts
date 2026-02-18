/**
 * Find a Grave biography source.
 *
 * Searches Find a Grave for memorial pages, which often contain biographical
 * information submitted by family members and researchers.
 *
 * Uses the Find a Grave search API with name and date parameters to find
 * matching memorials, then extracts biographical content from the bio section.
 *
 * Reliability tier: UNRELIABLE_UGC (0.35) - user-generated content with
 * no editorial oversight; quality varies widely.
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import type { ActorForBiography, RawBiographySourceData } from "../types.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { mechanicalPreClean } from "../content-cleaner.js"

const FINDAGRAVE_SEARCH_URL = "https://www.findagrave.com/memorial/search"
const FINDAGRAVE_BASE_URL = "https://www.findagrave.com"
const MIN_CONTENT_LENGTH = 100

/**
 * Find a Grave biography source for memorial-based biographical content.
 */
export class FindAGraveBiographySource extends BaseBiographySource {
  readonly name = "Find a Grave"
  readonly type = BiographySourceType.FINDAGRAVE_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.UNRELIABLE_UGC

  protected minDelayMs = 2000
  protected requestTimeoutMs = 15000

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Split name into first/last for search parameters
    const nameParts = actor.name.split(" ")
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(" ")

    if (!lastName) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Cannot search with single name",
      }
    }

    // Build search URL with name and date params
    const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
    const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

    const searchParams = new URLSearchParams({
      firstname: firstName,
      lastname: lastName,
    })

    if (birthYear) {
      searchParams.set("birthyear", String(birthYear))
    }
    if (deathYear) {
      searchParams.set("deathyear", String(deathYear))
    }

    const searchUrl = `${FINDAGRAVE_SEARCH_URL}?${searchParams.toString()}`

    try {
      // Step 1: Search for memorial
      const searchResponse = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!searchResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { url: searchUrl }),
          data: null,
          error: `Search failed: HTTP ${searchResponse.status}`,
        }
      }

      const searchHtml = await searchResponse.text()

      // Step 2: Find memorial link matching actor name
      const memorialUrl = this.extractMemorialUrl(searchHtml, actor)

      if (!memorialUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { url: searchUrl }),
          data: null,
          error: "No matching memorial found",
        }
      }

      // Step 3: Fetch the memorial page
      await this.waitForRateLimit()

      const memorialResponse = await fetch(memorialUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
        signal: this.createTimeoutSignal(),
      })

      if (!memorialResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { url: memorialUrl }),
          data: null,
          error: `Memorial page failed: HTTP ${memorialResponse.status}`,
        }
      }

      const memorialHtml = await memorialResponse.text()

      // Step 4: Extract bio section from HTML
      const bioHtml = this.extractBioSection(memorialHtml)

      if (!bioHtml) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, { url: memorialUrl }),
          data: null,
          error: "No bio section found on memorial page",
        }
      }

      // Step 5: Run bio through mechanical pre-clean
      const { text } = mechanicalPreClean(bioHtml)

      if (text.length < MIN_CONTENT_LENGTH) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, {
            url: memorialUrl,
            publication: "Find a Grave",
            domain: "findagrave.com",
          }),
          data: null,
          error: `Find a Grave content too short (${text.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
        }
      }

      // Step 6: Calculate biographical confidence
      const confidence = this.calculateBiographicalConfidence(text)

      // Step 7: Build result
      const sourceData: RawBiographySourceData = {
        sourceName: "Find a Grave",
        sourceType: BiographySourceType.FINDAGRAVE_BIO,
        text,
        url: memorialUrl,
        confidence,
        reliabilityTier: this.reliabilityTier,
        reliabilityScore: this.reliabilityScore,
        publication: "Find a Grave",
        articleTitle: `${actor.name} Memorial`,
        domain: "findagrave.com",
        contentType: "obituary",
      }

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, {
          url: memorialUrl,
          publication: "Find a Grave",
          articleTitle: `${actor.name} Memorial`,
          domain: "findagrave.com",
          contentType: "obituary",
        }),
        data: sourceData,
      }
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { url: searchUrl }),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Extract memorial URL from search results.
   * Returns null if no result matches the actor's name to avoid returning wrong people.
   */
  private extractMemorialUrl(html: string, actor: ActorForBiography): string | null {
    // Look for memorial links in search results
    const memorialRegex = /href="(\/memorial\/\d+\/[^"]+)"/g
    const matches: string[] = []

    let match
    while ((match = memorialRegex.exec(html)) !== null) {
      matches.push(match[1])
    }

    if (matches.length === 0) {
      return null
    }

    // Normalize actor name parts for matching
    const nameParts = actor.name.toLowerCase().split(/\s+/)
    const firstName = nameParts[0]?.replace(/[^a-z]/g, "") || ""
    const lastName = nameParts[nameParts.length - 1]?.replace(/[^a-z]/g, "") || ""
    const fullNameNormalized = actor.name.toLowerCase().replace(/[^a-z]/g, "")

    for (const memorialPath of matches) {
      // Extract name from URL path (e.g., "/memorial/12345/john-smith" -> "johnsmith")
      const urlName = memorialPath.split("/").pop()?.replace(/-/g, "").toLowerCase() || ""

      // Check for full name match
      if (urlName.includes(fullNameNormalized) || fullNameNormalized.includes(urlName)) {
        return `${FINDAGRAVE_BASE_URL}${memorialPath}`
      }

      // Check for first AND last name both present in the URL
      if (firstName.length >= 2 && lastName.length >= 2) {
        if (urlName.includes(firstName) && urlName.includes(lastName)) {
          return `${FINDAGRAVE_BASE_URL}${memorialPath}`
        }
      }
    }

    // No matching memorial found
    return null
  }

  /**
   * Extract the bio section from memorial page HTML.
   * Looks for the div with id="bio" which contains the biographical content.
   */
  private extractBioSection(html: string): string | null {
    const bioMatch = html.match(/<div[^>]*id="bio"[^>]*>([\s\S]*?)<\/div>/i)
    if (bioMatch) {
      return bioMatch[1]
    }

    // Fallback: look for obituary/memorial text sections
    const fallbackMatch = html.match(
      /<div[^>]*class="[^"]*(?:obituary|memorial-text|bio-text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    )
    if (fallbackMatch) {
      return fallbackMatch[1]
    }

    return null
  }
}
