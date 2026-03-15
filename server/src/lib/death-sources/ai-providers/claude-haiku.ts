/**
 * Claude Haiku AI provider for death information.
 *
 * Uses Anthropic's Claude Haiku 4.5 model for cost-effective death enrichment.
 * Replaces GeminiFlashSource as the cheapest AI provider in Phase 8.
 *
 * Cost: ~$0.0001 per query
 * API: https://docs.anthropic.com/en/api
 * - Requires API key (ANTHROPIC_API_KEY environment variable)
 */

import Anthropic from "@anthropic-ai/sdk"
import { BaseDataSource } from "../base-source.js"
import type {
  ActorForEnrichment,
  SourceLookupResult,
  ProjectReference,
  RelatedCelebrity,
} from "../types.js"
import { DataSourceType, ReliabilityTier } from "../types.js"
import {
  buildEnrichedDeathPrompt,
  parseEnrichedResponse,
  type EnrichedDeathResponse,
} from "./shared-prompt.js"

const HAIKU_MODEL = "claude-haiku-4-5-20251001"

/**
 * Claude Haiku death source - fast and cost-effective (~$0.0001/query).
 * Uses Anthropic's smallest model for budget-friendly AI enrichment.
 */
export class ClaudeHaikuDeathSource extends BaseDataSource {
  readonly name = "Claude Haiku"
  readonly type = DataSourceType.GEMINI_FLASH // Reuse enum for backward compatibility with DB records
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.0001
  readonly reliabilityTier = ReliabilityTier.AI_MODEL
  protected domain = "api.anthropic.com"

  // Rate limit
  protected minDelayMs = 200

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY
  }

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    const startTime = Date.now()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return {
        success: false,
        source: this.createSourceEntry(startTime, 0),
        data: null,
        error: "Anthropic API key not configured (ANTHROPIC_API_KEY)",
      }
    }

    const prompt = buildEnrichedDeathPrompt(actor, this.requireSources, this.requireReliableSources)

    try {
      console.log(`Claude Haiku query for: ${actor.name}`)

      const client = new Anthropic({ apiKey })

      const message = await client.messages.create({
        model: HAIKU_MODEL,
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      })

      const responseText = message.content[0]?.type === "text" ? message.content[0].text : ""

      const parsed = parseEnrichedResponse(responseText)

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
      const confidenceMap = { high: 0.75, medium: 0.55, low: 0.35 }
      const confidence = parsed.confidence ? confidenceMap[parsed.confidence] : 0.4

      const sourceUrl = parsed.sources?.[0] || undefined

      // Convert career context fields
      const lastProject = this.convertLastProject(parsed)
      const posthumousReleases = this.convertPosthumousReleases(parsed)
      const relatedCelebrities = this.convertRelatedCelebrities(parsed)

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, sourceUrl, prompt, {
          response: responseText,
          parsed,
        }),
        data: {
          circumstances: parsed.circumstances,
          rumoredCircumstances: parsed.rumored_circumstances ?? null,
          notableFactors: parsed.notable_factors ?? [],
          relatedCelebrities,
          locationOfDeath: parsed.location_of_death ?? null,
          additionalContext: null,
          lastProject,
          careerStatusAtDeath: parsed.career_status_at_death ?? null,
          posthumousReleases,
          relatedDeaths: parsed.related_deaths ?? null,
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
      tmdb_id: null,
      relationship: c.relationship,
    }))
  }
}
