/**
 * Grok AI provider for death information.
 *
 * Grok is xAI's large language model with unique access to X/Twitter data.
 * This makes it particularly useful for:
 * - Recent deaths that were discussed on social media
 * - Deaths with significant public reaction
 * - Celebrity deaths with viral discussions
 *
 * API: https://docs.x.ai/api
 * - Requires API key (XAI_API_KEY environment variable)
 * - Uses OpenAI-compatible API format
 * - Cost: ~$0.005/query for grok-2
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

const XAI_BASE_URL = "https://api.x.ai/v1"

/**
 * Grok source - xAI's model with X/Twitter data access.
 * Best for recent, high-profile deaths with social media discussion.
 */
export class GrokSource extends BaseDataSource {
  readonly name = "Grok"
  readonly type = DataSourceType.GROK
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.005 // ~$0.005/query for grok-2

  private client: OpenAI | null = null

  // Grok-2 model (latest)
  private readonly modelId = "grok-2-latest"

  // Rate limit - be conservative
  protected minDelayMs = 1000

  isAvailable(): boolean {
    return !!process.env.XAI_API_KEY
  }

  private getClient(): OpenAI | null {
    if (!process.env.XAI_API_KEY) {
      return null
    }
    if (!this.client) {
      // xAI uses OpenAI-compatible API
      this.client = new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: XAI_BASE_URL,
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
        error: "xAI API key not configured (XAI_API_KEY)",
      }
    }

    // Use shared enriched prompt for career context
    const prompt = buildEnrichedDeathPrompt(actor, this.requireSources)

    try {
      console.log(`Grok query for: ${actor.name}`)

      const response = await client.chat.completions.create({
        model: this.modelId,
        max_tokens: 1000,
        temperature: 0.1, // Low temperature for factual responses
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant helping to document deaths of actors. " +
              "You have access to real-time information and social media discussions. " +
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

      // Grok with X/Twitter access gets good confidence for recent deaths
      const confidence =
        parsed.confidence === "high" ? 0.8 : parsed.confidence === "medium" ? 0.6 : 0.35

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
            (parsed as ParsedGrokResponse).rumoredCircumstances ??
            null,
          notableFactors:
            enrichedParsed?.notable_factors ?? (parsed as ParsedGrokResponse).notableFactors ?? [],
          relatedCelebrities,
          locationOfDeath:
            enrichedParsed?.location_of_death ??
            (parsed as ParsedGrokResponse).locationOfDeath ??
            null,
          additionalContext: (parsed as ParsedGrokResponse).additionalContext ?? null,
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

  /**
   * Parse Grok response (fallback).
   */
  private parseResponse(responseText: string): ParsedGrokResponse | null {
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
  private parseProseResponse(text: string): ParsedGrokResponse | null {
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
        return null // Grok doesn't know
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
      "viral",
      "trending",
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

interface ParsedGrokResponse {
  circumstances: string | null
  notableFactors: string[]
  rumoredCircumstances: string | null
  locationOfDeath: string | null
  additionalContext: string | null
  confidence: "high" | "medium" | "low" | null
}
