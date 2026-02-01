/**
 * Wikipedia source for death information.
 *
 * Fetches Wikipedia articles and extracts the Death section (or Personal life
 * section as fallback) to get detailed death circumstances.
 *
 * Supports two section selection modes:
 * 1. Regex-based (default): Uses predefined patterns to find Death/Health sections
 * 2. AI-based (opt-in): Uses Gemini Flash to identify non-obvious sections like
 *    "Hunting and Fishing", "Controversies", etc. that may contain relevant info
 *
 * Uses the Wikipedia API to get article content in a parseable format.
 */

import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type {
  ActorForEnrichment,
  SourceLookupResult,
  EnrichedDeathInfo,
  WikipediaOptions,
} from "../types.js"
import { DataSourceType, SourceAccessBlockedError, DEFAULT_WIKIPEDIA_OPTIONS } from "../types.js"
import {
  removeScriptTags,
  removeStyleTags,
  stripHtmlTags,
  decodeHtmlEntities,
} from "../html-utils.js"
import {
  selectRelevantSections,
  isAISectionSelectionAvailable,
  type SectionSelectionResult,
  type WikipediaSection,
} from "../wikipedia-section-selector.js"

const WIKIPEDIA_API_BASE = "https://en.wikipedia.org/w/api.php"

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

  private wikipediaOptions: WikipediaOptions = DEFAULT_WIKIPEDIA_OPTIONS

  /**
   * Configure Wikipedia-specific options.
   * @param options - Wikipedia options including AI section selection
   */
  setWikipediaOptions(options: WikipediaOptions): void {
    this.wikipediaOptions = { ...DEFAULT_WIKIPEDIA_OPTIONS, ...options }
  }

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

      // Find relevant sections - use AI selection if enabled and available
      let relevantSections: WikipediaSection[]
      let sectionSelectionResult: SectionSelectionResult | null = null
      let sectionSelectionCost = 0

      const useAI = this.wikipediaOptions.useAISectionSelection && isAISectionSelectionAvailable()

      if (useAI) {
        console.log(`  Using AI section selection for ${actor.name}`)
        sectionSelectionResult = await selectRelevantSections(
          actor.name,
          sectionsData.parse.sections,
          this.wikipediaOptions
        )
        sectionSelectionCost = sectionSelectionResult.costUsd

        if (sectionSelectionResult.usedAI && sectionSelectionResult.selectedSections.length > 0) {
          // Map selected section titles back to WikipediaSection objects
          relevantSections = sectionsData.parse.sections.filter((s) =>
            sectionSelectionResult!.selectedSections.includes(s.line)
          )
          console.log(
            `  AI selected ${relevantSections.length} section(s): ${sectionSelectionResult.selectedSections.join(", ")}`
          )
          if (sectionSelectionResult.reasoning) {
            console.log(`  AI reasoning: ${sectionSelectionResult.reasoning}`)
          }
        } else {
          // AI selection failed or returned no results, fall back to regex
          console.log(
            `  AI selection failed (${sectionSelectionResult.error || "no sections"}), falling back to regex`
          )
          relevantSections = this.findRelevantSections(sectionsData.parse.sections)
        }
      } else {
        // Use regex-based selection (default)
        relevantSections = this.findRelevantSections(sectionsData.parse.sections)
      }

      if (relevantSections.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: "No death section found in article",
        }
      }

      const sectionNames = relevantSections.map((s) => s.line).join(", ")
      console.log(`  Found ${relevantSections.length} section(s): ${sectionNames}`)

      // Fetch content from all relevant sections
      const sectionTexts: string[] = []

      for (const section of relevantSections) {
        const contentUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&section=${section.index}&prop=text&format=json`

        const contentResponse = await fetch(contentUrl, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "application/json",
          },
        })

        if (!contentResponse.ok) {
          console.log(
            `  Warning: Failed to fetch section "${section.line}": HTTP ${contentResponse.status}`
          )
          continue
        }

        const contentData = (await contentResponse.json()) as WikipediaSectionContentResponse

        if (!contentData.parse?.text?.["*"]) {
          console.log(`  Warning: No content in section "${section.line}"`)
          continue
        }

        // Parse the HTML content
        const htmlContent = contentData.parse.text["*"]
        const textContent = this.extractTextFromHtml(htmlContent)
        const cleanedSectionText = this.cleanWikipediaText(textContent)

        if (cleanedSectionText && cleanedSectionText.length >= 50) {
          // Add section header for context
          sectionTexts.push(`[${section.line}] ${cleanedSectionText}`)
        }
      }

      if (sectionTexts.length === 0) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: "No usable content in relevant sections",
        }
      }

      // Combine all section texts
      const cleanedText = sectionTexts.join("\n\n")

      // Extract death information
      const deathInfo = this.extractDeathInfo(cleanedText, actor)
      const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`

      // Calculate confidence based on content quality
      const confidence = this.calculateDeathConfidence(cleanedText, actor)

      console.log(
        `  Extracted ${cleanedText.length} chars from ${sectionTexts.length} section(s), confidence: ${confidence.toFixed(2)}`
      )

      // Build raw data with section selection metadata
      const rawData: Record<string, unknown> = {
        sectionTitles: relevantSections.map((s) => s.line),
        sectionCount: relevantSections.length,
        textLength: cleanedText.length,
      }

      // Include AI section selection metadata if used
      if (sectionSelectionResult) {
        rawData.aiSectionSelection = {
          usedAI: sectionSelectionResult.usedAI,
          selectedSections: sectionSelectionResult.selectedSections,
          reasoning: sectionSelectionResult.reasoning,
          error: sectionSelectionResult.error,
        }
      }

      // Create source entry - include AI selection cost in the total cost
      const sourceEntry = this.createSourceEntry(
        startTime,
        confidence,
        articleUrl,
        articleTitle,
        rawData
      )
      if (sectionSelectionCost > 0) {
        sourceEntry.costUsd = sectionSelectionCost
      }

      return {
        success: true,
        source: sourceEntry,
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
   * Find all relevant sections for death information.
   * Returns multiple sections when available (e.g., both Health and Death).
   */
  private findRelevantSections(sections: WikipediaSection[]): WikipediaSection[] {
    const result: WikipediaSection[] = []

    // Primary death sections - always include if found
    const deathPatterns = [
      /^death$/i,
      /^death and legacy$/i,
      /^death and funeral$/i,
      /^death and aftermath$/i,
      /^death and tributes$/i,
      /^death and memorials$/i,
      /^death and reactions$/i,
      /^later life and death$/i,
      /^final years and death$/i,
      /^illness and death$/i,
      /^decline and death$/i,
    ]

    // Health sections - include alongside death sections for medical context
    const healthPatterns = [
      /^health$/i,
      /^health issues$/i,
      /^health problems$/i,
      /^declining health$/i,
      /^illness$/i,
      /^final illness$/i,
    ]

    // Fallback sections - only use if no death or health sections found
    const fallbackPatterns = [
      /^personal life$/i,
      /^later life$/i,
      /^final years$/i,
      /^later years$/i,
    ]

    // Find death sections
    for (const pattern of deathPatterns) {
      const section = sections.find((s) => pattern.test(s.line))
      if (section && !result.some((r) => r.index === section.index)) {
        result.push(section)
        break // Only take the first matching death section
      }
    }

    // Find health sections (include even if death section found)
    for (const pattern of healthPatterns) {
      const section = sections.find((s) => pattern.test(s.line))
      if (section && !result.some((r) => r.index === section.index)) {
        result.push(section)
        break // Only take the first matching health section
      }
    }

    // If no death or health sections, try fallbacks
    if (result.length === 0) {
      for (const pattern of fallbackPatterns) {
        const section = sections.find((s) => pattern.test(s.line))
        if (section) {
          result.push(section)
          break
        }
      }
    }

    // Sort by section index so content appears in article order
    result.sort((a, b) => parseInt(a.index) - parseInt(b.index))

    return result
  }

  /**
   * Find the Death section or suitable fallback.
   * @deprecated Use findRelevantSections instead
   */
  private findDeathSection(sections: WikipediaSection[]): WikipediaSection | null {
    const relevant = this.findRelevantSections(sections)
    return relevant.length > 0 ? relevant[0] : null
  }

  /**
   * Extract plain text from Wikipedia HTML content.
   */
  private extractTextFromHtml(html: string): string {
    // Remove script and style tags using robust state-machine approach
    let text = removeScriptTags(html)
    text = removeStyleTags(text)

    // Remove reference tags [1], [2], etc.
    text = text.replace(/\[\d+\]/g, "")

    // Remove citation needed tags
    text = text.replace(/\[citation needed\]/gi, "")

    // Remove edit section links
    // eslint-disable-next-line security/detect-unsafe-regex -- Acceptable for controlled text scraping
    text = text.replace(/<span class="mw-editsection">[^<]*(?:(?!<\/span>)<[^<]*)*<\/span>/gi, "")

    // Remove HTML tags but keep content
    text = stripHtmlTags(text)

    // Decode HTML entities using the 'he' library
    text = decodeHtmlEntities(text)

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
      // eslint-disable-next-line security/detect-unsafe-regex -- Acceptable for controlled text scraping
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
