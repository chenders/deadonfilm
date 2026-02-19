/**
 * Wikipedia biography source for personal life content.
 *
 * Uses wtf_wikipedia to fetch and parse Wikipedia articles, producing clean
 * plaintext with no citation markers, footnotes, or HTML artifacts.
 *
 * Uses the biography section selector (Gemini Flash) to identify which
 * sections contain personal/biographical content.
 *
 * Always includes the article intro (section 0) for basic biographical context.
 * Handles disambiguation pages by retrying with _(actor) / _(actress) suffixes.
 */

import wtf from "wtf_wikipedia"

type WtfDocument = InstanceType<typeof wtf.Document>
import { BaseBiographySource, type BiographyLookupResult } from "../base-source.js"
import {
  BiographySourceType,
  type ActorForBiography,
  type RawBiographySourceData,
} from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import { selectBiographySections, type WikipediaSection } from "../wikipedia-section-selector.js"

// Minimum character count for a section to be included in output
const MIN_SECTION_LENGTH = 50

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
    let doc = await this.fetchDocument(baseTitle)

    // If disambiguation or not found, try with _(actor) and _(actress) suffixes
    if (!doc || doc.isDisambiguation()) {
      for (const suffix of ["_(actor)", "_(actress)"]) {
        const altTitle = baseTitle + suffix
        const altDoc = await this.fetchDocument(altTitle)
        if (altDoc && !altDoc.isDisambiguation()) {
          doc = altDoc
          break
        }
      }
    }

    if (!doc || doc.isDisambiguation()) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { url: articleUrl }),
        data: null,
        error: doc ? "Disambiguation page detected" : "Article not found",
      }
    }

    const sections = doc.sections() as wtf.Section[]
    if (sections.length === 0) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, { url: articleUrl }),
        data: null,
        error: "No sections found in Wikipedia article",
      }
    }

    // Map wtf sections to WikipediaSection interface for section selector
    const wikiSections: WikipediaSection[] = sections.map((s: wtf.Section, i: number) => ({
      index: String(i),
      line: s.title() || "Introduction",
      level: String(s.depth()),
      anchor: (s.title() || "Introduction").replace(/ /g, "_"),
    }))

    // Use AI (Gemini Flash) or regex fallback to select biography-relevant sections
    const selectionResult = await selectBiographySections(actor.name, wikiSections)
    const sectionSelectionCost = selectionResult.costUsd

    // Always fetch intro (section 0) for basic biographical context
    const sectionTexts: Array<{ title: string; text: string }> = []

    const introSection = sections[0]
    if (introSection) {
      const introText = introSection.text({})
      if (introText.length >= MIN_SECTION_LENGTH) {
        sectionTexts.push({ title: "Introduction", text: introText })
      }
    }

    // Fetch each selected personal life section
    for (const sectionTitle of selectionResult.selectedSections) {
      const section = sections.find(
        (s: wtf.Section) => (s.title() || "Introduction") === sectionTitle
      )
      if (!section) continue

      const text = section.text({})
      if (text.length >= MIN_SECTION_LENGTH) {
        sectionTexts.push({ title: sectionTitle, text })
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
    const resolvedTitle = doc.title() || baseTitle.replace(/_/g, " ")
    const resolvedUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(resolvedTitle.replace(/ /g, "_"))}`

    const sourceData: RawBiographySourceData = {
      sourceName: "Wikipedia Biography",
      sourceType: BiographySourceType.WIKIPEDIA_BIO,
      text: combinedText,
      url: resolvedUrl,
      confidence,
      publication: "Wikipedia",
      articleTitle: resolvedTitle,
      domain: "en.wikipedia.org",
      contentType: "biography",
    }

    return {
      success: true,
      source: this.createSourceEntry(startTime, confidence, {
        url: resolvedUrl,
        publication: "Wikipedia",
        articleTitle: resolvedTitle,
        domain: "en.wikipedia.org",
        contentType: "biography",
        rawData: { sectionSelectionCost },
      }),
      data: sourceData,
    }
  }

  /**
   * Fetch a Wikipedia document using wtf_wikipedia.
   * Returns null if the article doesn't exist.
   */
  private async fetchDocument(title: string): Promise<WtfDocument | null> {
    try {
      const doc = await wtf.fetch(title)
      // wtf.fetch returns Document | null for single string input
      return (doc as WtfDocument | null) ?? null
    } catch {
      return null
    }
  }
}
