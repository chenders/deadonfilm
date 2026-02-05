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

      // Try the primary article title first
      const result = await this.tryArticleLookup(actor, articleTitle, startTime)

      // Try alternates if needed (disambiguation page, date validation failure, etc.)
      // This applies regardless of which validation detected the issue
      if (result.needsAlternate) {
        console.log(`  ${result.alternateReason}, trying alternate titles...`)

        // Try alternate titles
        const alternateTitles = this.generateAlternateTitles(actor.name)
        for (const altTitle of alternateTitles) {
          console.log(`  Trying: ${altTitle}`)
          const altResult = await this.tryArticleLookup(actor, altTitle, startTime)

          if (altResult.success && !altResult.needsAlternate) {
            console.log(`  Found correct article: ${altTitle}`)
            return altResult.result!
          }
        }

        // None of the alternates worked; return the original result if available
        if (result.result) {
          console.log(`  No valid alternate found, returning original result`)
          return result.result
        } else {
          console.log(`  No valid alternate found and no original result to return`)
        }
      }

      // Return the result (either successful or failed)
      if (result.result) {
        return result.result
      }

      // No SourceLookupResult was produced; construct a deterministic error message
      let errorMessage = "No valid Wikipedia article found"
      if (result.alternateReason) {
        errorMessage = result.alternateReason
      } else if (result.needsAlternate) {
        errorMessage = "No valid Wikipedia article found after trying alternates"
      }

      // Carry through the last attempted article URL for debugging/observability
      const lastAttemptedUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, lastAttemptedUrl),
        data: null,
        error: errorMessage,
      }
    } catch (error) {
      if (error instanceof SourceAccessBlockedError) {
        throw error
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      // Include the article title in error cases for debugging
      const articleTitle = this.buildArticleTitle(actor.name)
      const lastAttemptedUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, lastAttemptedUrl),
        data: null,
        error: errorMessage,
      }
    }
  }

  /**
   * Try to look up death information from a specific Wikipedia article title.
   * This is called by performLookup for both primary and alternate titles.
   *
   * @param actor - The actor to look up
   * @param articleTitle - The Wikipedia article title to try
   * @param startTime - Start time for timing metrics
   * @returns Result with success status and whether an alternate title should be tried
   */
  private async tryArticleLookup(
    actor: ActorForEnrichment,
    articleTitle: string,
    startTime: number
  ): Promise<{
    success: boolean
    result: SourceLookupResult | null
    needsAlternate: boolean
    alternateReason?: string
  }> {
    // First, get the list of sections to find Death/Personal life
    // Use redirects=1 to automatically follow Wikipedia redirects
    const sectionsUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&prop=sections&format=json&redirects=1`

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
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: `HTTP ${sectionsResponse.status}`,
        },
        needsAlternate: false,
      }
    }

    const sectionsData = (await sectionsResponse.json()) as WikipediaSectionsResponse

    if (sectionsData.error) {
      // Article not found - this is expected for alternate titles that don't exist
      return {
        success: false,
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: `Article not found: ${sectionsData.error.info}`,
        },
        needsAlternate: true,
        alternateReason: "Article not found",
      }
    }

    if (!sectionsData.parse?.sections) {
      return {
        success: false,
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: "No sections found in article",
        },
        needsAlternate: false,
      }
    }

    // Check if this is a disambiguation page
    if (
      this.wikipediaOptions.handleDisambiguation !== false &&
      this.isDisambiguationPage(sectionsData.parse.sections)
    ) {
      return {
        success: false,
        result: null,
        needsAlternate: true,
        alternateReason: "Disambiguation page detected",
      }
    }

    // Validate person by dates if enabled and actor has dates to validate
    // Skip the API call if there are no dates to check against
    if (this.wikipediaOptions.validatePersonDates !== false && (actor.birthday || actor.deathday)) {
      const introText = await this.fetchArticleIntro(articleTitle)
      if (introText) {
        const validation = this.validatePersonByDates(actor, introText)
        if (!validation.isValid) {
          console.log(`  Date validation failed: ${validation.reason}`)
          return {
            success: false,
            result: null,
            needsAlternate: true,
            alternateReason: validation.reason,
          }
        }
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
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: "No death section found in article",
        },
        needsAlternate: false,
      }
    }

    const sectionNames = relevantSections.map((s) => s.line).join(", ")
    console.log(`  Found ${relevantSections.length} section(s): ${sectionNames}`)

    // Fetch content from all relevant sections
    const sectionTexts: string[] = []

    for (const section of relevantSections) {
      // Use redirects=1 to automatically follow Wikipedia redirects
      const contentUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&section=${section.index}&prop=text&format=json&redirects=1`

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
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, sectionsUrl),
          data: null,
          error: "No usable content in relevant sections",
        },
        needsAlternate: false,
      }
    }

    // Fetch content from linked articles if AI selected any
    let linkedArticleTexts: string[] = []
    if (
      sectionSelectionResult?.linkedArticles &&
      sectionSelectionResult.linkedArticles.length > 0 &&
      this.wikipediaOptions.followLinkedArticles
    ) {
      console.log(
        `  Fetching ${sectionSelectionResult.linkedArticles.length} linked article(s): ${sectionSelectionResult.linkedArticles.join(", ")}`
      )
      linkedArticleTexts = await this.fetchLinkedArticlesContent(
        sectionSelectionResult.linkedArticles
      )
      console.log(`  Retrieved content from ${linkedArticleTexts.length} linked article(s)`)
    }

    // Combine all section texts with linked article content
    const allTexts = [...sectionTexts, ...linkedArticleTexts]
    const cleanedText = allTexts.join("\n\n")

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
        linkedArticles: sectionSelectionResult.linkedArticles,
        reasoning: sectionSelectionResult.reasoning,
        error: sectionSelectionResult.error,
      }
    }

    // Include linked article metadata
    if (linkedArticleTexts.length > 0) {
      rawData.linkedArticleCount = linkedArticleTexts.length
      rawData.linkedArticlesFollowed = sectionSelectionResult?.linkedArticles || []
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
      result: {
        success: true,
        source: sourceEntry,
        data: deathInfo,
      },
      needsAlternate: false,
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
      /^death\b/i, // Catch "Death of...", "Death and ..." variants not listed below
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

    // Violent death sections - assassination, murder, accident, etc.
    const violentDeathPatterns = [
      /^assassination$/i,
      /^assassination\b/i, // "Assassination and aftermath", "Assassination and funeral"
      /^murder$/i,
      /^killing$/i,
      /^shooting$/i,
      /^accident$/i,
      /^fatal accident$/i,
      /^incident$/i,
      /^crash$/i,
      /^plane crash$/i,
      /^car crash$/i,
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

    // Find violent death sections (assassination, murder, accident, etc.)
    // These are treated as primary death sections
    for (const pattern of violentDeathPatterns) {
      const section = sections.find((s) => pattern.test(s.line))
      if (section && !result.some((r) => r.index === section.index)) {
        result.push(section)
        break // Only take the first matching violent death section
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
   * Fetch content from linked Wikipedia articles.
   * Gets the intro (section 0) and any Death/Health sections.
   *
   * @param articleTitles - Wikipedia article titles (with underscores)
   * @returns Array of text content from each linked article
   */
  private async fetchLinkedArticlesContent(articleTitles: string[]): Promise<string[]> {
    const results: string[] = []

    for (const articleTitle of articleTitles) {
      try {
        // First check if the article exists by getting its sections
        // Use redirects=1 to automatically follow Wikipedia redirects
        const sectionsUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&prop=sections&format=json&redirects=1`

        const sectionsResponse = await fetch(sectionsUrl, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "application/json",
          },
        })

        if (!sectionsResponse.ok) {
          console.log(
            `    Linked article "${articleTitle}" not found (HTTP ${sectionsResponse.status})`
          )
          continue
        }

        const sectionsData = (await sectionsResponse.json()) as WikipediaSectionsResponse

        if (sectionsData.error) {
          console.log(`    Linked article "${articleTitle}" not found: ${sectionsData.error.info}`)
          continue
        }

        // Fetch the intro (section 0) which usually has the summary
        // Use redirects=1 to follow redirects
        const introUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&section=0&prop=text&format=json&redirects=1`

        const introResponse = await fetch(introUrl, {
          headers: {
            "User-Agent": this.userAgent,
            Accept: "application/json",
          },
        })

        if (!introResponse.ok) {
          continue
        }

        const introData = (await introResponse.json()) as WikipediaSectionContentResponse

        if (!introData.parse?.text?.["*"]) {
          continue
        }

        // Extract intro text
        const introHtml = introData.parse.text["*"]
        const introText = this.extractTextFromHtml(introHtml)
        const cleanedIntro = this.cleanWikipediaText(introText)

        // Build the content with a header
        const articleContent: string[] = []
        const humanReadableTitle = articleTitle.replace(/_/g, " ")

        if (cleanedIntro && cleanedIntro.length >= 50) {
          articleContent.push(`[Linked Article: ${humanReadableTitle}] ${cleanedIntro}`)
        }

        // Also fetch any Death/Incident sections from the linked article
        if (sectionsData.parse?.sections) {
          const deathSections = this.findRelevantSections(sectionsData.parse.sections)

          for (const section of deathSections.slice(0, 2)) {
            // Limit to 2 sections
            // Use redirects=1 to follow redirects
            const contentUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&section=${section.index}&prop=text&format=json&redirects=1`

            const contentResponse = await fetch(contentUrl, {
              headers: {
                "User-Agent": this.userAgent,
                Accept: "application/json",
              },
            })

            if (!contentResponse.ok) {
              continue
            }

            const contentData = (await contentResponse.json()) as WikipediaSectionContentResponse

            if (!contentData.parse?.text?.["*"]) {
              continue
            }

            const sectionHtml = contentData.parse.text["*"]
            const sectionText = this.extractTextFromHtml(sectionHtml)
            const cleanedSection = this.cleanWikipediaText(sectionText)

            if (cleanedSection && cleanedSection.length >= 50) {
              articleContent.push(
                `[Linked Article: ${humanReadableTitle} - ${section.line}] ${cleanedSection}`
              )
            }
          }
        }

        if (articleContent.length > 0) {
          results.push(articleContent.join("\n\n"))
        }
      } catch (error) {
        console.log(
          `    Error fetching linked article "${articleTitle}": ${error instanceof Error ? error.message : "Unknown error"}`
        )
      }
    }

    return results
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

  /**
   * Detect if the retrieved page is a disambiguation page rather than a biography.
   * Disambiguation pages list multiple people/things with the same name.
   *
   * Detection signals:
   * - Sections like "People", "Other uses", "Given name", "Surname", "See also"
   * - Absence of biography sections like "Early life", "Career", "Death", "Personal life"
   *
   * @param sections - The sections from the Wikipedia article
   * @returns true if this appears to be a disambiguation page
   */
  private isDisambiguationPage(sections: WikipediaSection[]): boolean {
    const sectionTitles = sections.map((s) => s.line.toLowerCase())

    // Disambiguation page signals
    const disambigSections = [
      "people",
      "other uses",
      "given name",
      "surname",
      "places",
      "arts",
      "see also",
    ]
    const hasDisambigSections = disambigSections.some((d) =>
      sectionTitles.some((t) => t === d || t.includes(d))
    )

    // Biography page signals
    const bioSections = [
      "early life",
      "career",
      "death",
      "personal life",
      "biography",
      "filmography",
    ]
    const hasBioSections = bioSections.some((b) =>
      sectionTitles.some((t) => t === b || t.includes(b))
    )

    // It's a disambiguation page if it has disambiguation sections and NO biography sections
    return hasDisambigSections && !hasBioSections
  }

  /**
   * Validate that the Wikipedia article is about the correct person by comparing
   * birth/death years from the article intro against the actor's known dates.
   *
   * @param actor - The actor we're looking up
   * @param introText - The introduction text from the Wikipedia article
   * @returns Object with isValid flag and reason for the validation result
   */
  private validatePersonByDates(
    actor: ActorForEnrichment,
    introText: string
  ): { isValid: boolean; reason: string } {
    const actorBirthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
    const actorDeathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

    // Extract years from Wikipedia intro
    // Common patterns: "born January 15, 1952", "(1952-2020)", "1952 – 2020"
    // Also handles full-date lifespans like "(January 15, 1951 – March 10, 2020)"
    const birthMatch = introText.match(/\bborn\b[^)]*?(\d{4})|^\s*\((\d{4})\s*[-–]/im)
    const deathMatch = introText.match(/\bdied\b[^)]*?(\d{4})|[-–]\s*(\d{4})\s*\)/im)

    // Try to match full-date lifespans first, e.g. "(January 15, 1951 – March 10, 2020)"
    const fullDateLifeSpanMatch = introText.match(
      /\(\s*[A-Z][a-z]+[^)]*?(\d{4})\s*[-–]\s*[A-Z][a-z]+[^)]*?(\d{4})\s*\)/
    )

    // Also try the common "(YYYY-YYYY)" pattern
    const lifeSpanMatch = introText.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/)

    let wikiBirthYear: number | null = null
    let wikiDeathYear: number | null = null

    if (fullDateLifeSpanMatch) {
      wikiBirthYear = parseInt(fullDateLifeSpanMatch[1], 10)
      wikiDeathYear = parseInt(fullDateLifeSpanMatch[2], 10)
    } else if (lifeSpanMatch) {
      wikiBirthYear = parseInt(lifeSpanMatch[1], 10)
      wikiDeathYear = parseInt(lifeSpanMatch[2], 10)
    } else {
      if (birthMatch) {
        wikiBirthYear = parseInt(birthMatch[1] || birthMatch[2], 10)
      }
      if (deathMatch) {
        wikiDeathYear = parseInt(deathMatch[1] || deathMatch[2], 10)
      }
    }

    // Compare years (allow 1 year tolerance for edge cases like late December births)
    if (actorBirthYear && wikiBirthYear) {
      if (Math.abs(wikiBirthYear - actorBirthYear) > 1) {
        return {
          isValid: false,
          reason: `Birth year mismatch: DB=${actorBirthYear}, Wiki=${wikiBirthYear}`,
        }
      }
    }

    if (actorDeathYear && wikiDeathYear) {
      if (Math.abs(wikiDeathYear - actorDeathYear) > 1) {
        return {
          isValid: false,
          reason: `Death year mismatch: DB=${actorDeathYear}, Wiki=${wikiDeathYear}`,
        }
      }
    }

    return { isValid: true, reason: "Dates match or not available for comparison" }
  }

  /**
   * Generate alternate Wikipedia article titles to try when disambiguation is detected
   * or person validation fails.
   *
   * @param name - The actor's name
   * @returns Array of alternate article titles to try
   */
  private generateAlternateTitles(name: string): string[] {
    const base = name.replace(/ /g, "_")
    return [
      `${base}_(actor)`,
      `${base}_(actress)`,
      `${base}_(American_actor)`,
      `${base}_(Canadian_actor)`,
      `${base}_(British_actor)`,
      `${base}_(Australian_actor)`,
      `${base}_(film_actor)`,
      `${base}_(television_actor)`,
    ]
  }

  /**
   * Fetch the intro section (section 0) of a Wikipedia article to get birth/death dates.
   *
   * @param articleTitle - The Wikipedia article title
   * @returns The intro text or null if not found
   */
  private async fetchArticleIntro(articleTitle: string): Promise<string | null> {
    const introUrl = `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(articleTitle)}&section=0&prop=text&format=json&redirects=1`

    try {
      const response = await fetch(introUrl, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json",
        },
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as WikipediaSectionContentResponse

      if (!data.parse?.text?.["*"]) {
        return null
      }

      return this.extractTextFromHtml(data.parse.text["*"])
    } catch {
      return null
    }
  }
}
