/**
 * Perplexity AI provider for death information.
 *
 * Perplexity is particularly useful because:
 * - Has built-in web search (real-time data)
 * - Great for recent deaths not in training data
 * - Uses OpenAI-compatible API
 *
 * Cost: ~$0.005/query for sonar-large model
 */

import OpenAI from "openai"
import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai"

/**
 * Perplexity source with built-in web search.
 * Best for recent deaths (within last 1-2 years).
 */
export class PerplexitySource extends BaseDataSource {
  readonly name = "Perplexity"
  readonly type = DataSourceType.PERPLEXITY
  readonly isFree = false
  readonly estimatedCostPerQuery = 0.005

  private client: OpenAI | null = null

  // Perplexity Sonar Pro - handles multi-step reasoning with real-time web search
  // See: https://docs.perplexity.ai/getting-started/models
  private readonly modelId = "sonar-pro"

  // Rate limit - be conservative
  protected minDelayMs = 1000

  isAvailable(): boolean {
    return !!process.env.PERPLEXITY_API_KEY
  }

  private getClient(): OpenAI | null {
    if (!process.env.PERPLEXITY_API_KEY) {
      return null
    }
    if (!this.client) {
      // Perplexity uses OpenAI-compatible API
      this.client = new OpenAI({
        apiKey: process.env.PERPLEXITY_API_KEY,
        baseURL: PERPLEXITY_BASE_URL,
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
        error: "Perplexity API key not configured",
      }
    }

    const prompt = this.buildPrompt(actor)

    try {
      console.log(`Perplexity search for: ${actor.name}`)

      const response = await client.chat.completions.create({
        model: this.modelId,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant helping to document deaths of actors. " +
              "Search for and provide factual information about how the specified person died. " +
              "Distinguish between confirmed facts and rumors/speculation.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      })

      const responseText = response.choices[0]?.message?.content || ""

      // Parse the response
      const parsed = this.parseResponse(responseText)

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

      // Perplexity with web search gets higher base confidence
      const confidence =
        parsed.confidence === "high" ? 0.85 : parsed.confidence === "medium" ? 0.65 : 0.45

      // Use the first source URL from Perplexity's web search results
      const sourceUrl = parsed.sources?.[0] || undefined

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, sourceUrl, prompt, {
          response: responseText,
          parsed,
        }),
        data: {
          circumstances: parsed.circumstances,
          rumoredCircumstances: parsed.rumoredCircumstances,
          notableFactors: parsed.notableFactors,
          relatedCelebrities: [],
          locationOfDeath: parsed.locationOfDeath,
          additionalContext: parsed.additionalContext,
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
   * Build a search-focused prompt for Perplexity.
   */
  private buildPrompt(actor: ActorForEnrichment): string {
    const deathDate = actor.deathday
      ? new Date(actor.deathday).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "unknown date"

    return `Search for how ${actor.name} (actor) died on ${deathDate}.

Respond with JSON only. No career info, awards, or biography.

Fields:
- circumstances: A narrative sentence describing how they died. Include context like where found, what led to death, medical details. Write as prose, not a list.
- location_of_death: City, State/Country
- notable_factors: Short tags only: "sudden", "long illness", "accident", "suicide", "overdose", "found unresponsive", "on life support". NOT medical conditions or diagnoses.
- rumored_circumstances: ONLY if there are disputed facts, alternative theories, or controversy. null if death is straightforward.
- sources: URLs where you found the information

{
  "circumstances": "narrative sentence",
  "location_of_death": "City, State or null",
  "notable_factors": ["tag"] or [],
  "rumored_circumstances": "disputed theory or null",
  "confidence": "high" | "medium" | "low",
  "sources": ["url1"]
}

Good examples:
{"circumstances": "She was found unresponsive at her home and pronounced dead at the scene. She had a history of seizures.", "location_of_death": "North Hills, California", "notable_factors": ["found unresponsive"], "rumored_circumstances": null, "confidence": "high", "sources": ["tmz.com/..."]}
{"circumstances": "He had been battling pancreatic cancer for several months, keeping his diagnosis secret from the public.", "location_of_death": "London, England", "notable_factors": ["long illness"], "rumored_circumstances": null, "confidence": "high", "sources": ["bbc.com/..."]}

If unknown: {"circumstances": null, "location_of_death": null, "notable_factors": [], "rumored_circumstances": null, "confidence": null, "sources": []}`
  }

  /**
   * Parse Perplexity response.
   */
  private parseResponse(responseText: string): ParsedPerplexityResponse | null {
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
        sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      }
    } catch {
      // If JSON parsing fails, try prose parsing
      return this.parseProseResponse(responseText)
    }
  }

  /**
   * Parse a prose response when JSON isn't returned.
   */
  private parseProseResponse(text: string): ParsedPerplexityResponse | null {
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
      sources: [],
    }
  }
}

interface ParsedPerplexityResponse {
  circumstances: string | null
  notableFactors: string[]
  rumoredCircumstances: string | null
  locationOfDeath: string | null
  additionalContext: string | null
  confidence: "high" | "medium" | "low" | null
  sources: string[]
}
