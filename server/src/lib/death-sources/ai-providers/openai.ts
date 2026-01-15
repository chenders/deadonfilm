/**
 * OpenAI AI providers for death information.
 *
 * Supports:
 * - GPT-4o-mini (~$0.0003/query) - cheapest, good quality
 * - GPT-4o (~$0.01/query) - most capable
 */

import OpenAI from "openai"
import { BaseDataSource } from "../base-source.js"
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

/**
 * Build a prompt for extracting death circumstances from an AI model.
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
 * Parse AI response into enrichment data.
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

    const prompt = buildDeathPrompt(actor)

    try {
      console.log(`${this.name} query for: ${actor.name}`)

      const response = await client.chat.completions.create({
        model: this.modelId,
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      })

      const responseText = response.choices[0]?.message?.content || ""

      const parsed = parseAIResponse(responseText)

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

      return {
        success: true,
        source: this.createSourceEntry(startTime, confidence, undefined, prompt, {
          response: responseText,
          parsed,
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
