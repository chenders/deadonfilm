/**
 * AI-assisted Wikipedia section selection using Gemini Flash.
 *
 * Analyzes Wikipedia section titles to identify which sections may contain
 * death/health/incident-relevant information that regex patterns would miss.
 *
 * Examples of non-obvious sections this can capture:
 * - "Assassination attempt" - links to detailed incident pages
 * - "Hunting and Fishing" - Dick Cheney shooting accident
 * - "Controversies" - incidents that contributed to notoriety
 * - "Health problems" - medical history leading to death
 *
 * Cost: ~$0.0001 per query using Gemini Flash 2.0
 */

import type { WikipediaOptions } from "./types.js"
import { DataSourceType, DEFAULT_WIKIPEDIA_OPTIONS } from "./types.js"

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
 * Result from AI section selection.
 */
export interface SectionSelectionResult {
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

/**
 * Build the prompt for Gemini to select relevant sections.
 */
function buildSectionSelectionPrompt(actorName: string, sectionTitles: string[]): string {
  const sectionsFormatted = sectionTitles.map((title, i) => `${i + 1}. ${title}`).join("\n")

  return `You are analyzing Wikipedia sections for "${actorName}" to find death/health/incident information.

Available sections:
${sectionsFormatted}

Select ALL sections that might contain:
- Death circumstances, date, location, funeral, memorials
- Health conditions, illnesses, medical history, hospitalizations
- Accidents, incidents, injuries (including non-fatal ones that relate to health)
- Assassination attempts, attacks, violence
- Controversies that involved physical harm or health impacts
- Notable incidents that may relate to their eventual death or health decline
- Any section mentioning specific medical conditions, surgeries, or treatments

Return JSON only:
{"sections": ["Section Title 1", "Section Title 2", ...], "reasoning": "Brief explanation"}

Be inclusive - it's better to include a section that turns out irrelevant than miss important information.
For example, "Hunting and Fishing" might contain info about a hunting accident, "Personal life" might mention health struggles.

IMPORTANT: Return section titles EXACTLY as they appear in the list above. Case matters.`
}

/**
 * Parse the Gemini response to extract selected sections.
 */
function parseSelectionResponse(responseText: string): ParsedSelectionResponse | null {
  try {
    // Find JSON in the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.sections)) {
      return null
    }

    return {
      sections: parsed.sections.filter((s: unknown): s is string => typeof s === "string"),
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
 * Select relevant Wikipedia sections using AI (Gemini Flash).
 *
 * @param actorName - Name of the actor for context
 * @param sections - All sections from the Wikipedia article
 * @param options - Wikipedia options including maxSections
 * @returns Selection result with chosen sections and cost
 */
export async function selectRelevantSections(
  actorName: string,
  sections: WikipediaSection[],
  options: WikipediaOptions = DEFAULT_WIKIPEDIA_OPTIONS
): Promise<SectionSelectionResult> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return {
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
      error: "Google AI API key not configured (GOOGLE_AI_API_KEY)",
    }
  }

  if (sections.length === 0) {
    return {
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
      error: "No sections provided",
    }
  }

  const sectionTitles = sections.map((s) => s.line)
  const prompt = buildSectionSelectionPrompt(actorName, sectionTitles)

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
      return {
        selectedSections: [],
        costUsd: 0,
        usedAI: false,
        error: `Gemini API error: ${response.status} - ${errorText}`,
      }
    }

    const data = (await response.json()) as GeminiApiResponse

    if (data.error) {
      return {
        selectedSections: [],
        costUsd: 0,
        usedAI: false,
        error: `Gemini API error: ${data.error.message}`,
      }
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    const parsed = parseSelectionResponse(responseText)

    if (!parsed || parsed.sections.length === 0) {
      return {
        selectedSections: [],
        reasoning: "No sections selected by AI",
        costUsd: 0.0001, // Still charge for the API call
        usedAI: true,
        error: "AI returned no valid sections",
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
    const maxSections = options.maxSections ?? DEFAULT_WIKIPEDIA_OPTIONS.maxSections ?? 10
    const limitedSections = normalizedSections.slice(0, maxSections)

    return {
      selectedSections: limitedSections,
      reasoning: parsed.reasoning,
      costUsd: 0.0001, // Gemini Flash cost per query
      usedAI: true,
    }
  } catch (error) {
    return {
      selectedSections: [],
      costUsd: 0,
      usedAI: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Create a source entry for tracking section selection costs.
 */
export function createSectionSelectionSourceEntry(result: SectionSelectionResult): {
  type: DataSourceType
  costUsd: number
  rawData: {
    selectedSections: string[]
    reasoning?: string
    usedAI: boolean
    error?: string
  }
} {
  return {
    type: DataSourceType.GEMINI_SECTION_SELECTOR,
    costUsd: result.costUsd,
    rawData: {
      selectedSections: result.selectedSections,
      reasoning: result.reasoning,
      usedAI: result.usedAI,
      error: result.error,
    },
  }
}
