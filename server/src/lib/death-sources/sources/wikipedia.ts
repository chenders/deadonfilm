/**
 * Wikipedia source for death information.
 *
 * Fetches Wikipedia articles and extracts the Death section (or Personal life
 * section as fallback) to get detailed death circumstances.
 *
 * Uses the Wikipedia API to get article content in a parseable format.
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult, EnrichedDeathInfo } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

const WIKIPEDIA_API_BASE = "https://en.wikipedia.org/w/api.php"

interface WikipediaSection {
  index: string
  line: string
  level: string
  anchor: string
}

interface WikipediaSectionsResponse {
  parse?: {
    title: string
    pageid: number
    sections: WikipediaSection[]
  }
  error?: {
    code: string
    info: string
  }
}

interface WikipediaSectionContentResponse {
  parse?: {
    title: string
    pageid: number
    text: {
      "*": string
    }
  }
  error?: {
    code: string
    info: string
  }
}

export class WikipediaSource extends BaseDataSource {
  readonly name = "Wikipedia"
  readonly type = DataSourceType.WIKIPEDIA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  protected minDelayMs = 500 // Wikipedia is generous with rate limits

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    console.log(`Wikipedia search for: ${actor.name}`)

    try {
      // Construct Wikipedia article title from actor name
      const articleTitle = this.buildArticleTitle(actor.name)

      // First, get the list of sections to find Death/Personal life
      const sectionsUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&prop=sections&format=json`

      const sectionsResponse = await fetch(sectionsUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
      })

      if (!sectionsResponse.ok) {
        if (sectionsResponse.status === 403) {
          throw new SourceAccessBlockedError(
            "Wikipedia API blocked request",
            this.type,
            sectionsUrl,
            403
          )
        }
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: `HTTP ${sectionsResponse.status}`,
        }
      }

      const sectionsData = (await sectionsResponse.json()) as WikipediaSectionsResponse

      if (sectionsData.error) {
        // Article not found
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: `Article not found: ${sectionsData.error.info}`,
        }
      }

      if (!sectionsData.parse?.sections) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: "No sections found in article",
        }
      }

      // Find the Death section (or fallback sections)
      const deathSection = this.findDeathSection(sectionsData.parse.sections)

      if (!deathSection) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: "No death section found in article",
        }
      }

      console.log(`  Found section: "${deathSection.line}" (index ${deathSection.index})`)

      // Fetch the content of the death section
      const contentUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&section=${deathSection.index}&prop=text&format=json`

      const contentResponse = await fetch(contentUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
      })

      if (!contentResponse.ok) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, contentUrl),
          data: null,
          error: `Failed to fetch section content: HTTP ${contentResponse.status}`,
        }
      }

      const contentData = (await contentResponse.json()) as WikipediaSectionContentResponse

      if (!contentData.parse?.text?.["*"]) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, contentUrl),
          data: null,
          error: "No content in section",
        }
      }

      // Parse the HTML content
      const htmlContent = contentData.parse.text["*"]
      const textContent = this.extractTextFromHtml(htmlContent)
      const cleanedText = this.cleanWikipediaText(textContent)

      if (!cleanedText || cleanedText.length < 50) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, contentUrl),
          data: null,
          error: "Death section has insufficient content",
        }
      }

      // Extract death information
      const deathInfo = this.extractDeathInfo(cleanedText, actor)
      const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`

      // Calculate confidence based on content quality
      const confidence = this.calculateDeathConfidence(cleanedText, actor)

      console.log(`  Extracted ${cleanedText.length} chars, confidence: ${confidence.toFixed(2)}`)

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, articleUrl, articleTitle, {
          sectionTitle: deathSection.line,
          textLength: cleanedText.length,
        }),
        data: deathInfo,
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: errorMessage,
      }
    }
  }

  /**
   * Build Wikipedia article title from actor name.
   * Wikipedia uses underscores for spaces and specific capitalization.
   */
  private buildArticleTitle(name: string): string {
    // Replace spaces with underscores, keep original capitalization
    return name.replace(/ /g, "_")
  }

  /**
   * Find the Death section or suitable fallback.
   */
  private findDeathSection(sections: WikipediaSection[]): WikipediaSection | null {
    // Priority order for sections
    const sectionPriority = [
      /^death$/i,
      /^death and legacy$/i,
      /^death and funeral$/i,
      /^death and aftermath$/i,
      /^later life and death$/i,
      /^final years and death$/i,
      /^illness and death$/i,
      /^personal life$/i, // Sometimes death info is in Personal life
      /^later life$/i,
      /^final years$/i,
    ]

    for (const pattern of sectionPriority) {
      const section = sections.find((s) => pattern.test(s.line))
      if (section) {
        return section
      }
    }

    return null
  }

  /**
   * Extract plain text from Wikipedia HTML content.
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")

    // Remove reference tags [1], [2], etc.
    text = text.replace(/\[\d+\]/g, "")

    // Remove citation needed tags
    text = text.replace(/\[citation needed\]/gi, "")

    // Remove edit section links
    text = text.replace(/<span class="mw-editsection">[\s\S]*?<\/span>/gi, "")

    // Remove HTML tags but keep content
    text = text.replace(/<[^>]+>/g, " ")

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, " ")
    text = text.replace(/&amp;/g, "&")
    text = text.replace(/&lt;/g, "<")
    text = text.replace(/&gt;/g, ">")
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))

    // Normalize whitespace
    text = text.replace(/\s+/g, " ").trim()

    return text
  }

  /**
   * Clean Wikipedia-specific formatting from text.
   */
  private cleanWikipediaText(text: string): string {
    // Remove common Wikipedia artifacts
    let cleaned = text

    // Remove navigation/header text that sometimes appears
    cleaned = cleaned.replace(/^(Death|Personal life)\s*/i, "")

    // Remove "See also" and everything after
    const seeAlsoIndex = cleaned.search(/See also:?/i)
    if (seeAlsoIndex !== -1) {
      cleaned = cleaned.substring(0, seeAlsoIndex)
    }

    // Remove "References" and everything after
    const referencesIndex = cleaned.search(/References:?/i)
    if (referencesIndex !== -1) {
      cleaned = cleaned.substring(0, referencesIndex)
    }

    // Trim and normalize
    cleaned = cleaned.trim()

    return cleaned
  }

  /**
   * Extract structured death information from the text.
   */
  private extractDeathInfo(text: string, _actor: ActorForEnrichment): EnrichedDeathInfo {
    const lowerText = text.toLowerCase()

    // Extract location of death
    let locationOfDeath: string | null = null
    const locationPatterns = [
      /died (?:at|in) ([^,.]+(?:hospital|medical center|home|residence)[^,.]*)/i,
      /died (?:at|in) ([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*)/,
      /passed away (?:at|in) ([^,.]+)/i,
    ]

    for (const pattern of locationPatterns) {
      const match = text.match(pattern)
      if (match) {
        locationOfDeath = match[1].trim()
        break
      }
    }

    // Extract notable factors
    const notableFactors: string[] = []

    if (lowerText.includes("on set") || lowerText.includes("during filming")) {
      notableFactors.push("died-during-filming")
    }
    if (
      lowerText.includes("suicide") ||
      lowerText.includes("took his own life") ||
      lowerText.includes("took her own life")
    ) {
      notableFactors.push("suicide")
    }
    if (
      lowerText.includes("murder") ||
      lowerText.includes("homicide") ||
      lowerText.includes("killed by")
    ) {
      notableFactors.push("homicide")
    }
    if (lowerText.includes("overdose")) {
      notableFactors.push("overdose")
    }
    if (lowerText.includes("accident") || lowerText.includes("accidental")) {
      notableFactors.push("accident")
    }
    if (lowerText.includes("unexpected") || lowerText.includes("sudden")) {
      notableFactors.push("sudden-death")
    }

    return {
      circumstances: text,
      rumoredCircumstances: null,
      notableFactors,
      relatedCelebrities: [],
      locationOfDeath,
      additionalContext: null,
    }
  }

  /**
   * Calculate confidence based on content quality.
   */
  private calculateDeathConfidence(text: string, actor: ActorForEnrichment): number {
    const lowerText = text.toLowerCase()
    let confidence = 0.4 // Base confidence for finding a section

    // Increase confidence if actor name is mentioned
    if (lowerText.includes(actor.name.toLowerCase())) {
      confidence += 0.1
    }

    // Increase confidence for death-related keywords
    const deathKeywordsFound = DEATH_KEYWORDS.filter((kw) => lowerText.includes(kw.toLowerCase()))
    confidence += Math.min(0.2, deathKeywordsFound.length * 0.05)

    // Increase confidence for circumstance keywords
    const circumstanceKeywordsFound = CIRCUMSTANCE_KEYWORDS.filter((kw) =>
      lowerText.includes(kw.toLowerCase())
    )
    confidence += Math.min(0.15, circumstanceKeywordsFound.length * 0.03)

    // Bonus for substantial content
    if (text.length > 500) {
      confidence += 0.1
    } else if (text.length > 200) {
      confidence += 0.05
    }

    return Math.min(0.95, confidence)
  }
}
