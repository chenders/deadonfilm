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
import type { ActorForEnrichment, SourceLookupResult } from "../types.js"
import { DataSourceType } from "../types.js"

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

    const prompt = this.buildPrompt(actor)

    try {
      console.log(`DeepSeek query for: ${actor.name}`)

      const response = await client.chat.completions.create({
        model: this.modelId,
        max_tokens: 800,
        temperature: 0.1, // Low temperature for factual responses
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant helping to document deaths of actors. " +
              "Provide factual information about how the specified person died. " +
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

      // DeepSeek without web search gets moderate confidence
      const confidence =
        parsed.confidence === "high" ? 0.7 : parsed.confidence === "medium" ? 0.5 : 0.3

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
   * Build a research prompt for DeepSeek.
   */
  private buildPrompt(actor: ActorForEnrichment): string {
    const deathDate = actor.deathday
      ? new Date(actor.deathday).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : "unknown date"

    const birthInfo = actor.birthday
      ? ` (born ${new Date(actor.birthday).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })})`
      : ""

    return `Research the death of ${actor.name}${birthInfo}, the actor who died on ${deathDate}.

I need accurate information about:
1. How they died (cause and circumstances)
2. Where they died (location)
3. Any notable or unusual factors about their death
4. Any disputed aspects, controversies, or alternative theories about their death

Important: Only provide information you are confident about. If uncertain, indicate that clearly.

Respond with JSON in this format:
{
  "circumstances": "How they died - be specific and accurate",
  "notable_factors": ["list of notable factors about the death"] or [],
  "rumored_circumstances": "Any disputed info, controversies, or alternative theories, or null if none",
  "location_of_death": "City, State/Country where they died, or null if unknown",
  "additional_context": "Any other relevant context about their death, or null",
  "confidence": "high" | "medium" | "low"
}

If you don't have reliable information about this person's death:
{"circumstances": null, "notable_factors": [], "rumored_circumstances": null, "location_of_death": null, "additional_context": null, "confidence": null}`
  }

  /**
   * Parse DeepSeek response.
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
