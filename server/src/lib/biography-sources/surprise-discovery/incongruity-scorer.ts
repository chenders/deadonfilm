/**
 * Haiku-powered incongruity scorer for surprise discovery.
 *
 * Takes autocomplete suggestions that passed the boring filter and scores each
 * for how surprising the association is using Claude Haiku. Returns scored
 * candidates with cost tracking.
 *
 * All candidates are sent in a single batched API call to minimize cost.
 * Model: claude-haiku-4-5-20251001
 * Pricing: input $1.0/M tokens, output $5.0/M tokens
 */

import Anthropic from "@anthropic-ai/sdk"
import { logger } from "../../logger.js"
import { stripMarkdownCodeFences } from "../../claude-batch/response-parser.js"
import type { AutocompleteSuggestion, IncongruityCandidate } from "./types.js"

const MODEL = "claude-haiku-4-5-20251001"
const MAX_TOKENS = 4096

// Haiku pricing per million tokens
const INPUT_COST_PER_MILLION = 1.0
const OUTPUT_COST_PER_MILLION = 5.0

/** Maximum candidates per Haiku call to avoid response truncation. */
const BATCH_SIZE = 30

/**
 * Builds the prompt for Haiku incongruity scoring.
 *
 * @param actorName - Full actor name
 * @param terms - Association terms to score
 * @returns The complete prompt text
 */
export function buildIncongruityPrompt(actorName: string, terms: string[]): string {
  const termList = terms.map((t) => `- ${t}`).join("\n")

  return `For the actor ${actorName}, score each of these public associations for how SURPRISING the connection is (1-10).

A high score (7-10) means the association is unexpected and not obviously related to their career, personal life, or public persona. It should make someone think "wait, why are those two things connected?"

A low score (1-6) means it's predictable, expected, or easily explained by their career or public life.

Associations to score:
${termList}

Respond with ONLY a JSON array. Each element must have: "term" (string), "score" (number 1-10), "reasoning" (one sentence explaining why).
Example: [{"term": "example", "score": 8, "reasoning": "No obvious connection"}]`
}

/**
 * Calculates the cost in USD from token usage.
 *
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @returns Cost in USD
 */
export function calculateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION +
    (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION
  )
}

/**
 * Parses and validates the Haiku JSON response into scored candidates.
 * Clamps scores to 1-10 range. Returns null if parsing fails.
 *
 * @param text - Raw text response from Haiku
 * @param expectedTerms - Set of terms we requested scores for (for validation)
 * @returns Parsed candidates or null on error
 */
export function parseHaikuResponse(
  text: string,
  expectedTerms: Set<string>
): IncongruityCandidate[] | null {
  const stripped = stripMarkdownCodeFences(text)

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    logger.warn({ text: stripped }, "incongruity-scorer: failed to parse Haiku JSON response")
    return null
  }

  if (!Array.isArray(parsed)) {
    logger.warn({ parsed }, "incongruity-scorer: Haiku response is not an array")
    return null
  }

  const candidates: IncongruityCandidate[] = []

  for (const item of parsed) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).term !== "string" ||
      typeof (item as Record<string, unknown>).score !== "number" ||
      typeof (item as Record<string, unknown>).reasoning !== "string"
    ) {
      logger.warn({ item }, "incongruity-scorer: skipping malformed response item")
      continue
    }

    const entry = item as { term: string; score: number; reasoning: string }

    // Only include terms we actually requested
    if (!expectedTerms.has(entry.term)) {
      logger.warn({ term: entry.term }, "incongruity-scorer: skipping unexpected term in response")
      continue
    }

    // Clamp score to 1-10
    const score = Math.min(10, Math.max(1, Math.round(entry.score)))

    candidates.push({
      term: entry.term,
      score,
      reasoning: entry.reasoning,
    })
  }

  return candidates
}

/**
 * Score autocomplete suggestions for how surprising their association with
 * the actor is, using Claude Haiku in a single batched call.
 *
 * Returns an empty array (no API call) when no suggestions are provided.
 * Handles errors gracefully by returning empty candidates and zero cost.
 *
 * @param actorName - Full actor name (e.g. "John Wayne")
 * @param suggestions - Suggestions that passed the boring filter
 * @returns Scored candidates and total cost in USD
 */
export async function scoreIncongruity(
  actorName: string,
  suggestions: AutocompleteSuggestion[]
): Promise<{ candidates: IncongruityCandidate[]; costUsd: number }> {
  if (suggestions.length === 0) {
    return { candidates: [], costUsd: 0 }
  }

  const allTerms = suggestions.map((s) => s.term)
  const expectedTerms = new Set(allTerms)

  logger.debug(
    { actorName, termCount: allTerms.length, batches: Math.ceil(allTerms.length / BATCH_SIZE) },
    "incongruity-scorer: scoring suggestions with Haiku"
  )

  // Batch into chunks to avoid response truncation
  const allCandidates: IncongruityCandidate[] = []
  let totalCost = 0

  for (let i = 0; i < allTerms.length; i += BATCH_SIZE) {
    const batchTerms = allTerms.slice(i, i + BATCH_SIZE)
    const prompt = buildIncongruityPrompt(actorName, batchTerms)

    try {
      const client = new Anthropic()
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      })

      const inputTokens = response.usage.input_tokens
      const outputTokens = response.usage.output_tokens
      totalCost += calculateCost(inputTokens, outputTokens)

      const textBlock = response.content.find((block) => block.type === "text")
      if (!textBlock || textBlock.type !== "text") {
        logger.warn(
          { actorName, batch: Math.floor(i / BATCH_SIZE) + 1 },
          "incongruity-scorer: no text block in Haiku response"
        )
        continue
      }

      const candidates = parseHaikuResponse(textBlock.text, expectedTerms)
      if (candidates) {
        allCandidates.push(...candidates)
      }
    } catch (error) {
      logger.error(
        { actorName, error, batch: Math.floor(i / BATCH_SIZE) + 1 },
        "incongruity-scorer: Haiku API call failed"
      )
    }
  }

  logger.debug(
    { actorName, scored: allCandidates.length, costUsd: totalCost },
    "incongruity-scorer: scoring complete"
  )

  return { candidates: allCandidates, costUsd: totalCost }
}
