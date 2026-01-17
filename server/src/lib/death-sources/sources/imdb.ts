/**
 * IMDb source for death information.
 *
 * Scrapes IMDb bio pages to extract death-related information.
 * IMDb does not have a free public API, so web scraping is required.
 *
 * Free to use (web scraping).
 *
 * Note: IMDb may block scraping requests. If blocked, consider using
 * IMDbPro API (paid) or browser automation.
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const IMDB_BASE_URL = "https://www.imdb.com"

/**
 * IMDb source for death information from actor bio pages.
 * IMDb has comprehensive bio information including death details.
 */
export class IMDbSource extends BaseDataSource {
  readonly name = "IMDb"
  readonly type = DataSourceType.IMDB
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limit for scraping
  protected minDelayMs = 3000

  /**
   * Generate cache key including TMDB ID for lookups.
   */
  protected getCacheKey(actor: ActorForEnrichment): string {
    // Use TMDB ID if available for more consistent caching
    if (actor.tmdbId) {
      return `imdb:tmdb:${actor.tmdbId}:${actor.name}`
    }
    return `imdb:name:${actor.name}`
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      console.log(`IMDb lookup for: ${actor.name}`)

      // First, search for the actor to get their IMDb ID
      const imdbId = await this.findIMDbId(actor)

      if (!imdbId) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0),
          data: null,
          error: "Could not find IMDb ID for actor",
        }
      }

      console.log(`  Found IMDb ID: ${imdbId}`)

      // Fetch the bio page
      const bioUrl = `${IMDB_BASE_URL}/name/${imdbId}/bio`
      const bioData = await this.fetchBioPage(bioUrl)

      if (!bioData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, bioUrl),
          data: null,
          error: "Could not fetch bio page",
        }
      }

      // Extract death information
      const circumstances = this.extractDeathInfo(bioData, actor.name)
      const locationOfDeath = this.extractLocation(bioData)
      const notableFactors = this.extractNotableFactors(bioData)

      if (!circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, bioUrl),
          data: null,
          error: "No death information found in bio",
        }
      }

      // Calculate confidence
      let confidence = 0.6 // IMDb is generally reliable
      if (circumstances.length > 100) confidence += 0.1
      if (locationOfDeath) confidence += 0.1
      if (notableFactors.length > 0) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, Math.min(0.9, confidence), bioUrl),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors,
          relatedCelebrities: [],
          locationOfDeath,
          additionalContext: null,
        },
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Search IMDb to find the actor's IMDb ID.
   */
  private async findIMDbId(actor: ActorForEnrichment): Promise<string | null> {
    try {
      // Use IMDb's suggestion API for faster lookup
      const encodedName = encodeURIComponent(actor.name)
      const searchUrl = `https://v3.sg.media-imdb.com/suggestion/x/${encodedName}.json`

      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
      })

      if (response.status === 403 || response.status === 429) {
        throw new SourceAccessBlockedError(
          `IMDb returned ${response.status}`,
          this.type,
          searchUrl,
          response.status
        )
      }

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as {
        d?: Array<{
          id: string
          l: string // name
          s?: string // description
          q?: string // type (e.g., "actor")
        }>
      }

      if (!data.d || data.d.length === 0) {
        return null
      }

      // Find the best match - person entries start with "nm"
      const nameLower = actor.name.toLowerCase()
      for (const result of data.d) {
        if (!result.id.startsWith("nm")) continue

        // Check for name match
        if (result.l.toLowerCase() === nameLower) {
          return result.id
        }

        // Check for partial match (first/last name)
        const firstName = nameLower.split(" ")[0]
        if (result.l.toLowerCase().includes(firstName)) {
          return result.id
        }
      }

      // Return first person result if no exact match
      const firstPerson = data.d.find((r) => r.id.startsWith("nm"))
      return firstPerson?.id ?? null
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      return null
    }
  }

  /**
   * Fetch and parse the bio page.
   */
  private async fetchBioPage(url: string): Promise<string | null> {
    try {
      await this.waitForRateLimit()

      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      })

      if (response.status === 403 || response.status === 429) {
        throw new SourceAccessBlockedError(
          `IMDb returned ${response.status}`,
          this.type,
          url,
          response.status
        )
      }

      if (!response.ok) {
        return null
      }

      const html = await response.text()
      return this.extractBioText(html)
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      return null
    }
  }

  /**
   * Extract bio text from IMDb HTML.
   */
  private extractBioText(html: string): string | null {
    // Try to find the bio section
    const patterns = [
      // Modern IMDb layout - look for mini-bio or overview section
      /<section[^>]*data-testid="mini-bio"[^>]*>([\s\S]*?)<\/section>/i,
      /<div[^>]*class="[^"]*ipc-html-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      // Legacy layout patterns
      /<div[^>]*id="bio_content"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class="[^"]*soda[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ]

    let bioText = ""

    for (const pattern of patterns) {
      const matches = html.match(pattern)
      if (matches) {
        for (const match of Array.isArray(matches) ? matches : [matches]) {
          const text = htmlToText(match)
          if (text.length > 50) {
            bioText += " " + text
          }
        }
      }
    }

    // Also try to extract from JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i)
    if (jsonLdMatch) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1])
        if (jsonData.description) {
          bioText += " " + jsonData.description
        }
        if (jsonData.deathDate) {
          bioText += ` Died on ${jsonData.deathDate}`
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    return bioText.trim() || null
  }

  /**
   * Extract death information from bio text.
   */
  private extractDeathInfo(text: string, actorName: string): string | null {
    if (!text || text.length < 50) return null

    const sentences = text.split(/[.!?]+/).map((s) => s.trim())
    const deathSentences: string[] = []

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase()

      // Check for death keywords
      const hasDeath = DEATH_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))
      if (!hasDeath) continue

      // Check for name or pronoun references
      const hasName =
        lower.includes(actorName.toLowerCase()) ||
        lower.includes(actorName.split(" ")[0].toLowerCase()) ||
        lower.includes("he ") ||
        lower.includes("she ") ||
        lower.includes("his ") ||
        lower.includes("her ")

      if (hasName || deathSentences.length === 0) {
        deathSentences.push(sentence)
      }

      if (deathSentences.length >= 4) break
    }

    if (deathSentences.length === 0) return null

    return deathSentences.join(". ").trim()
  }

  /**
   * Extract location of death from text.
   */
  private extractLocation(text: string): string | null {
    if (!text) return null

    const patterns = [
      /died (?:at|in) ([A-Z][a-zA-Z\s,]{2,50})/i,
      /passed away (?:at|in) ([A-Z][a-zA-Z\s,]{2,50})/i,
      /(?:at (?:his|her|their) home in) ([A-Z][a-zA-Z\s,]{2,50})/i,
      /death (?:at|in) ([A-Z][a-zA-Z\s,]{2,50})/i,
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1].length < 60) {
        // Clean up the location string
        let location = match[1].trim()
        // Remove trailing words that aren't part of location
        location = location.replace(/\s+(from|after|following|due|at age|aged|on)\s*.*$/i, "")
        if (location.length > 3) {
          return location
        }
      }
    }

    return null
  }

  /**
   * Extract notable factors from text.
   */
  private extractNotableFactors(text: string): string[] {
    if (!text) return []

    const factors: string[] = []
    const lower = text.toLowerCase()

    for (const keyword of CIRCUMSTANCE_KEYWORDS) {
      if (lower.includes(keyword.toLowerCase())) {
        factors.push(keyword)
      }
    }

    return [...new Set(factors)].slice(0, 5)
  }
}
