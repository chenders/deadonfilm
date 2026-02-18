/**
 * AI-assisted Wikipedia section selection for biography enrichment.
 *
 * Analyzes Wikipedia section titles to identify which sections contain
 * personal life information (childhood, education, family, relationships,
 * pre-fame life) rather than career/fame sections.
 *
 * Unlike the death-sources version, this always falls back to regex
 * selection when AI is unavailable, rather than returning empty results.
 *
 * Cost: ~$0.0001 per query using Gemini Flash 2.0
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
const GEMINI_FLASH_MODEL = "gemini-2.0-flash"

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
  /** Section titles that were selected as relevant */
  selectedSections: string[]
  /** Optional reasoning for debugging/logging */
  reasoning?: string
  /** Cost of the AI call in USD */
  costUsd: number
  /** Whether AI selection was used (false = fallback to regex) */
  usedAI: boolean
  /** Error message if AI selection failed */
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
 * Parsed response from Gemini.
 */
interface ParsedSelectionResponse {
  sections: string[]
  reasoning?: string
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
 * Build the prompt for Gemini to select biography-relevant sections.
 */
function buildBiographySectionPrompt(actorName: string, sectionTitles: string[]): string {
  const sectionsFormatted = sectionTitles.map((title, i) => `${i + 1}. ${title}`).join("\n")

  return `You are analyzing Wikipedia sections for "${actorName}" to find PERSONAL LIFE information for a biography.

Available sections:
${sectionsFormatted}

Select ALL sections that might contain:
- Childhood, family background, upbringing, home life
- Education, schools, scholarships, academic achievements
- Personal relationships, marriages, divorces, children, family
- Pre-fame life, early jobs, struggles, pivotal moments
- Military service, wartime experiences
- Legal issues, health challenges, personal struggles
- Personality traits, hobbies, interests, lesser-known facts
- What first brought them into public life or their field

DO NOT select sections about:
- Filmography, discography, selected works, career achievements
- Awards and nominations, box office performance
- References, external links, see also, notes, bibliography
- Critical reception, legacy (unless it contains personal details)

Return JSON only:
{"sections": ["Section Title 1", "Section Title 2", ...], "reasoning": "Brief explanation"}

Be inclusive - it's better to include a section that turns out irrelevant than miss personal details hidden in an unexpected section.

IMPORTANT: Return section titles EXACTLY as they appear in the list above. Case matters.`
}

/**
 * Strip number prefix from a section title if present.
 * Handles formats like "27. Health problems" -> "Health problems"
 */
function stripNumberPrefix(title: string): string {
  return title.replace(/^\d+\.\s*/, "")
}

/**
 * Parse the Gemini response to extract selected sections.
 */
function parseSelectionResponse(responseText: string): ParsedSelectionResponse | null {
  try {
    // Find JSON in the response (handles markdown-wrapped JSON)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.sections)) {
      return null
    }

    // Filter to strings and strip any number prefixes that Gemini may have included
    const sections = parsed.sections
      .filter((s: unknown): s is string => typeof s === "string")
      .map(stripNumberPrefix)

    return {
      sections,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
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
 * Check if AI section selection is available (API key configured).
 */
export function isAISectionSelectionAvailable(): boolean {
  return !!getApiKey()
}

/**
 * Select biography-relevant sections using regex pattern matching.
 * Used as fallback when AI is unavailable or fails.
 *
 * @param sections - All sections from the Wikipedia article
 * @returns Array of section titles matching biography patterns
 */
export function regexFallbackSelection(sections: WikipediaSection[]): string[] {
  return sections
    .filter((section) => {
      const title = section.line
      // Skip sections matching exclusion patterns
      const isSkipped = SKIP_PATTERNS.some((pattern) => pattern.test(title))
      if (isSkipped) return false
      // Include sections matching inclusion patterns
      return INCLUDE_PATTERNS.some((pattern) => pattern.test(title))
    })
    .map((section) => section.line)
}

/**
 * Select biography-relevant Wikipedia sections using AI (Gemini Flash),
 * with regex fallback when AI is unavailable or fails.
 *
 * Key difference from death-sources version: on AI failure, this falls back
 * to regex selection (returning actual sections) instead of returning empty array.
 *
 * @param actorName - Name of the actor for context
 * @param sections - All sections from the Wikipedia article
 * @param options - Optional configuration (maxSections)
 * @returns Selection result with chosen sections and cost
 */
export async function selectBiographySections(
  actorName: string,
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

  const apiKey = getApiKey()

  if (!apiKey) {
    // Fall back to regex selection
    const fallbackSections = regexFallbackSelection(sections).slice(0, maxSections)
    return {
      selectedSections: fallbackSections,
      costUsd: 0,
      usedAI: false,
      error: "Google AI API key not configured (GOOGLE_AI_API_KEY)",
    }
  }

  const sectionTitles = sections.map((s) => s.line)
  const prompt = buildBiographySectionPrompt(actorName, sectionTitles)

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
          maxOutputTokens: 500,
        },
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout to prevent hanging
    })

    if (!response.ok) {
      const errorText = await response.text()
      // Fall back to regex on HTTP errors
      const fallbackSections = regexFallbackSelection(sections).slice(0, maxSections)
      return {
        selectedSections: fallbackSections,
        costUsd: 0,
        usedAI: false,
        error: `Gemini API error: ${response.status} - ${errorText}`,
      }
    }

    const data = (await response.json()) as GeminiApiResponse

    if (data.error) {
      // Fall back to regex on API errors
      const fallbackSections = regexFallbackSelection(sections).slice(0, maxSections)
      return {
        selectedSections: fallbackSections,
        costUsd: 0,
        usedAI: false,
        error: `Gemini API error: ${data.error.message}`,
      }
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    const parsed = parseSelectionResponse(responseText)

    if (!parsed || parsed.sections.length === 0) {
      // Fall back to regex on malformed/empty AI response
      const fallbackSections = regexFallbackSelection(sections).slice(0, maxSections)
      return {
        selectedSections: fallbackSections,
        reasoning: "AI returned no sections, fell back to regex",
        costUsd: 0.0001, // Still charge for the API call
        usedAI: false,
        error: "AI returned no valid sections, fell back to regex",
      }
    }

    // Validate that returned sections exist in the original list (case-insensitive match)
    const validSections = parsed.sections.filter((selected) =>
      sectionTitles.some((title) => title.toLowerCase() === selected.toLowerCase())
    )

    // Map back to exact case from original titles
    const normalizedSections = validSections.map((selected) => {
      const match = sectionTitles.find((title) => title.toLowerCase() === selected.toLowerCase())
      return match || selected
    })

    // Limit to maxSections
    const limitedSections = normalizedSections.slice(0, maxSections)

    return {
      selectedSections: limitedSections,
      reasoning: parsed.reasoning,
      costUsd: 0.0001, // Gemini Flash cost per query
      usedAI: true,
    }
  } catch (error) {
    // Fall back to regex on network/timeout errors
    const fallbackSections = regexFallbackSelection(sections).slice(0, maxSections)
    return {
      selectedSections: fallbackSections,
      costUsd: 0,
      usedAI: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
