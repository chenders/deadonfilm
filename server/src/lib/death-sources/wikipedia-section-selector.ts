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
  /** Linked Wikipedia article titles to fetch for additional context */
  linkedArticles?: string[]
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
  linkedArticles?: string[]
  reasoning?: string
}

/**
 * Build the prompt for Gemini to select relevant sections.
 */
function buildSectionSelectionPrompt(
  actorName: string,
  sectionTitles: string[],
  includeLinkedArticles: boolean = false
): string {
  const sectionsFormatted = sectionTitles.map((title, i) => `${i + 1}. ${title}`).join("\n")

  const basePrompt = `You are analyzing Wikipedia sections for "${actorName}" to find death/health/incident information.

Available sections:
${sectionsFormatted}

Select ALL sections that might contain:
- Death circumstances, date, location, funeral, memorials
- Health conditions, illnesses, medical history, hospitalizations
- Accidents, incidents, injuries (including non-fatal ones that relate to health)
- Assassination attempts, attacks, violence
- Controversies that involved physical harm or health impacts
- Notable incidents that may relate to their eventual death or health decline
- Any section mentioning specific medical conditions, surgeries, or treatments`

  if (includeLinkedArticles) {
    return `${basePrompt}

Also identify up to 2 Wikipedia article titles that are commonly linked from these sections and would contain detailed information about:
- Specific accidents, incidents, or events (e.g., "Dick_Cheney_hunting_incident")
- Assassination attempts or attacks (e.g., "Attempted_assassination_of_Ronald_Reagan")
- Specific health events or medical procedures
- Crashes, disasters, or tragedies the person was involved in

Return JSON only:
{"sections": ["Section Title 1", "Section Title 2", ...], "linkedArticles": ["Article_Title_1", "Article_Title_2"], "reasoning": "Brief explanation"}

For linkedArticles, use Wikipedia article title format (underscores for spaces, e.g., "Dick_Cheney_hunting_incident").
Only include linkedArticles if you are confident such articles exist and would provide valuable additional context.

Be inclusive for sections - it's better to include a section that turns out irrelevant than miss important information.
For example, "Hunting and Fishing" might contain info about a hunting accident, "Personal life" might mention health struggles.

IMPORTANT: Return section titles EXACTLY as they appear in the list above. Case matters.`
  }

  return `${basePrompt}

Return JSON only:
{"sections": ["Section Title 1", "Section Title 2", ...], "reasoning": "Brief explanation"}

Be inclusive - it's better to include a section that turns out irrelevant than miss important information.
For example, "Hunting and Fishing" might contain info about a hunting accident, "Personal life" might mention health struggles.

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
 * Parse the Gemini response to extract selected sections and linked articles.
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

    // Filter to strings and strip any number prefixes that Gemini may have included
    const sections = parsed.sections
      .filter((s: unknown): s is string => typeof s === "string")
      .map(stripNumberPrefix)

    // Extract linked articles if present
    const linkedArticles = Array.isArray(parsed.linkedArticles)
      ? parsed.linkedArticles.filter((s: unknown): s is string => typeof s === "string")
      : undefined

    return {
      sections,
      linkedArticles,
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
  const includeLinkedArticles = options.followLinkedArticles ?? false
  const prompt = buildSectionSelectionPrompt(actorName, sectionTitles, includeLinkedArticles)

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

    // Limit linked articles
    const maxLinkedArticles =
      options.maxLinkedArticles ?? DEFAULT_WIKIPEDIA_OPTIONS.maxLinkedArticles ?? 2
    const limitedLinkedArticles = parsed.linkedArticles?.slice(0, maxLinkedArticles)

    return {
      selectedSections: limitedSections,
      linkedArticles: limitedLinkedArticles,
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
    linkedArticles?: string[]
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
      linkedArticles: result.linkedArticles,
      reasoning: result.reasoning,
      usedAI: result.usedAI,
      error: result.error,
    },
  }
}
