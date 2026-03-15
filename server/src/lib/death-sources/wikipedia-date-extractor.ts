/**
 * AI-assisted Wikipedia date extraction using Claude Haiku.
 *
 * Extracts birth and death years from Wikipedia intro text using AI instead
 * of regex patterns. This handles complex articles (like Joseph Stalin) where
 * regex matches wrong dates from non-biographical parentheticals.
 *
 * Cost: ~$0.0001 per query using Claude Haiku
 */

import Anthropic from "@anthropic-ai/sdk"

const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001"

const MIN_VALID_YEAR = 1000
const MAX_VALID_YEAR = 2100

/**
 * Result from AI date extraction.
 */
export interface DateExtractionResult {
  /** Extracted birth year, or null if not found */
  birthYear: number | null
  /** Extracted death year, or null if not found */
  deathYear: number | null
  /** Cost of the AI call in USD */
  costUsd: number
  /** Whether AI extraction was used (false = unavailable/failed) */
  usedAI: boolean
  /** Error message if AI extraction failed */
  error?: string
}

/**
 * Parsed date response from Claude.
 */
interface ParsedDateResponse {
  birthYear: number | null
  deathYear: number | null
}

/**
 * Build the prompt for Claude to extract birth/death years.
 */
function buildDateExtractionPrompt(actorName: string, introText: string): string {
  return `Extract the birth year and death year of "${actorName}" from this Wikipedia introduction text.

IMPORTANT: Only extract years that refer to the person's birth and death. Ignore dates for:
- Offices held, terms served, or political positions
- Buildings, monuments, or memorials
- Marriages, divorces, or other events
- Other people mentioned in the text

Text:
${introText}

Return JSON only: {"birthYear": YYYY, "deathYear": YYYY}
Use null for any year not found.`
}

/**
 * Validate that a year is within a reasonable range.
 */
function isValidYear(year: unknown): year is number {
  return (
    typeof year === "number" &&
    Number.isInteger(year) &&
    year >= MIN_VALID_YEAR &&
    year <= MAX_VALID_YEAR
  )
}

/**
 * Parse the Claude response to extract birth/death years.
 */
function parseDateResponse(responseText: string): ParsedDateResponse | null {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      birthYear: isValidYear(parsed.birthYear) ? parsed.birthYear : null,
      deathYear: isValidYear(parsed.deathYear) ? parsed.deathYear : null,
    }
  } catch {
    return null
  }
}

/**
 * Check if AI date extraction is available (Anthropic API key configured).
 */
export function isAIDateExtractionAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

/**
 * Extract birth/death years from Wikipedia intro text using AI (Claude Haiku).
 *
 * @param actorName - Name of the actor for context
 * @param introText - The introduction text from the Wikipedia article
 * @returns Extraction result with years and cost
 */
export async function extractDatesWithAI(
  actorName: string,
  introText: string
): Promise<DateExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    return {
      birthYear: null,
      deathYear: null,
      costUsd: 0,
      usedAI: false,
      error: "Anthropic API key not configured (ANTHROPIC_API_KEY)",
    }
  }

  if (!introText.trim()) {
    return {
      birthYear: null,
      deathYear: null,
      costUsd: 0,
      usedAI: false,
      error: "No intro text provided",
    }
  }

  const prompt = buildDateExtractionPrompt(actorName, introText)

  try {
    const anthropic = new Anthropic({ apiKey })

    const message = await anthropic.messages.create({
      model: CLAUDE_HAIKU_MODEL,
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
      // Low temperature for deterministic extraction
    })

    const responseText = message.content[0]?.type === "text" ? message.content[0].text : ""
    const parsed = parseDateResponse(responseText)

    if (!parsed) {
      return {
        birthYear: null,
        deathYear: null,
        costUsd: 0.0001,
        usedAI: true,
        error: "AI returned no valid date response",
      }
    }

    return {
      birthYear: parsed.birthYear,
      deathYear: parsed.deathYear,
      costUsd: 0.0001,
      usedAI: true,
    }
  } catch (error) {
    return {
      birthYear: null,
      deathYear: null,
      costUsd: 0,
      usedAI: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
