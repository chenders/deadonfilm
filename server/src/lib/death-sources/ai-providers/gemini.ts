/**
 * Google Gemini AI providers for death information.
 *
 * Gemini is Google's multimodal AI model with optional Search grounding.
 * - Gemini Flash: Fast, cost-effective (~$0.0001/query)
 * - Gemini Pro: More capable (~$0.002/query)
 *
 * Search grounding allows the model to access Google Search results,
 * making it particularly useful for recent deaths.
 *
 * API: https://ai.google.dev/gemini-api/docs
 * - Requires API key (GOOGLE_AI_API_KEY environment variable)
 * - REST API compatible
 */

import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

/**
 * Build a prompt for extracting death circumstances from Gemini.
 */
function buildDeathPrompt(actor: ActorForEnrichment): string {
  const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : "unknown"
  const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : "unknown"

  return `You are researching the death of ${actor.name}, an actor who was born in ${birthYear} and died in ${deathYear}.

Please provide information about how ${actor.name} died. Focus on:
1. The circumstances surrounding their death (how it happened)
2. Any notable or unusual factors about their death
3. Any rumors or disputed information about their death (if any)
4. The location where they died (if known)

Important:
- Only provide factual information you're confident about
- Distinguish between confirmed facts and rumors/speculation
- If you don't have reliable information, say so

Respond ONLY with JSON in this exact format:
{
  "circumstances": "Description of how they died, or null if unknown",
  "notable_factors": ["factor1", "factor2"] or [] if none,
  "rumored_circumstances": "Any disputed or rumored aspects, or null if none",
  "location_of_death": "City, State/Country or null if unknown",
  "confidence": "high" | "medium" | "low"
}

If you don't have any reliable information about their death:
{"circumstances": null, "notable_factors": [], "rumored_circumstances": null, "location_of_death": null, "confidence": null}`
}

/**
 * Parse Gemini API response.
 */
function parseGeminiResponse(responseText: string): ParsedGeminiResponse | null {
  try {
    // Find JSON in the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      circumstances: parsed.circumstances || null,
      notableFactors: Array.isArray(parsed.notable_factors) ? parsed.notable_factors : [],
      rumoredCircumstances: parsed.rumored_circumstances || null,
      locationOfDeath: parsed.location_of_death || null,
      confidence: parsed.confidence || null,
    }
  } catch {
    return null
  }
}

interface ParsedGeminiResponse {
  circumstances: string | null
  notableFactors: string[]
  rumoredCircumstances: string | null
  locationOfDeath: string | null
  confidence: "high" | "medium" | "low" | null
}

interface GeminiApiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string
      }>
    }
    groundingMetadata?: {
      webSearchQueries?: string[]
      searchEntryPoint?: {
        renderedContent: string
      }
      groundingSupports?: Array<{
        segment: {
          startIndex: number
          endIndex: number
          text: string
        }
        groundingChunkIndices: number[]
        confidenceScores: number[]
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
 * Base class for Gemini-based providers.
 */
abstract class GeminiBaseSource extends BaseDataSource {
  abstract readonly modelId: string
  abstract readonly useSearchGrounding: boolean

  private get apiKey(): string | undefined {
    return process.env.GOOGLE_AI_API_KEY
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    if (!this.apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Google AI API key not configured (GOOGLE_AI_API_KEY)",
      }
    }

    const prompt = buildDeathPrompt(actor)

    try {
      console.log(`${this.name} query for: ${actor.name}`)

      // Build request body
      const requestBody: Record<string, unknown> = {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 800,
        },
      }

      // Add search grounding for supported models
      if (this.useSearchGrounding) {
        requestBody.tools = [
          {
            googleSearch: {},
          },
        ]
      }

      const url = `${GEMINI_API_BASE}/models/${this.modelId}:generateContent?key=${this.apiKey}`

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, undefined, prompt),
          data: null,
          error: `Gemini API error: ${response.status} - ${errorText}`,
        }
      }

      const data = (await response.json()) as GeminiApiResponse

      if (data.error) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, undefined, prompt),
          data: null,
          error: `Gemini API error: ${data.error.message}`,
        }
      }

      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ""

      const parsed = parseGeminiResponse(responseText)

      if (!parsed || !parsed.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, undefined, prompt, {
            response: responseText,
          }),
          data: null,
          error: "No death information in response",
        }
      }

      // Map confidence to numeric value
      // Search-grounded responses get higher confidence
      const baseConfidenceMap = this.useSearchGrounding
        ? { high: 0.85, medium: 0.65, low: 0.4 }
        : { high: 0.75, medium: 0.55, low: 0.35 }

      const confidence = parsed.confidence ? baseConfidenceMap[parsed.confidence] : 0.4

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, undefined, prompt, {
          response: responseText,
          parsed,
          groundingMetadata: data.candidates?.[0]?.groundingMetadata,
        }),
        data: {
          circumstances: parsed.circumstances,
          rumoredCircumstances: parsed.rumoredCircumstances,
          notableFactors: parsed.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: parsed.locationOfDeath,
          additionalContext: null,
        },
      }
    } catch (error) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0, undefined, prompt),
        data: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

/**
 * Gemini Flash provider - fast and cost-effective (~$0.0001/query).
 * Does not use search grounding.
 */
export class GeminiFlashSource extends GeminiBaseSource {
  readonly name = "Gemini Flash"
  readonly type = DataSourceType.GEMINI_FLASH
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.0001
  readonly modelId = "gemini-2.0-flash"
  readonly useSearchGrounding = false

  // Rate limit
  protected minDelayMs = 200
}

/**
 * Gemini Pro provider - more capable with search grounding (~$0.002/query).
 * Uses Google Search grounding for access to current information.
 *
 * Note: gemini-1.5-pro was retired April 29, 2025. Using gemini-2.5-flash
 * which offers better performance with search grounding capabilities.
 */
export class GeminiProSource extends GeminiBaseSource {
  readonly name = "Gemini Pro"
  readonly type = DataSourceType.GEMINI_PRO
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.002
  readonly modelId = "gemini-2.5-flash"
  readonly useSearchGrounding = true

  // Rate limit
  protected minDelayMs = 500
}
