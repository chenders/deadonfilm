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
import type {
  ActorForEnrichment,
  SourceLookupResult,
  ProjectReference,
  RelatedCelebrity,
} from "../types.js"
import { DataSourceType } from "../types.js"
import { resolveGeminiUrls, type ResolvedUrl } from "../url-resolver.js"
import {
  buildEnrichedDeathPrompt,
  parseEnrichedResponse,
  type EnrichedDeathResponse,
} from "./shared-prompt.js"

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

/**
 * Parse Gemini API response (fallback).
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
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
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
  sources: string[]
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
      groundingChunks?: Array<{
        web?: {
          uri: string
          title?: string
        }
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

    // Use shared enriched prompt for career context
    const prompt = buildEnrichedDeathPrompt(actor, this.requireSources, this.requireReliableSources)

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
          maxOutputTokens: 8192,
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

      // Parse using shared parser first, then fallback
      const enrichedParsed = parseEnrichedResponse(responseText)
      const parsed = enrichedParsed || parseGeminiResponse(responseText)

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

      // Extract grounding URLs from grounding chunks (redirect URLs)
      const groundingMetadata = data.candidates?.[0]?.groundingMetadata
      const groundingUrls =
        groundingMetadata?.groundingChunks
          ?.filter((chunk) => chunk.web?.uri)
          ?.map((chunk) => chunk.web!.uri) || []

      // Resolve grounding redirect URLs to their final destinations
      let resolvedSources: ResolvedUrl[] = []
      if (groundingUrls.length > 0) {
        try {
          resolvedSources = await resolveGeminiUrls(groundingUrls)
        } catch (error) {
          console.warn("Failed to resolve Gemini grounding URLs:", error)
        }
      }

      // Use the first resolved source URL, falling back to parsed sources
      const sourceUrl = resolvedSources[0]?.finalUrl || parsed.sources?.[0] || undefined

      // Convert career context fields if using enriched parser
      const lastProject = this.convertLastProject(enrichedParsed)
      const posthumousReleases = this.convertPosthumousReleases(enrichedParsed)
      const relatedCelebrities = this.convertRelatedCelebrities(enrichedParsed)

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, sourceUrl, prompt, {
          response: responseText,
          parsed,
          groundingMetadata,
          resolvedSources, // Store resolved URLs for display
        }),
        data: {
          circumstances: parsed.circumstances,
          rumoredCircumstances:
            enrichedParsed?.rumored_circumstances ??
            (parsed as ParsedGeminiResponse).rumoredCircumstances ??
            null,
          notableFactors:
            enrichedParsed?.notable_factors ??
            (parsed as ParsedGeminiResponse).notableFactors ??
            [],
          relatedCelebrities,
          locationOfDeath:
            enrichedParsed?.location_of_death ??
            (parsed as ParsedGeminiResponse).locationOfDeath ??
            null,
          additionalContext: null,
          lastProject,
          careerStatusAtDeath: enrichedParsed?.career_status_at_death ?? null,
          posthumousReleases,
          relatedDeaths: enrichedParsed?.related_deaths ?? null,
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

  /**
   * Convert last_project from response to ProjectReference.
   */
  private convertLastProject(
    parsed: Partial<EnrichedDeathResponse> | null
  ): ProjectReference | null {
    if (!parsed?.last_project) return null
    return {
      title: parsed.last_project.title,
      year: parsed.last_project.year ?? null,
      tmdbId: null,
      imdbId: null,
      type: parsed.last_project.type ?? "unknown",
    }
  }

  /**
   * Convert posthumous_releases from response to ProjectReference[].
   */
  private convertPosthumousReleases(
    parsed: Partial<EnrichedDeathResponse> | null
  ): ProjectReference[] | null {
    if (!parsed?.posthumous_releases || parsed.posthumous_releases.length === 0) return null
    return parsed.posthumous_releases.map((p) => ({
      title: p.title,
      year: p.year ?? null,
      tmdbId: null,
      imdbId: null,
      type: p.type ?? "unknown",
    }))
  }

  /**
   * Convert related_celebrities from response to RelatedCelebrity[].
   */
  private convertRelatedCelebrities(
    parsed: Partial<EnrichedDeathResponse> | null
  ): RelatedCelebrity[] {
    if (!parsed?.related_celebrities || parsed.related_celebrities.length === 0) return []
    return parsed.related_celebrities.map((c) => ({
      name: c.name,
      tmdbId: null,
      relationship: c.relationship,
    }))
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
