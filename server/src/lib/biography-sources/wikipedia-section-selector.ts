/**
 * Wikipedia section selection for biography enrichment (regex fallback only).
 *
 * AI-powered section selection is now handled by @debriefer/ai in the
 * debriefer adapter. This file provides regex-based section selection used by:
 * - WikipediaBiographySource (server/src/lib/biography-sources/sources/wikipedia.ts)
 * - Legacy orchestrator's resynthesizeFromCache path
 *
 * The Gemini dependency has been removed as part of the Claude consolidation.
 */

/**
 * Wikipedia section metadata from the API.
 */
export interface WikipediaSection {
  index: string
  line: string
  level: string
  anchor: string
}

/**
 * Result from biography section selection.
 */
export interface BiographySectionSelectionResult {
  selectedSections: string[]
  reasoning?: string
  costUsd: number
  usedAI: boolean
  error?: string
}

// Regex patterns for sections to INCLUDE (biography-relevant)
const INCLUDE_PATTERNS = [
  /early life/i,
  /personal life/i,
  /education/i,
  /family/i,
  /childhood/i,
  /background/i,
  /youth/i,
  /upbringing/i,
  /military/i,
  /marriage/i,
  /private life/i,
]

// Regex patterns for sections to SKIP (career/fame/meta)
const SKIP_PATTERNS = [
  /filmography/i,
  /awards/i,
  /discography/i,
  /references/i,
  /external links/i,
  /see also/i,
  /bibliography/i,
  /notes/i,
  /selected works/i,
  /career/i,
  /box office/i,
]

/**
 * AI section selection is no longer available (Gemini removed).
 * AI section filtering is handled by @debriefer/ai in the adapter.
 */
export function isAISectionSelectionAvailable(): boolean {
  return false
}

/**
 * Select biography-relevant sections using regex pattern matching.
 */
export function regexFallbackSelection(sections: WikipediaSection[]): string[] {
  return sections
    .filter((section) => {
      const title = section.line
      const isSkipped = SKIP_PATTERNS.some((pattern) => pattern.test(title))
      if (isSkipped) return false
      return INCLUDE_PATTERNS.some((pattern) => pattern.test(title))
    })
    .map((section) => section.line)
}

/**
 * Select biography-relevant Wikipedia sections.
 * Uses regex pattern matching only (AI selection removed — handled by @debriefer/ai).
 */
export async function selectBiographySections(
  _actorName: string,
  sections: WikipediaSection[],
  options?: { maxSections?: number }
): Promise<BiographySectionSelectionResult> {
  const maxSections = options?.maxSections ?? 10

  if (sections.length === 0) {
    return {
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
      error: "No sections provided",
    }
  }

  const fallbackSections = regexFallbackSelection(sections).slice(0, maxSections)
  return {
    selectedSections: fallbackSections,
    costUsd: 0,
    usedAI: false,
  }
}
