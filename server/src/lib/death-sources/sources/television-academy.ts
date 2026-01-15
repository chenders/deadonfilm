/**
 * Television Academy In Memoriam source for TV industry deaths.
 *
 * The Television Academy maintains an official In Memoriam database
 * of deceased television professionals. Provides:
 * - Official death dates
 * - Birth dates and locations
 * - Professional roles/credits
 * - Links to external obituaries (Hollywood Reporter, Variety, etc.)
 *
 * This is an authoritative source for TV industry professionals.
 * Free to access via web scraping (no API key required).
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"
import { htmlToText } from "../html-utils.js"

const TV_ACADEMY_BASE_URL = "https://www.televisionacademy.com"
const IN_MEMORIAM_URL = `${TV_ACADEMY_BASE_URL}/in-memoriam`

/**
 * Television Academy In Memoriam source.
 */
export class TelevisionAcademySource extends BaseDataSource {
  readonly name = "Television Academy In Memoriam"
  readonly type = DataSourceType.TELEVISION_ACADEMY
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Respectful rate limit
  protected minDelayMs = 1500

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    try {
      console.log(`Television Academy search for: ${actor.name}`)

      // First, try to find the actor in the In Memoriam listing
      const bioUrl = await this.findActorBioUrl(actor)

      if (!bioUrl) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, IN_MEMORIAM_URL),
          data: null,
          error: "Actor not found in Television Academy In Memoriam",
        }
      }

      console.log(`  Found bio page: ${bioUrl}`)

      // Fetch the bio page
      await this.waitForRateLimit()
      const bioData = await this.fetchBioPage(bioUrl)

      if (!bioData) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0.1, bioUrl),
          data: null,
          error: "Could not parse bio page",
        }
      }

      // TV Academy doesn't typically have cause of death, but has career info
      // and links to external obituaries
      const circumstances = bioData.careerSummary || null
      const additionalContext =
        bioData.obituaryLinks.length > 0
          ? `External obituaries: ${bioData.obituaryLinks.join(", ")}`
          : null

      // Calculate confidence - lower because no cause of death typically
      let confidence = 0.4 // Authoritative source for dates
      if (bioData.deathDate) confidence += 0.1
      if (bioData.birthDate) confidence += 0.1
      if (bioData.obituaryLinks.length > 0) confidence += 0.1

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, bioUrl, undefined, bioData),
        data: {
          circumstances,
          rumoredCircumstances: null,
          notableFactors: bioData.professions,
          relatedCelebrities: [],
          locationOfDeath: bioData.birthLocation, // Often same as death location for older actors
          additionalContext,
        },
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, IN_MEMORIAM_URL),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Find the actor's bio URL from the In Memoriam page.
   */
  private async findActorBioUrl(actor: ActorForEnrichment): Promise<string | null> {
    // Generate potential bio URL slug from name
    // Format: /bios/{first-last} or /bios/{first-middle-last}
    const slug = this.nameToSlug(actor.name)
    const directUrl = `${TV_ACADEMY_BASE_URL}/bios/${slug}`

    // Try direct URL first (faster)
    try {
      const response = await fetch(directUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": this.userAgent,
        },
      })

      if (response.ok) {
        return directUrl
      }

      if (response.status === 403) {
        throw new SourceAccessBlockedError(
          `Television Academy returned 403 Forbidden`,
          this.type,
          directUrl,
          403
        )
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      // Continue to search fallback
    }

    // Fallback: search the In Memoriam page
    await this.waitForRateLimit()

    try {
      const response = await fetch(IN_MEMORIAM_URL, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (response.status === 403) {
        throw new SourceAccessBlockedError(
          `Television Academy returned 403 Forbidden`,
          this.type,
          IN_MEMORIAM_URL,
          403
        )
      }

      if (!response.ok) {
        return null
      }

      const html = await response.text()
      return this.findBioLinkInHtml(html, actor)
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      return null
    }
  }

  /**
   * Convert actor name to URL slug.
   */
  private nameToSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/['']/g, "") // Remove apostrophes
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .replace(/\s+/g, "-") // Spaces to hyphens
      .replace(/-+/g, "-") // Collapse multiple hyphens
      .trim()
  }

  /**
   * Find bio link in the In Memoriam HTML.
   */
  private findBioLinkInHtml(html: string, actor: ActorForEnrichment): string | null {
    // Look for links to /bios/ pages
    const bioLinkPattern = /href="(\/bios\/[^"]+)"/g
    const links: string[] = []

    let match
    while ((match = bioLinkPattern.exec(html)) !== null) {
      links.push(match[1])
    }

    // Try to find matching name
    const normalizedName = actor.name.toLowerCase().replace(/[^a-z]/g, "")

    for (const link of links) {
      const linkName = link.replace("/bios/", "").replace(/-/g, "")
      if (
        linkName === normalizedName ||
        normalizedName.includes(linkName) ||
        linkName.includes(normalizedName)
      ) {
        return `${TV_ACADEMY_BASE_URL}${link}`
      }
    }

    // Also search for name in text near bio links
    const nameParts = actor.name.split(" ")
    const lastName = nameParts[nameParts.length - 1].toLowerCase()

    for (const link of links) {
      if (link.toLowerCase().includes(lastName)) {
        return `${TV_ACADEMY_BASE_URL}${link}`
      }
    }

    return null
  }

  /**
   * Fetch and parse a bio page.
   */
  private async fetchBioPage(url: string): Promise<BioPageData | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml",
        },
      })

      if (response.status === 403) {
        throw new SourceAccessBlockedError(
          `Television Academy returned 403 Forbidden`,
          this.type,
          url,
          403
        )
      }

      if (!response.ok) {
        return null
      }

      const html = await response.text()
      return this.parseBioPage(html)
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      return null
    }
  }

  /**
   * Parse bio page HTML.
   */
  private parseBioPage(html: string): BioPageData {
    const data: BioPageData = {
      name: null,
      birthDate: null,
      birthLocation: null,
      deathDate: null,
      professions: [],
      careerSummary: null,
      obituaryLinks: [],
    }

    // Extract name from title or heading
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
    if (titleMatch) {
      data.name = this.cleanHtml(titleMatch[1])
        .replace(/\s*\|.*$/, "")
        .trim()
    }

    // Extract dates - look for common patterns
    // "Born: June 8, 1957" or "Born June 8, 1957"
    const birthMatch = html.match(/Born:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i)
    if (birthMatch) {
      data.birthDate = birthMatch[1]
    }

    // "Died: January 13, 2026" or "Date of Passing: January 13, 2026"
    const deathPatterns = [
      /Died:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
      /Date of Passing:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
      /Passed:?\s*([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/i,
    ]
    for (const pattern of deathPatterns) {
      const match = html.match(pattern)
      if (match) {
        data.deathDate = match[1]
        break
      }
    }

    // Extract birth location
    const locationMatch = html.match(/(?:Born|in)\s+([A-Z][a-zA-Z\s,]+(?:,\s*[A-Z][a-zA-Z\s]+)?)/i)
    if (locationMatch) {
      const location = locationMatch[1].trim()
      if (location.length < 60 && !location.match(/^\d/)) {
        data.birthLocation = location
      }
    }

    // Extract professions from the page
    const professionPatterns = [
      /(?:was a|worked as|known as)\s+([a-zA-Z,\s]+?)(?:\.|,\s+who)/i,
      /class="[^"]*profession[^"]*"[^>]*>([^<]+)</i,
    ]
    for (const pattern of professionPatterns) {
      const match = html.match(pattern)
      if (match) {
        const profs = match[1]
          .split(/[,&]/)
          .map((p) => p.trim().toLowerCase())
          .filter((p) => p.length > 2 && p.length < 30)
        data.professions.push(...profs)
      }
    }

    // Extract career summary - look for biography section
    const bioPatterns = [
      /<div[^>]*class="[^"]*bio[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class="[^"]*biography[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
      /<section[^>]*class="[^"]*about[^"]*"[^>]*>([\s\S]*?)<\/section>/i,
    ]
    for (const pattern of bioPatterns) {
      const match = html.match(pattern)
      if (match) {
        const text = this.cleanHtml(match[1])
        if (text.length > 50) {
          data.careerSummary = text.substring(0, 500)
          break
        }
      }
    }

    // If no specific bio section, look for any paragraph describing the person
    if (!data.careerSummary) {
      const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []
      for (const p of paragraphs) {
        const text = this.cleanHtml(p)
        if (
          text.length > 100 &&
          (text.includes("was") || text.includes("worked") || text.includes("known"))
        ) {
          data.careerSummary = text.substring(0, 500)
          break
        }
      }
    }

    // Extract external obituary links
    const externalLinkPatterns = [
      /href="(https?:\/\/(?:www\.)?(?:hollywoodreporter|variety|deadline|ew)\.com[^"]+)"/gi,
      /href="(https?:\/\/[^"]*obituar[^"]+)"/gi,
    ]
    for (const pattern of externalLinkPatterns) {
      let linkMatch
      while ((linkMatch = pattern.exec(html)) !== null) {
        if (!data.obituaryLinks.includes(linkMatch[1])) {
          data.obituaryLinks.push(linkMatch[1])
        }
      }
    }

    return data
  }

  /**
   * Clean HTML tags and entities.
   */
  private cleanHtml(html: string): string {
    return htmlToText(html)
  }
}

interface BioPageData {
  name: string | null
  birthDate: string | null
  birthLocation: string | null
  deathDate: string | null
  professions: string[]
  careerSummary: string | null
  obituaryLinks: string[]
}
