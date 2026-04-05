/**
 * Sonnet-powered integrator for surprise discovery findings.
 *
 * Takes verified findings from the research pipeline and integrates them into
 * an existing biography using Claude Sonnet. Supports two strategies:
 *   - "append-only" (default): Claude decides per-finding whether each should
 *     become a lesser-known fact, a narrative insert, or be discarded.
 *   - "re-synthesize": Claude rewrites the full narrative incorporating findings.
 *
 * Model: claude-sonnet-4-20250514
 * Pricing: input $3/M tokens, output $15/M tokens
 */

import Anthropic from "@anthropic-ai/sdk"
import { logger } from "../../logger.js"
import { stripMarkdownCodeFences } from "../../claude-batch/response-parser.js"
import type { ResearchedAssociation, IntegratedFinding } from "./types.js"

const MODEL = "claude-sonnet-4-20250514"
const MAX_TOKENS = 2048

// Sonnet pricing per million tokens
const INPUT_COST_PER_MILLION = 3
const OUTPUT_COST_PER_MILLION = 15

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
 * Builds the prompt for the "append-only" integration strategy.
 *
 * Asks Sonnet to classify each finding as: LESSER_KNOWN_FACT, NARRATIVE_INSERT,
 * or DISCARD, without rewriting the existing narrative.
 *
 * @param actorName - Full actor name
 * @param existingNarrative - The actor's current biography text
 * @param existingFacts - Current lesser-known facts array
 * @param findings - Verified associations to integrate
 * @returns The complete prompt text
 */
export function buildAppendOnlyPrompt(
  actorName: string,
  existingNarrative: string,
  existingFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>,
  findings: ResearchedAssociation[]
): string {
  const factsList =
    existingFacts.length > 0 ? existingFacts.map((f) => `- ${f.text}`).join("\n") : "(none yet)"

  const findingsList = findings
    .map(
      (f) =>
        `Term: "${f.term}"\nClaim: ${f.claimExtracted}\nVerified by: ${f.verificationSource ?? "unknown"}\nExcerpt: ${f.verificationExcerpt ?? "(none)"}`
    )
    .join("\n\n")

  return `You are integrating newly discovered facts about ${actorName} into their existing biography.

EXISTING BIOGRAPHY NARRATIVE:
${existingNarrative}

EXISTING LESSER-KNOWN FACTS:
${factsList}

NEWLY VERIFIED FINDINGS:
${findingsList}

For each finding, decide how to handle it:
- LESSER_KNOWN_FACT: A surprising standalone tidbit that doesn't fit naturally into the narrative prose. Write a single, punchy sentence.
- NARRATIVE_INSERT: A biographical fact that should be woven into the narrative prose. Write the sentence to insert, and note where it fits (e.g., "after the paragraph about early life").
- DISCARD: The finding is not valuable enough to add (already covered, too minor, or doesn't add meaningful context).

Do NOT rewrite the entire narrative. Only add genuinely new information that isn't already implied or stated.

Respond with ONLY valid JSON in this exact format:
{
  "findings": [
    {
      "term": "the association term",
      "destination": "lesserKnownFacts" | "narrative" | "discarded",
      "text": "the fact text to add (empty string if discarded)"
    }
  ],
  "updatedNarrative": null
}`
}

/**
 * Builds the prompt for the "re-synthesize" integration strategy.
 *
 * Asks Sonnet to return the full updated narrative with findings incorporated,
 * plus classify each finding for tracking purposes.
 *
 * @param actorName - Full actor name
 * @param existingNarrative - The actor's current biography text
 * @param existingFacts - Current lesser-known facts array
 * @param findings - Verified associations to integrate
 * @returns The complete prompt text
 */
export function buildReSynthesizePrompt(
  actorName: string,
  existingNarrative: string,
  existingFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>,
  findings: ResearchedAssociation[]
): string {
  const factsList =
    existingFacts.length > 0 ? existingFacts.map((f) => `- ${f.text}`).join("\n") : "(none yet)"

  const findingsList = findings
    .map(
      (f) =>
        `Term: "${f.term}"\nClaim: ${f.claimExtracted}\nVerified by: ${f.verificationSource ?? "unknown"}\nExcerpt: ${f.verificationExcerpt ?? "(none)"}`
    )
    .join("\n\n")

  return `You are updating the biography of ${actorName} with newly discovered verified facts.

EXISTING BIOGRAPHY NARRATIVE:
${existingNarrative}

EXISTING LESSER-KNOWN FACTS:
${factsList}

NEWLY VERIFIED FINDINGS TO INCORPORATE:
${findingsList}

Rewrite the biography narrative to naturally incorporate these findings. Keep the personal life focus — weave in the new facts where they fit best in the story. Do not add career summaries, awards, or filmography.

Also classify each finding for tracking:
- "lesserKnownFacts": if you added it as a standalone fact rather than in the narrative
- "narrative": if you wove it into the narrative prose
- "discarded": if you chose not to include it (already covered, too minor, etc.)

Respond with ONLY valid JSON in this exact format:
{
  "findings": [
    {
      "term": "the association term",
      "destination": "lesserKnownFacts" | "narrative" | "discarded",
      "text": "the fact text added (empty string if discarded)"
    }
  ],
  "updatedNarrative": "the complete rewritten biography text"
}`
}

/**
 * Shape of the expected JSON response from Sonnet.
 */
interface SonnetResponse {
  findings: Array<{
    term: string
    destination: "lesserKnownFacts" | "narrative" | "discarded"
    text: string
  }>
  updatedNarrative: string | null
}

/**
 * Parses and validates the Sonnet JSON response.
 * Returns null on parse failure without throwing.
 *
 * @param text - Raw text response from Sonnet
 * @returns Parsed response or null on failure
 */
export function parseSonnetResponse(text: string): SonnetResponse | null {
  const stripped = stripMarkdownCodeFences(text)

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    logger.warn(
      { text: stripped.slice(0, 200) },
      "integrator: failed to parse Sonnet JSON response"
    )
    return null
  }

  if (typeof parsed !== "object" || parsed === null) {
    logger.warn({ parsed }, "integrator: Sonnet response is not an object")
    return null
  }

  const obj = parsed as Record<string, unknown>

  if (!Array.isArray(obj.findings)) {
    logger.warn({ parsed }, "integrator: Sonnet response missing 'findings' array")
    return null
  }

  const findings: SonnetResponse["findings"] = []

  for (const item of obj.findings) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).term !== "string" ||
      typeof (item as Record<string, unknown>).destination !== "string" ||
      typeof (item as Record<string, unknown>).text !== "string"
    ) {
      logger.warn({ item }, "integrator: skipping malformed finding in response")
      continue
    }

    const entry = item as { term: string; destination: string; text: string }
    const destination = entry.destination

    if (
      destination !== "lesserKnownFacts" &&
      destination !== "narrative" &&
      destination !== "discarded"
    ) {
      logger.warn({ destination }, "integrator: unknown destination value, skipping")
      continue
    }

    findings.push({
      term: entry.term,
      destination,
      text: entry.text,
    })
  }

  const updatedNarrative = typeof obj.updatedNarrative === "string" ? obj.updatedNarrative : null

  return { findings, updatedNarrative }
}

/**
 * Integrates verified findings into an existing biography using Claude Sonnet.
 *
 * Returns empty results (no API call) when the findings array is empty.
 * Handles errors and parse failures gracefully — cost is still tracked even
 * when parsing fails, and an empty result set is returned.
 *
 * @param actorName - Full actor name (e.g. "Helen Mirren")
 * @param existingNarrative - The actor's current biography text
 * @param existingFacts - Current lesser-known facts array
 * @param findings - Verified associations from the research pipeline
 * @param strategy - Integration approach: "append-only" (default) or "re-synthesize"
 * @returns Updated biography fields and integration metadata
 */
export async function integrateFindings(
  actorName: string,
  existingNarrative: string,
  existingFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>,
  findings: ResearchedAssociation[],
  strategy: "append-only" | "re-synthesize"
): Promise<{
  updatedNarrative: string | null
  newLesserKnownFacts: Array<{ text: string; sourceUrl: string | null; sourceName: string | null }>
  integrated: IntegratedFinding[]
  costUsd: number
}> {
  if (findings.length === 0) {
    return {
      updatedNarrative: null,
      newLesserKnownFacts: [],
      integrated: [],
      costUsd: 0,
    }
  }

  const prompt =
    strategy === "re-synthesize"
      ? buildReSynthesizePrompt(actorName, existingNarrative, existingFacts, findings)
      : buildAppendOnlyPrompt(actorName, existingNarrative, existingFacts, findings)

  logger.debug(
    { actorName, strategy, findingCount: findings.length },
    "integrator: calling Sonnet to integrate findings"
  )

  let costUsd = 0

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    })

    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    costUsd = calculateCost(inputTokens, outputTokens)

    const textBlock = response.content.find((block) => block.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      logger.warn({ actorName }, "integrator: no text block in Sonnet response")
      return { updatedNarrative: null, newLesserKnownFacts: [], integrated: [], costUsd }
    }

    const parsed = parseSonnetResponse(textBlock.text)
    if (!parsed) {
      logger.warn({ actorName }, "integrator: failed to parse Sonnet response, returning empty")
      return { updatedNarrative: null, newLesserKnownFacts: [], integrated: [], costUsd }
    }

    // Build the integrated findings list with verification sources from input
    const integrated: IntegratedFinding[] = parsed.findings.map((f) => {
      const original = findings.find((r) => r.term === f.term)
      return {
        term: f.term,
        destination: f.destination,
        verificationSource: original?.verificationSource ?? "unknown",
      }
    })

    // Collect new lesser-known facts (non-empty text for lesserKnownFacts destination)
    // Include source attribution from the verified finding when available.
    const newLesserKnownFacts = parsed.findings
      .filter((f) => f.destination === "lesserKnownFacts" && f.text.trim().length > 0)
      .map((f) => {
        const original = findings.find((r) => r.term === f.term)
        return {
          text: f.text.trim(),
          sourceUrl: original?.verificationUrl ?? null,
          sourceName: original?.verificationSource ?? null,
        }
      })

    logger.debug(
      {
        actorName,
        strategy,
        integrated: integrated.length,
        newFacts: newLesserKnownFacts.length,
        hasNarrativeUpdate: parsed.updatedNarrative !== null,
        costUsd,
      },
      "integrator: integration complete"
    )

    return {
      updatedNarrative: parsed.updatedNarrative,
      newLesserKnownFacts,
      integrated,
      costUsd,
    }
  } catch (error) {
    logger.error({ actorName, error }, "integrator: Sonnet API call failed")
    return { updatedNarrative: null, newLesserKnownFacts: [], integrated: [], costUsd }
  }
}
