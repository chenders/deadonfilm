/**
 * Wikipedia biography source for personal life content.
 *
 * Fetches personal life sections from Wikipedia articles using the MediaWiki
 * parse API. Uses the biography section selector (Gemini Flash) to identify
 * which sections contain personal/biographical content, then extracts and
 * cleans HTML content from those sections.
 *
 * Always includes the article intro (section 0) for basic biographical context.
 * Handles disambiguation pages by retrying with _(actor) / _(actress) suffixes.
 *
 * Simpler than the death-sources Wikipedia implementation:
 * - No date validation
 * - No linked articles
 * - No death-specific keyword matching
 */

import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import {
  BiographySourceType,
  type ActorForBiography,
  type RawBiographySourceData,
} from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { selectBiographySections, type WikipediaSection } from "../wikipedia-section-selector.js"
import { mechanicalPreClean } from "../content-cleaner.js"
import {
  removeScriptTags,
  removeStyleTags,
  stripHtmlTags,
  decodeHtmlEntities,
} from "../../death-sources/html-utils.js"

const WIKIPEDIA_API_BASE = "https://en.wikipedia.org/w/api.php"

// Minimum character count for a section to be included in output
const MIN_SECTION_LENGTH = 50

// ============================================================================
// HTML Text Extraction
// ============================================================================

/**
 * Extract clean text from Wikipedia section HTML.
 *
 * Steps:
 * 1. Remove script and style tags (state machine, handles nesting)
 * 2. Remove [1], [citation needed], and mw-editsection spans
 * 3. Strip remaining HTML tags
 * 4. Decode HTML entities
 * 5. Normalize whitespace
 */
function extractTextFromHtml(html: string): string {
  if (!html) return ""

  let text = html

  // Remove script and style tags
  text = removeScriptTags(text)
  text = removeStyleTags(text)

  // Remove mw-editsection spans (Wikipedia edit links)
  text = text.replace(/<span\s+class="mw-editsection"[\s\S]*?<\/span>/gi, "")

  // Remove [1], [2], etc. citation references
  text = text.replace(/\[\d+\]/g, "")

  // Remove [citation needed] and similar annotations
  text = text.replace(
    /\[\s*(?:citation needed|clarification needed|when\?|who\?|where\?|dubious|discuss|further explanation needed|original research\??|not in citation given|failed verification|unreliable source\??)\s*\]/gi,
    ""
  )

  // Strip all remaining HTML tags
  text = stripHtmlTags(text)

  // Decode HTML entities
  text = decodeHtmlEntities(text)

  // Normalize whitespace: collapse multiple spaces, trim lines
  text = text.replace(/[ \t]+/g, " ")
  text = text.replace(/\n{3,}/g, "\n\n")
  text = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")

  return text.trim()
}

// ============================================================================
// Wikipedia API Types
// ============================================================================

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

// ============================================================================
// Disambiguation Detection
// ============================================================================

/** Section titles that indicate a disambiguation page */
const DISAMBIGUATION_INDICATORS = ["people", "other uses", "given name", "surname"]

/** Section titles that indicate a real article (not disambiguation) */
const ARTICLE_INDICATORS = ["early life", "career", "personal life", "biography", "death"]

/**
 * Check whether the section list looks like a disambiguation page.
 *
 * A disambiguation page typically has sections like "People", "Other uses",
 * "Given name" but lacks biographical sections like "Early life", "Career",
 * "Personal life".
 */
function isDisambiguationPage(sections: WikipediaSection[]): boolean {
  const titles = sections.map((s) => s.line.toLowerCase())

  const hasDisambiguationSections = titles.some((t) =>
    DISAMBIGUATION_INDICATORS.some((indicator) => t.includes(indicator))
  )
  const hasArticleSections = titles.some((t) =>
    ARTICLE_INDICATORS.some((indicator) => t.includes(indicator))
  )

  return hasDisambiguationSections && !hasArticleSections
}

// ============================================================================
// Source Implementation
// ============================================================================

/**
 * Wikipedia biography source for narrative personal life content.
 *
 * Fetches and cleans Wikipedia article sections identified as containing
 * personal/biographical information (childhood, education, family, etc.).
 */
export class WikipediaBiographySource extends BaseBiographySource {
  readonly name = "Wikipedia Biography"
  readonly type = BiographySourceType.WIKIPEDIA_BIO
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  protected minDelayMs = 500

  protected async performLookup(actor: ActorForBiography): Promise<BiographyLookupResult> {
    const startTime = Date.now()

    // Build article title from actor name (spaces become underscores in Wikipedia)
    const baseTitle = actor.name.replace(/ /g, "_")
    const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(baseTitle)}`

    // Try the base title first
    let result = await this.fetchArticleSections(baseTitle, startTime)

    // If disambiguation, try with _(actor) and _(actress) suffixes
    if (result.isDisambiguation) {
      for (const suffix of ["_(actor)", "_(actress)"]) {
        const altTitle = baseTitle + suffix
        result = await this.fetchArticleSections(altTitle, startTime)
        if (!result.isDisambiguation && !result.error) {
          break
        }
      }
    }

    if (result.error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { url: articleUrl }),
        data: null,
        error: result.error,
      }
    }

    if (!result.sections || !result.wikiTitle) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { url: articleUrl }),
        data: null,
        error: "No sections found in Wikipedia article",
      }
    }

    // Use AI (Gemini Flash) or regex fallback to select biography-relevant sections
    const selectionResult = await selectBiographySections(actor.name, result.sections)

    const sectionSelectionCost = selectionResult.costUsd

    // Always fetch intro (section 0) for basic biographical context
    const sectionTexts: Array<{ title: string; text: string }> = []

    const introText = await this.fetchSectionContent(result.wikiTitle, "0")
    if (introText) {
      const cleaned = this.cleanSectionText(introText)
      if (cleaned.length >= MIN_SECTION_LENGTH) {
        sectionTexts.push({ title: "Introduction", text: cleaned })
      }
    }

    // Fetch each selected personal life section
    for (const sectionTitle of selectionResult.selectedSections) {
      const section = result.sections.find((s) => s.line === sectionTitle)
      if (!section) continue

      const sectionHtml = await this.fetchSectionContent(result.wikiTitle, section.index)
      if (!sectionHtml) continue

      const cleaned = this.cleanSectionText(sectionHtml)
      if (cleaned.length >= MIN_SECTION_LENGTH) {
        sectionTexts.push({ title: sectionTitle, text: cleaned })
      }
    }

    // If no sections had substantial content, return failure
    if (sectionTexts.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, {
          url: articleUrl,
          publication: "Wikipedia",
          domain: "en.wikipedia.org",
        }),
        data: null,
        error: "No substantial biographical content found in Wikipedia article",
      }
    }

    // Format combined text with section headers
    const combinedText = sectionTexts.map(({ title, text }) => `[${title}] ${text}`).join("\n\n")

    const confidence = this.calculateBiographicalConfidence(combinedText)
    const resolvedUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(result.wikiTitle)}`

    const sourceData: RawBiographySourceData = {
      sourceName: "Wikipedia Biography",
      sourceType: BiographySourceType.WIKIPEDIA_BIO,
      text: combinedText,
      url: resolvedUrl,
      confidence,
      publication: "Wikipedia",
      articleTitle: result.wikiTitle.replace(/_/g, " "),
      domain: "en.wikipedia.org",
      contentType: "biography",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: resolvedUrl,
        publication: "Wikipedia",
        articleTitle: result.wikiTitle.replace(/_/g, " "),
        domain: "en.wikipedia.org",
        contentType: "biography",
        rawData: { sectionSelectionCost },
      }),
      data: sourceData,
    }
  }

  /**
   * Fetch the section list for a Wikipedia article.
   *
   * Returns sections array plus a flag indicating whether the page
   * appears to be a disambiguation page.
   */
  private async fetchArticleSections(
    title: string,
    _startTime: number
  ): Promise<{
    sections: WikipediaSection[] | null
    wikiTitle: string | null
    isDisambiguation: boolean
    error?: string
  }> {
    const url =
      `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(title)}` +
      `&prop=sections&format=json&redirects=1`

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return {
          sections: null,
          wikiTitle: null,
          isDisambiguation: false,
          error: `Wikipedia API HTTP ${response.status}`,
        }
      }

      const data = (await response.json()) as WikipediaSectionsResponse

      if (data.error) {
        return {
          sections: null,
          wikiTitle: null,
          isDisambiguation: false,
          error: `Wikipedia API error: ${data.error.info}`,
        }
      }

      if (!data.parse || !data.parse.sections) {
        return {
          sections: null,
          wikiTitle: null,
          isDisambiguation: false,
          error: "No parse data in Wikipedia response",
        }
      }

      const sections = data.parse.sections
      const wikiTitle = data.parse.title

      if (isDisambiguationPage(sections)) {
        return {
          sections: null,
          wikiTitle: null,
          isDisambiguation: true,
        }
      }

      return {
        sections,
        wikiTitle,
        isDisambiguation: false,
      }
    } catch (error) {
      return {
        sections: null,
        wikiTitle: null,
        isDisambiguation: false,
        error: error instanceof Error ? error.message : "Unknown error fetching sections",
      }
    }
  }

  /**
   * Fetch the HTML content of a specific Wikipedia section.
   *
   * @param title - Wikipedia article title
   * @param sectionIndex - Section index (0 = intro)
   * @returns Raw HTML content string, or null on error
   */
  private async fetchSectionContent(title: string, sectionIndex: string): Promise<string | null> {
    const url =
      `${WIKIPEDIA_API_BASE}?action=parse&page=${encodeURIComponent(title)}` +
      `&section=${sectionIndex}&prop=text&format=json&redirects=1`

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": this.userAgent },
        signal: this.createTimeoutSignal(),
      })

      if (!response.ok) {
        return null
      }

      const data = (await response.json()) as WikipediaSectionContentResponse

      if (data.error || !data.parse?.text?.["*"]) {
        return null
      }

      return data.parse.text["*"]
    } catch {
      return null
    }
  }

  /**
   * Clean a section's HTML content into plain text.
   *
   * Uses the inline extractTextFromHtml helper, then runs through
   * the mechanical pre-clean pipeline to further strip noise.
   */
  private cleanSectionText(html: string): string {
    // First pass: Wikipedia-specific HTML extraction
    const extracted = extractTextFromHtml(html)

    // Second pass: mechanical pre-clean for any remaining noise
    const { text } = mechanicalPreClean(extracted)

    return text
  }
}
