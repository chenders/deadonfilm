/**
 * AI-assisted Wikipedia date extraction using Gemini Flash.
 *
 * Extracts birth and death years from Wikipedia intro text using AI instead
 * of regex patterns. This handles complex articles (like Joseph Stalin) where
 * regex matches wrong dates from non-biographical parentheticals.
 *
 * Cost: ~$0.0001 per query using Gemini Flash 2.0
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
const GEMINI_FLASH_MODEL = "gemini-2.0-flash"

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
 * Gemini API response structure.
 */
interface GeminiApiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string
      }>
    }
  }>
  error?: {
    code: number
    message: string
    status: string
  }
}

/**
 * Parsed date response from Gemini.
 */
interface ParsedDateResponse {
  birthYear: number | null
  deathYear: number | null
}

/**
 * Build the prompt for Gemini to extract birth/death years.
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
 * Parse the Gemini response to extract birth/death years.
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
 * Get the Gemini API key from environment.
 */
function getApiKey(): string | undefined {
  return process.env.GOOGLE_AI_API_KEY
}

/**
 * Check if AI date extraction is available (API key configured).
 */
export function isAIDateExtractionAvailable(): boolean {
  return !!getApiKey()
}

/**
 * Extract birth/death years from Wikipedia intro text using AI (Gemini Flash).
 *
 * @param actorName - Name of the actor for context
 * @param introText - The introduction text from the Wikipedia article
 * @returns Extraction result with years and cost
 */
export async function extractDatesWithAI(
  actorName: string,
  introText: string
): Promise<DateExtractionResult> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      birthYear: null,
      deathYear: null,
      costUsd: 0,
      usedAI: false,
      error: "Google AI API key not configured (GOOGLE_AI_API_KEY)",
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
    const url = `${GEMINI_API_BASE}/models/${GEMINI_FLASH_MODEL}:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 100,
        },
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        birthYear: null,
        deathYear: null,
        costUsd: 0,
        usedAI: false,
        error: `Gemini API error: ${response.status} - ${errorText}`,
      }
    }

    const data = (await response.json()) as GeminiApiResponse

    if (data.error) {
      return {
        birthYear: null,
        deathYear: null,
        costUsd: 0,
        usedAI: false,
        error: `Gemini API error: ${data.error.message}`,
      }
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
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
