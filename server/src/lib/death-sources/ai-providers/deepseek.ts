/**
 * DeepSeek AI provider for death information.
 *
 * DeepSeek is one of the cheapest AI options available:
 * - DeepSeek-V3: ~$0.0005/query (extremely cost-effective)
 * - Uses OpenAI-compatible API
 * - Different training corpus than Claude/OpenAI
 *
 * Best used for older deaths in its training data.
 */

import OpenAI from "openai"
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

const DEEPSEEK_BASE_URL = "https://api.deepseek.com"

/**
 * DeepSeek source - extremely cost-effective AI option.
 * Best for deaths in its training data (not recent).
 */
export class DeepSeekSource extends BaseDataSource {
  readonly name = "DeepSeek"
  readonly type = DataSourceType.DEEPSEEK
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.0005 // ~$0.0005/query - cheapest AI option
  readonly reliabilityTier = ReliabilityTier.AI_MODEL

  private client: OpenAI | null = null

  // DeepSeek-V3 model
  private readonly modelId = "deepseek-chat"

  // Rate limit - be conservative
  protected minDelayMs = 1000

  isAvailable(): boolean {
    return !!process.env.DEEPSEEK_API_KEY
  }

  private getClient(): OpenAI | null {
    if (!process.env.DEEPSEEK_API_KEY) {
      return null
    }
    if (!this.client) {
      // DeepSeek uses OpenAI-compatible API
      this.client = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: DEEPSEEK_BASE_URL,
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
        error: "DeepSeek API key not configured",
      }
    }

    // Use shared enriched prompt for career context
    const prompt = buildEnrichedDeathPrompt(actor, this.requireSources, this.requireReliableSources)

    try {
      console.log(`DeepSeek query for: ${actor.name}`)

      const response = await client.chat.completions.create({
        model: this.modelId,
        max_tokens: 1000,
        temperature: 0.1, // Low temperature for factual responses
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant helping to document deaths of actors. " +
              "Provide factual information about how the specified person died. " +
              "Include career context like their last project and career status at time of death. " +
              "Distinguish between confirmed facts and rumors/speculation. " +
              "If you don't know or are uncertain, say so clearly.",
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
      const parsed = enrichedParsed || this.parseResponse(responseText)

      if (!parsed || !parsed.circumstances) {
        return {
          success: false,
          source: this.createSourceEntry(startTime, 0, undefined, prompt, {
            response: responseText,
          }),
          data: null,
          error: "No death information found",
        }
      }

      // DeepSeek without web search gets moderate confidence
      const confidence =
        parsed.confidence === "high" ? 0.7 : parsed.confidence === "medium" ? 0.5 : 0.3

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
            (parsed as ParsedDeepSeekResponse).rumoredCircumstances ??
            null,
          notableFactors:
            enrichedParsed?.notable_factors ??
            (parsed as ParsedDeepSeekResponse).notableFactors ??
            [],
          relatedCelebrities,
          locationOfDeath:
            enrichedParsed?.location_of_death ??
            (parsed as ParsedDeepSeekResponse).locationOfDeath ??
            null,
          additionalContext: (parsed as ParsedDeepSeekResponse).additionalContext ?? null,
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
      tmdb_id: null,
      relationship: c.relationship,
    }))
  }

  /**
   * Parse DeepSeek response (fallback).
   */
  private parseResponse(responseText: string): ParsedDeepSeekResponse | null {
    try {
      // Find JSON in the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        // Try to extract information from prose response
        return this.parseProseResponse(responseText)
      }

      const parsed = JSON.parse(jsonMatch[0])

      return {
        circumstances: parsed.circumstances || null,
        notableFactors: Array.isArray(parsed.notable_factors) ? parsed.notable_factors : [],
        rumoredCircumstances: parsed.rumored_circumstances || null,
        locationOfDeath: parsed.location_of_death || null,
        additionalContext: parsed.additional_context || null,
        confidence: parsed.confidence || null,
      }
    } catch {
      // If JSON parsing fails, try prose parsing
      return this.parseProseResponse(responseText)
    }
  }

  /**
   * Parse a prose response when JSON isn't returned.
   */
  private parseProseResponse(text: string): ParsedDeepSeekResponse | null {
    // Look for death-related sentences
    const sentences = text.split(/[.!?]+/).map((s) => s.trim())
    const deathKeywords = ["died", "death", "passed away", "cause of death", "killed"]

    const relevantSentences = sentences.filter((s) => {
      const lower = s.toLowerCase()
      return deathKeywords.some((k) => lower.includes(k))
    })

    if (relevantSentences.length === 0) {
      return null
    }

    // Check if the response indicates uncertainty
    const uncertaintyKeywords = [
      "i don't know",
      "i don't have",
      "unable to find",
      "no information",
      "uncertain",
      "not sure",
      "cannot confirm",
    ]
    const lower = text.toLowerCase()
    for (const keyword of uncertaintyKeywords) {
      if (lower.includes(keyword)) {
        return null // DeepSeek doesn't know
      }
    }

    // Extract circumstances from relevant sentences
    const circumstances = relevantSentences.slice(0, 3).join(". ")

    // Try to extract notable factors
    const notableKeywords = [
      "accident",
      "unexpected",
      "sudden",
      "young",
      "tragedy",
      "suicide",
      "overdose",
      "murder",
      "controversial",
    ]
    const notableFactors = notableKeywords.filter((k) => text.toLowerCase().includes(k))

    return {
      circumstances,
      notableFactors,
      rumoredCircumstances: null,
      locationOfDeath: null,
      additionalContext: null,
      confidence: "medium",
    }
  }
}

interface ParsedDeepSeekResponse {
  circumstances: string | null
  notableFactors: string[]
  rumoredCircumstances: string | null
  locationOfDeath: string | null
  additionalContext: string | null
  confidence: "high" | "medium" | "low" | null
}
