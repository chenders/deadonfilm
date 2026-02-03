/**
 * AI-powered biography generator using Claude.
 *
 * Generates clean, 6-line-or-less biographies from TMDB content,
 * removing Wikipedia artifacts and citation markers.
 */

import Anthropic from "@anthropic-ai/sdk"
import type { Pool } from "pg"
import { recordAIUsage, aiUsageTableExists } from "../death-sources/ai-usage-tracker.js"
import { logger } from "../logger.js"

// Claude Sonnet model ID
const MODEL_ID = "claude-sonnet-4-20250514"

// Model pricing (USD per 1M tokens)
const PRICING = {
  input: 3.0, // $3.00 per 1M input tokens
  output: 15.0, // $15.00 per 1M output tokens
}

export type BiographySourceType = "wikipedia" | "tmdb" | "imdb"

export interface BiographyResult {
  biography: string | null
  hasSubstantiveContent: boolean
  sourceUrl: string | null
  sourceType: BiographySourceType | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

export interface ActorForBiography {
  id: number
  name: string
  tmdbId: number | null
  wikipediaUrl?: string | null
  imdbId?: string | null
}

/**
 * Sanitize an actor name before including it in an AI prompt.
 * Removes control characters and limits length to prevent prompt injection.
 */
export function sanitizeActorNameForPrompt(actorName: string): string {
  return (
    actorName
      .trim()
      .replace(/[\r\n]+/g, " ")
      // eslint-disable-next-line no-control-regex -- Intentional: sanitizing control characters from user input
      .replace(/[\x00-\x1f\x7f]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 200)
  )
}

/**
 * Sanitize a raw biography before including it in an AI prompt.
 * Normalizes whitespace, removes control characters, and limits length
 * to reduce prompt injection risk and prevent excessive token usage.
 */
export function sanitizeBiographyForPrompt(rawBiography: string): string {
  return (
    rawBiography
      .trim()
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // eslint-disable-next-line no-control-regex -- Intentional: sanitizing control characters from upstream text
      .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, "")
      // Collapse runs of more than two newlines to avoid extreme spacing
      .replace(/\n{3,}/g, "\n\n")
      // Limit to a reasonable length to keep prompts within token budget
      .slice(0, 4000)
  )
}

/**
 * Build the prompt for biography generation.
 */
export function buildBiographyPrompt(actorName: string, rawBiography: string): string {
  const safeActorName = sanitizeActorNameForPrompt(actorName)
  const safeBiography = sanitizeBiographyForPrompt(rawBiography)
  return `Rewrite this actor biography for ${safeActorName}. Create a clean, professional summary suitable for a movie database.

ORIGINAL BIOGRAPHY:
${safeBiography}

REQUIREMENTS:
1. Maximum 6 lines of text (this is a HARD LIMIT)
2. Focus on career highlights: notable roles, genres, career trajectory
3. Third person voice
4. DO NOT include:
   - Birth or death dates (these are displayed separately)
   - "From Wikipedia" or source attributions
   - Citation markers like [1], [2], etc.
   - URLs or external links
   - Family information unless career-relevant (e.g., "daughter of actors...")
   - Trailing ellipsis (...)
5. If the original is mostly biographical dates and family info with little career content, return has_substantive_content: false

Respond with JSON only:
{
  "biography": "Clean 6-line biography text or null if no career content",
  "has_substantive_content": true/false
}`
}

/**
 * Calculate cost from token counts.
 */
export function calculateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICING.input + outputTokens * PRICING.output) / 1_000_000
}

/**
 * Determine the best source URL for an actor's biography.
 * Priority: Wikipedia > TMDB > IMDb
 */
export function determineSourceUrl(
  actor: ActorForBiography
): { url: string; type: BiographySourceType } | null {
  if (actor.wikipediaUrl) {
    return { url: actor.wikipediaUrl, type: "wikipedia" }
  }

  if (actor.tmdbId) {
    return {
      url: `https://www.themoviedb.org/person/${actor.tmdbId}`,
      type: "tmdb",
    }
  }

  if (actor.imdbId) {
    return {
      url: `https://www.imdb.com/name/${actor.imdbId}`,
      type: "imdb",
    }
  }

  return null
}

/**
 * Parse the AI response JSON.
 */
function parseResponse(responseText: string): {
  biography: string | null
  hasSubstantiveContent: boolean
} {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { biography: null, hasSubstantiveContent: false }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return {
      biography: parsed.biography || null,
      hasSubstantiveContent: parsed.has_substantive_content === true,
    }
  } catch {
    // Fallback regex extraction - handles escaped quotes in JSON strings
    const bioMatch = responseText.match(/"biography"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    const contentMatch = responseText.match(/"has_substantive_content"\s*:\s*(true|false)/)

    let biography: string | null = null
    if (bioMatch) {
      try {
        // Decode JSON string escapes (e.g., \" -> ", \\ -> \)
        biography = JSON.parse(`"${bioMatch[1]}"`)
      } catch {
        biography = bioMatch[1]
      }
    }

    return {
      biography,
      hasSubstantiveContent: contentMatch ? contentMatch[1] === "true" : false,
    }
  }
}

let anthropicClient: Anthropic | null = null

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return null
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic()
  }
  return anthropicClient
}

/**
 * Generate a clean biography from raw TMDB content.
 */
export async function generateBiography(
  actor: ActorForBiography,
  rawBiography: string
): Promise<BiographyResult> {
  const startTime = Date.now()

  // Handle empty or too-short input
  if (!rawBiography || rawBiography.trim().length < 50) {
    return {
      biography: null,
      hasSubstantiveContent: false,
      sourceUrl: null,
      sourceType: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    }
  }

  const client = getClient()
  if (!client) {
    logger.info({ actorName: actor.name }, "No ANTHROPIC_API_KEY - skipping biography generation")
    return {
      biography: null,
      hasSubstantiveContent: false,
      sourceUrl: null,
      sourceType: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    }
  }

  try {
    const prompt = buildBiographyPrompt(actor.name, rawBiography)

    const message = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    })

    const latencyMs = Date.now() - startTime
    const inputTokens = message.usage.input_tokens
    const outputTokens = message.usage.output_tokens
    const costUsd = calculateCost(inputTokens, outputTokens)

    const responseText = message.content[0].type === "text" ? message.content[0].text : ""
    const { biography, hasSubstantiveContent } = parseResponse(responseText)

    const source = determineSourceUrl(actor)

    return {
      biography,
      hasSubstantiveContent,
      sourceUrl: source?.url || null,
      sourceType: source?.type || null,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    }
  } catch (error) {
    logger.error({ error, actorName: actor.name }, "Biography generation error")
    return {
      biography: null,
      hasSubstantiveContent: false,
      sourceUrl: null,
      sourceType: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - startTime,
    }
  }
}

/**
 * Generate biography and record AI usage metrics.
 */
export async function generateBiographyWithTracking(
  db: Pool,
  actor: ActorForBiography,
  rawBiography: string
): Promise<BiographyResult> {
  const result = await generateBiography(actor, rawBiography)

  // Record AI usage if we made an API call and the table exists
  if (result.inputTokens > 0) {
    const tableExists = await aiUsageTableExists(db)
    if (tableExists) {
      await recordAIUsage(db, {
        actorId: actor.id,
        model: MODEL_ID,
        operation: "biography_generation",
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        resultQuality: result.hasSubstantiveContent ? "high" : "low",
        circumstancesLength: result.biography?.length || null,
        notableFactorsCount: null,
        hasLocation: false,
      })
    }
  }

  return result
}
