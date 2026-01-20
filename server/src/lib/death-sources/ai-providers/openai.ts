/**
 * OpenAI AI providers for death information.
 *
 * Supports:
 * - GPT-4o-mini (~$0.0003/query) - cheapest, good quality
 * - GPT-4o (~$0.01/query) - most capable
 */

import OpenAI from "openai"
import { BaseDataSource } from "../base-source.js"
import type {
  ActorForEnrichment,
  SourceLookupResult,
  ProjectReference,
  RelatedCelebrity,
} from "../types.js"
import { DataSourceType } from "../types.js"
import {
  buildEnrichedDeathPrompt,
  parseEnrichedResponse,
  type EnrichedDeathResponse,
} from "./shared-prompt.js"

/**
 * Parse AI response into enrichment data (fallback).
 */
function parseAIResponse(responseText: string): ParsedAIResponse | null {
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

interface ParsedAIResponse {
  circumstances: string | null
  notableFactors: string[]
  rumoredCircumstances: string | null
  locationOfDeath: string | null
  confidence: "high" | "medium" | "low" | null
}

/**
 * Base class for OpenAI-based providers.
 */
abstract class OpenAIBaseSource extends BaseDataSource {
  protected client: OpenAI | null = null
  abstract readonly modelId: string

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY
  }

  protected getClient(): OpenAI | null {
    if (!process.env.OPENAI_API_KEY) {
      return null
    }
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    }
    return this.client
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    const client = this.getClient()
    if (!client) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "OpenAI API key not configured",
      }
    }

    // Use shared enriched prompt for career context
    const prompt = buildEnrichedDeathPrompt(actor)

    try {
      console.log(`${this.name} query for: ${actor.name}`)

      const response = await client.chat.completions.create({
        model: this.modelId,
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant helping to document deaths of actors. " +
              "Include career context like their last project and career status at time of death. " +
              "Distinguish between confirmed facts and rumors/speculation.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      })

      const responseText = response.choices[0]?.message?.content || ""

      // Parse using shared parser first, then fallback
      const enrichedParsed = parseEnrichedResponse(responseText)
      const parsed = enrichedParsed || parseAIResponse(responseText)

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
      const confidenceMap = { high: 0.8, medium: 0.5, low: 0.3 }
      const confidence = parsed.confidence ? confidenceMap[parsed.confidence] : 0.4

      // Convert career context fields if using enriched parser
      const lastProject = this.convertLastProject(enrichedParsed)
      const posthumousReleases = this.convertPosthumousReleases(enrichedParsed)
      const relatedCelebrities = this.convertRelatedCelebrities(enrichedParsed)

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, undefined, prompt, {
          response: responseText,
          parsed,
        }),
        data: {
          circumstances: parsed.circumstances,
          rumoredCircumstances:
            enrichedParsed?.rumored_circumstances ??
            (parsed as ParsedAIResponse).rumoredCircumstances ??
            null,
          notableFactors:
            enrichedParsed?.notable_factors ?? (parsed as ParsedAIResponse).notableFactors ?? [],
          relatedCelebrities,
          locationOfDeath:
            enrichedParsed?.location_of_death ??
            (parsed as ParsedAIResponse).locationOfDeath ??
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
 * GPT-4o-mini provider - cheapest OpenAI option (~$0.0003/query).
 */
export class GPT4oMiniSource extends OpenAIBaseSource {
  readonly name = "GPT-4o-mini"
  readonly type = DataSourceType.OPENAI_GPT4O_MINI
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.0003
  readonly modelId = "gpt-4o-mini"

  // Rate limit: 500 RPM for tier 1
  protected minDelayMs = 200
}

/**
 * GPT-4o provider - most capable OpenAI option (~$0.01/query).
 */
export class GPT4oSource extends OpenAIBaseSource {
  readonly name = "GPT-4o"
  readonly type = DataSourceType.OPENAI_GPT4O
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.01
  readonly modelId = "gpt-4o"

  // Rate limit: 500 RPM for tier 1
  protected minDelayMs = 200
}
