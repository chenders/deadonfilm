/**
 * Wikipedia source for death information.
 *
 * Uses wtf_wikipedia to fetch and parse Wikipedia articles, producing clean
 * plaintext with no citation markers, footnotes, or HTML artifacts.
 *
 * Supports two section selection modes:
 * 1. Regex-based (default): Uses predefined patterns to find Death/Health sections
 * 2. AI-based (opt-in): Uses Gemini Flash to identify non-obvious sections like
 *    "Hunting and Fishing", "Controversies", etc. that may contain relevant info
 */

import wtf from "wtf_wikipedia"

type WtfDocument = InstanceType<typeof wtf.Document>
import { BaseDataSource, DEATH_KEYWORDS, CIRCUMSTANCE_KEYWORDS } from "../base-source.js"
import type {
  ActorForEnrichment,
  SourceLookupResult,
  EnrichedDeathInfo,
  WikipediaOptions,
} from "../types.js"
import { DataSourceType, ReliabilityTier, DEFAULT_WIKIPEDIA_OPTIONS } from "../types.js"
import {
  selectRelevantSections,
  isAISectionSelectionAvailable,
  type SectionSelectionResult,
  type WikipediaSection,
} from "../wikipedia-section-selector.js"
import { extractDatesWithAI, isAIDateExtractionAvailable } from "../wikipedia-date-extractor.js"

export class WikipediaSource extends BaseDataSource {
  readonly name = "Wikipedia"
  readonly type = DataSourceType.WIKIPEDIA
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION
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
      if (result.needsAlternate) {
        console.log(`  ${result.alternateReason}, trying alternate titles...`)

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

      let errorMessage = "No valid Wikipedia article found"
      if (result.alternateReason) {
        errorMessage = result.alternateReason
      } else if (result.needsAlternate) {
        errorMessage = "No valid Wikipedia article found after trying alternates"
      }

      const lastAttemptedUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`

      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, lastAttemptedUrl),
        data: null,
        error: errorMessage,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
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
    const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle)}`

    // Fetch the document using wtf_wikipedia
    let doc: WtfDocument | null
    try {
      doc = ((await wtf.fetch(articleTitle)) as WtfDocument | null) ?? null
    } catch {
      return {
        success: false,
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, articleUrl),
          data: null,
          error: `Failed to fetch Wikipedia article: ${articleTitle}`,
        },
        needsAlternate: true,
        alternateReason: "Article not found",
      }
    }

    if (!doc) {
      return {
        success: false,
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, articleUrl),
          data: null,
          error: `Article not found: ${articleTitle}`,
        },
        needsAlternate: true,
        alternateReason: "Article not found",
      }
    }

    // Check if this is a disambiguation page
    if (this.wikipediaOptions.handleDisambiguation !== false && doc.isDisambiguation()) {
      return {
        success: false,
        result: null,
        needsAlternate: true,
        alternateReason: "Disambiguation page detected",
      }
    }

    const sections = doc.sections() as wtf.Section[]
    if (sections.length === 0) {
      return {
        success: false,
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, articleUrl),
          data: null,
          error: "No sections found in article",
        },
        needsAlternate: false,
      }
    }

    // Map wtf sections to WikipediaSection interface
    const wikiSections: WikipediaSection[] = sections.map((s: wtf.Section, i: number) => ({
      index: String(i),
      line: s.title() || "Introduction",
      level: String(s.depth()),
      anchor: (s.title() || "Introduction").replace(/ /g, "_"),
    }))

    // Validate person by dates if enabled
    let dateValidationCost = 0
    if (this.wikipediaOptions.validatePersonDates !== false && (actor.birthday || actor.deathday)) {
      const introText = (sections[0] as wtf.Section | undefined)?.text({}) || ""
      if (introText) {
        const validation = await this.validatePersonByDates(actor, introText)
        dateValidationCost = validation.costUsd
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
        wikiSections,
        this.wikipediaOptions
      )
      sectionSelectionCost = sectionSelectionResult.costUsd

      if (sectionSelectionResult.usedAI && sectionSelectionResult.selectedSections.length > 0) {
        relevantSections = wikiSections.filter((s) =>
          sectionSelectionResult!.selectedSections.includes(s.line)
        )
        console.log(
          `  AI selected ${relevantSections.length} section(s): ${sectionSelectionResult.selectedSections.join(", ")}`
        )
        if (sectionSelectionResult.reasoning) {
          console.log(`  AI reasoning: ${sectionSelectionResult.reasoning}`)
        }
      } else {
        console.log(
          `  AI selection failed (${sectionSelectionResult.error || "no sections"}), falling back to regex`
        )
        relevantSections = this.findRelevantSections(wikiSections)
      }
    } else {
      relevantSections = this.findRelevantSections(wikiSections)
    }

    if (relevantSections.length === 0) {
      return {
        success: false,
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, articleUrl),
          data: null,
          error: "No death section found in article",
        },
        needsAlternate: false,
      }
    }

    const sectionNames = relevantSections.map((s) => s.line).join(", ")
    console.log(`  Found ${relevantSections.length} section(s): ${sectionNames}`)

    // Extract text from relevant sections using wtf_wikipedia
    const sectionTexts: string[] = []

    for (const wikiSection of relevantSections) {
      const sectionIndex = parseInt(wikiSection.index, 10)
      const section = sections[sectionIndex]
      if (!section) continue

      const textContent = section.text({})
      if (textContent && textContent.length >= 50) {
        sectionTexts.push(`[${wikiSection.line}] ${textContent}`)
      }
    }

    if (sectionTexts.length === 0) {
      return {
        success: false,
        result: {
          success: false,
          source: this.createSourceEntry(startTime, 0, articleUrl),
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

    if (sectionSelectionResult) {
      rawData.aiSectionSelection = {
        usedAI: sectionSelectionResult.usedAI,
        selectedSections: sectionSelectionResult.selectedSections,
        linkedArticles: sectionSelectionResult.linkedArticles,
        reasoning: sectionSelectionResult.reasoning,
        error: sectionSelectionResult.error,
      }
    }

    if (linkedArticleTexts.length > 0) {
      rawData.linkedArticleCount = linkedArticleTexts.length
      rawData.linkedArticlesFollowed = sectionSelectionResult?.linkedArticles || []
    }

    const sourceEntry = this.createSourceEntry(
      startTime,
      confidence,
      articleUrl,
      articleTitle,
      rawData
    )
    const totalAICost = sectionSelectionCost + dateValidationCost
    if (totalAICost > 0) {
      sourceEntry.costUsd = totalAICost
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
   */
  private buildArticleTitle(name: string): string {
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
      /^death\b/i,
    ]

    // Violent death sections
    const violentDeathPatterns = [
      /^assassination$/i,
      /^assassination\b/i,
      /^murder$/i,
      /^killing$/i,
      /^shooting$/i,
      /^fatal accident$/i,
      /^fatal incident$/i,
      /^crash$/i,
      /^plane crash$/i,
      /^car crash$/i,
    ]

    // Health sections
    const healthPatterns = [
      /^health$/i,
      /^health issues$/i,
      /^health problems$/i,
      /^declining health$/i,
      /^illness$/i,
      /^final illness$/i,
    ]

    // Fallback sections
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
        break
      }
    }

    // Find violent death sections
    for (const pattern of violentDeathPatterns) {
      const section = sections.find((s) => pattern.test(s.line))
      if (section && !result.some((r) => r.index === section.index)) {
        result.push(section)
        break
      }
    }

    // Find health sections
    for (const pattern of healthPatterns) {
      const section = sections.find((s) => pattern.test(s.line))
      if (section && !result.some((r) => r.index === section.index)) {
        result.push(section)
        break
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
   * Fetch content from linked Wikipedia articles using wtf_wikipedia.
   */
  private async fetchLinkedArticlesContent(articleTitles: string[]): Promise<string[]> {
    const results: string[] = []

    for (const articleTitle of articleTitles) {
      try {
        const linkedDoc = ((await wtf.fetch(articleTitle)) as WtfDocument | null) ?? null
        if (!linkedDoc) {
          console.log(`    Linked article "${articleTitle}" not found`)
          continue
        }

        const linkedSections = linkedDoc.sections() as wtf.Section[]
        const articleContent: string[] = []
        const humanReadableTitle = articleTitle.replace(/_/g, " ")

        // Get intro text
        const introSection = linkedSections[0]
        if (introSection) {
          const introText = introSection.text({})
          if (introText && introText.length >= 50) {
            articleContent.push(`[Linked Article: ${humanReadableTitle}] ${introText}`)
          }
        }

        // Map to WikipediaSection for findRelevantSections
        const linkedWikiSections: WikipediaSection[] = linkedSections.map(
          (s: wtf.Section, i: number) => ({
            index: String(i),
            line: s.title() || "Introduction",
            level: String(s.depth()),
            anchor: (s.title() || "Introduction").replace(/ /g, "_"),
          })
        )

        // Also fetch any Death/Incident sections from the linked article
        const deathSections = this.findRelevantSections(linkedWikiSections)

        for (const deathSection of deathSections.slice(0, 2)) {
          const sectionIndex = parseInt(deathSection.index, 10)
          const section = linkedSections[sectionIndex]
          if (!section) continue

          const sectionText = section.text({})
          if (sectionText && sectionText.length >= 50) {
            articleContent.push(
              `[Linked Article: ${humanReadableTitle} - ${deathSection.line}] ${sectionText}`
            )
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
    let confidence = 0.4

    if (lowerText.includes(actor.name.toLowerCase())) {
      confidence += 0.1
    }

    const deathKeywordsFound = DEATH_KEYWORDS.filter((kw) => lowerText.includes(kw.toLowerCase()))
    confidence += Math.min(0.2, deathKeywordsFound.length * 0.05)

    const circumstanceKeywordsFound = CIRCUMSTANCE_KEYWORDS.filter((kw) =>
      lowerText.includes(kw.toLowerCase())
    )
    confidence += Math.min(0.15, circumstanceKeywordsFound.length * 0.03)

    if (text.length > 500) {
      confidence += 0.1
    } else if (text.length > 200) {
      confidence += 0.05
    }

    return Math.min(0.95, confidence)
  }

  /**
   * Validate that the Wikipedia article is about the correct person by comparing
   * birth/death years from the article intro against the actor's known dates.
   */
  private async validatePersonByDates(
    actor: ActorForEnrichment,
    introText: string
  ): Promise<{ isValid: boolean; reason: string; costUsd: number }> {
    const actorBirthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
    const actorDeathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

    let wikiBirthYear: number | null = null
    let wikiDeathYear: number | null = null
    let costUsd = 0

    // Try AI extraction first if enabled
    const useAI =
      this.wikipediaOptions.useAIDateValidation !== false && isAIDateExtractionAvailable()

    if (useAI) {
      console.log(`  Using AI date validation for ${actor.name}`)
      const aiResult = await extractDatesWithAI(actor.name, introText)
      costUsd = aiResult.costUsd

      if (aiResult.usedAI && (aiResult.birthYear !== null || aiResult.deathYear !== null)) {
        console.log(`  AI extracted: birth=${aiResult.birthYear}, death=${aiResult.deathYear}`)
        wikiBirthYear = aiResult.birthYear
        wikiDeathYear = aiResult.deathYear
      } else if (aiResult.error) {
        console.log(
          `  AI date extraction failed (${aiResult.error}), falling back to regex when needed`
        )
      }
    }

    // Fall back to regex if AI didn't produce results
    if (wikiBirthYear === null && wikiDeathYear === null) {
      const birthMatch = introText.match(/\bborn\b[^)]*?(\d{4})|^\s*\((\d{4})\s*[-–]/im)
      const deathMatch = introText.match(/\bdied\b[^)]*?(\d{4})|[-–]\s*(\d{4})\s*\)/im)

      const fullDateLifeSpanMatch = introText.match(
        /\(\s*[A-Z][a-z]+[^)]*?(\d{4})\s*[-–]\s*[A-Z][a-z]+[^)]*?(\d{4})\s*\)/
      )

      const lifeSpanMatch = introText.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/)

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
    }

    // Compare years (allow 1 year tolerance)
    if (actorBirthYear && wikiBirthYear) {
      if (Math.abs(wikiBirthYear - actorBirthYear) > 1) {
        return {
          isValid: false,
          reason: `Birth year mismatch: DB=${actorBirthYear}, Wiki=${wikiBirthYear}`,
          costUsd,
        }
      }
    }

    if (actorDeathYear && wikiDeathYear) {
      if (Math.abs(wikiDeathYear - actorDeathYear) > 1) {
        return {
          isValid: false,
          reason: `Death year mismatch: DB=${actorDeathYear}, Wiki=${wikiDeathYear}`,
          costUsd,
        }
      }
    }

    return { isValid: true, reason: "Dates match or not available for comparison", costUsd }
  }

  /**
   * Generate alternate Wikipedia article titles to try when disambiguation is detected
   * or person validation fails.
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
}
