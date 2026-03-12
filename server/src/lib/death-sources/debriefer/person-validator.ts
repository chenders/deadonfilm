/**
 * Wikipedia person validation for the debriefer adapter.
 *
 * Returns an async validatePerson callback compatible with debriefer's
 * WikipediaOptions. Uses Gemini Flash AI for date extraction with regex
 * fallback, matching the old WikipediaSource.validatePersonByDates() logic.
 *
 * Validation flow:
 * 1. Extract birth/death years from the actor's context (TMDB data)
 * 2. Extract birth/death years from Wikipedia intro text (AI → regex fallback)
 * 3. Compare with 1-year tolerance (handles calendar conversion disagreements)
 * 4. Return false on mismatch → debriefer tries disambiguation suffixes
 */

import type { ResearchSubject } from "debriefer"
import { extractDatesWithAI, isAIDateExtractionAvailable } from "../wikipedia-date-extractor.js"
import pino from "pino"

const log = pino({ name: "person-validator" })

/**
 * Extract a 4-digit year from an ISO date string like "1979-06-11".
 * Returns null if the string is missing or unparseable.
 */
function yearFromDateString(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const year = new Date(dateStr).getFullYear()
  return isNaN(year) ? null : year
}

/**
 * Extract birth/death years from Wikipedia intro text using regex patterns.
 *
 * Tries patterns in priority order:
 * 1. Full date lifespan: "(Month DD, YYYY – Month DD, YYYY)"
 * 2. Simple year lifespan: "(YYYY–YYYY)"
 * 3. Individual "born"/"died" keywords or opening/closing parenthetical years
 */
function extractYearsWithRegex(introText: string): {
  birthYear: number | null
  deathYear: number | null
} {
  let birthYear: number | null = null
  let deathYear: number | null = null

  // Pattern 1: Full date lifespan — "(Month DD, YYYY – Month DD, YYYY)"
  const fullDateLifeSpanMatch = introText.match(
    /\(\s*[A-Z][a-z]+[^)]*?(\d{4})\s*[-–]\s*[A-Z][a-z]+[^)]*?(\d{4})\s*\)/
  )

  // Pattern 2: Simple year-only lifespan — "(YYYY–YYYY)"
  const lifeSpanMatch = introText.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/)

  if (fullDateLifeSpanMatch) {
    birthYear = parseInt(fullDateLifeSpanMatch[1], 10)
    deathYear = parseInt(fullDateLifeSpanMatch[2], 10)
  } else if (lifeSpanMatch) {
    birthYear = parseInt(lifeSpanMatch[1], 10)
    deathYear = parseInt(lifeSpanMatch[2], 10)
  } else {
    // Pattern 3: Individual "born"/"died" keywords
    const birthMatch = introText.match(/\bborn\b[^)]*?(\d{4})|^\s*\((\d{4})\s*[-–]/im)
    const deathMatch = introText.match(/\bdied\b[^)]*?(\d{4})|[-–]\s*(\d{4})\s*\)/im)

    if (birthMatch) {
      birthYear = parseInt(birthMatch[1] || birthMatch[2], 10)
    }
    if (deathMatch) {
      deathYear = parseInt(deathMatch[1] || deathMatch[2], 10)
    }
  }

  return { birthYear, deathYear }
}

/**
 * Creates a validatePerson callback for debriefer's WikipediaOptions.
 *
 * The callback validates that a Wikipedia article is about the correct person
 * by comparing birth/death years from the article text against the actor's
 * known dates in subject.context.
 *
 * Uses Gemini Flash AI for date extraction (handles complex cases like
 * Joseph Stalin's Wikipedia intro), with regex fallback when the AI API
 * key is not configured or the AI call fails.
 *
 * @returns Async validatePerson callback
 */
export function createPersonValidator(): (
  articleText: string,
  subject: ResearchSubject
) => Promise<boolean> {
  return async (articleText: string, subject: ResearchSubject): Promise<boolean> => {
    const ctx = (subject.context ?? {}) as Record<string, unknown>
    const actorBirthYear = yearFromDateString(ctx.birthday as string | null)
    const actorDeathYear = yearFromDateString(ctx.deathday as string | null)

    // Nothing to validate against — accept the article
    if (!actorBirthYear && !actorDeathYear) return true

    // Use only the intro text (first ~2000 chars) for date extraction
    const introText = articleText.slice(0, 2000)
    if (!introText.trim()) return true

    let wikiBirthYear: number | null = null
    let wikiDeathYear: number | null = null

    // Try AI extraction first
    if (isAIDateExtractionAvailable()) {
      const aiResult = await extractDatesWithAI(subject.name, introText)
      if (aiResult.usedAI && (aiResult.birthYear !== null || aiResult.deathYear !== null)) {
        log.debug(
          { actor: subject.name, birth: aiResult.birthYear, death: aiResult.deathYear },
          "AI date extraction succeeded"
        )
        wikiBirthYear = aiResult.birthYear
        wikiDeathYear = aiResult.deathYear
      } else if (aiResult.error) {
        log.debug({ actor: subject.name, error: aiResult.error }, "AI date extraction failed")
      }
    }

    // Fall back to regex if AI didn't produce results
    if (wikiBirthYear === null && wikiDeathYear === null) {
      const regexResult = extractYearsWithRegex(introText)
      wikiBirthYear = regexResult.birthYear
      wikiDeathYear = regexResult.deathYear
    }

    // No years extracted from Wikipedia — can't validate, accept the article
    if (wikiBirthYear === null && wikiDeathYear === null) return true

    // Compare with 1-year tolerance
    if (actorBirthYear && wikiBirthYear) {
      if (Math.abs(wikiBirthYear - actorBirthYear) > 1) {
        log.debug(
          { actor: subject.name, db: actorBirthYear, wiki: wikiBirthYear },
          "Birth year mismatch"
        )
        return false
      }
    }

    if (actorDeathYear && wikiDeathYear) {
      if (Math.abs(wikiDeathYear - actorDeathYear) > 1) {
        log.debug(
          { actor: subject.name, db: actorDeathYear, wiki: wikiDeathYear },
          "Death year mismatch"
        )
        return false
      }
    }

    return true
  }
}
