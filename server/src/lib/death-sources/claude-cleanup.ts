/**
 * Claude Opus 4.5 cleanup module for death enrichment.
 *
 * Takes raw data gathered from multiple sources (Wikipedia, BFI, DuckDuckGo, etc.)
 * and passes it to Claude Opus 4.5 to extract clean, structured death information
 * suitable for display on the /death page.
 *
 * The cleanup step:
 * 1. Removes Wikipedia citation markers [1][2]
 * 2. Filters out career achievements unless death-related
 * 3. Creates comprehensive, publication-ready narratives
 * 4. Extracts structured fields (cause, location, notable factors)
 */

import Anthropic from "@anthropic-ai/sdk"
import type {
  ActorForEnrichment,
  CleanedDeathInfo,
  RawSourceData,
  ConfidenceLevel,
} from "./types.js"
import { getEnrichmentLogger } from "./logger.js"
import { recordCustomEvent, addCustomAttributes } from "../newrelic.js"

const MODEL_ID = "claude-opus-4-5-20251101"
const MAX_TOKENS = 2000

// Cost per million tokens (Opus 4.5)
const INPUT_COST_PER_MILLION = 15
const OUTPUT_COST_PER_MILLION = 75

/**
 * Response structure expected from Claude.
 */
interface ClaudeCleanupResponse {
  cause: string | null
  cause_confidence: ConfidenceLevel | null
  details: string | null
  details_confidence: ConfidenceLevel | null
  circumstances: string | null
  circumstances_confidence: ConfidenceLevel | null
  rumored_circumstances: string | null
  notable_factors: string[] | null
  location_of_death: string | null
  related_deaths: string | null
  additional_context: string | null
}

/**
 * Build the cleanup prompt for Claude Opus 4.5.
 */
export function buildCleanupPrompt(actor: ActorForEnrichment, rawSources: RawSourceData[]): string {
  const birthYear = actor.birthday ? new Date(actor.birthday).getFullYear() : null
  const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null
  const birthInfo = birthYear ? `born ${birthYear}, ` : ""

  const rawDataSection = rawSources
    .map(
      (s) => `--- ${s.sourceName} (confidence: ${(s.confidence * 100).toFixed(0)}%) ---\n${s.text}`
    )
    .join("\n\n")

  return `You are extracting death information for ${actor.name} (${birthInfo}died ${deathYear}).

Raw data gathered from multiple sources:

${rawDataSection}

Extract ALL death-related information into clean, publication-ready prose. Return JSON with these fields:

{
  "cause": "specific medical cause (e.g., 'pancreatic cancer', 'heart failure', 'hantavirus pulmonary syndrome'). Null if unknown.",
  "cause_confidence": "high|medium|low|disputed",
  "details": "2-4 sentences of medical context about the cause. Null if no details available.",
  "details_confidence": "high|medium|low|disputed",

  "circumstances": "COMPREHENSIVE narrative of the death. This is the main content for the death page. Include:
    - Full timeline of events leading to and surrounding the death
    - How and when the body was discovered, by whom
    - Location details (home, hospital, on set, etc.)
    - Other people involved or affected (family members who also died, witnesses)
    - First responder/medical examiner findings
    - Any investigations (police, coroner) and their conclusions
    - Media coverage significance if it was a major news story
    - Anything unusual, tragic, or newsworthy about the circumstances
    Write as clean prose suitable for a death page on an entertainment website. Multiple paragraphs are fine.",
  "circumstances_confidence": "high|medium|low|disputed",

  "rumored_circumstances": "Alternative accounts, disputed information, conspiracy theories, or unconfirmed reports. Null if none.",

  "notable_factors": ["array of tags describing notable aspects. Use any applicable from:
    on_set, vehicle_crash, fire, drowning, overdose, substance_involvement,
    suicide, homicide, suspicious_circumstances, celebrity_involvement,
    multiple_deaths, family_tragedy, public_incident, controversial,
    investigation, media_sensation, workplace_accident, medical_malpractice,
    natural_causes, alzheimers, cancer, heart_disease, covid_related"],

  "location_of_death": "city, state/province, country where they died. Null if unknown.",

  "related_deaths": "If family members or others died in connection (same incident, discovered together, etc.), describe here with names, relationships, causes, and timeline. Null if none.",

  "additional_context": "Career context relevant to the death (e.g., 'had retired from acting in 2004', 'was filming at the time', 'won two Academy Awards'). Null if not relevant or no notable context."
}

CRITICAL INSTRUCTIONS:
- Be THOROUGH in circumstances - capture the full story, not just the medical cause
- If the death was a major news story, capture WHY it was newsworthy
- Include related deaths (spouse, family) if they're part of the story
- Remove Wikipedia citation markers [1][2], "citation needed" tags
- Remove formatting artifacts from web scraping
- Do NOT include career achievements, filmography, or awards unless directly death-related
- Write clean, factual prose suitable for publication
- Use null for any field where information is not available
- Return ONLY valid JSON, no markdown code fences`
}

/**
 * Strip markdown code fences from JSON text.
 */
function stripMarkdownCodeFences(text: string): string {
  let jsonText = text.trim()
  if (jsonText.startsWith("```")) {
    const match = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (match) {
      jsonText = match[1].trim()
    } else {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").trim()
    }
  }
  return jsonText
}

/**
 * Clean up raw data with Claude Opus 4.5.
 *
 * @param actor - The actor to clean up data for
 * @param rawSources - Raw data gathered from various sources
 * @returns Cleaned, structured death information
 */
export async function cleanupWithClaude(
  actor: ActorForEnrichment,
  rawSources: RawSourceData[]
): Promise<{ cleaned: CleanedDeathInfo; costUsd: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required for Claude cleanup")
  }

  const logger = getEnrichmentLogger()
  const anthropic = new Anthropic()
  const prompt = buildCleanupPrompt(actor, rawSources)

  // Add New Relic attributes for Claude cleanup
  addCustomAttributes({
    "claude.cleanup.actorId": actor.id,
    "claude.cleanup.actorName": actor.name,
    "claude.cleanup.sourceCount": rawSources.length,
  })

  console.log(`  Claude cleanup for ${actor.name} (${rawSources.length} sources)...`)

  // Log the request
  logger.logClaudeCleanupRequest(actor.id, actor.name, rawSources.length, prompt)

  const response = await anthropic.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  })

  // Calculate cost
  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const costUsd =
    (inputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000

  // Extract text content for logging
  const textBlock = response.content.find((block) => block.type === "text")
  const responseText = textBlock?.type === "text" ? textBlock.text : ""

  // Log the response
  logger.logClaudeCleanupResponse(
    actor.id,
    actor.name,
    inputTokens,
    outputTokens,
    costUsd,
    responseText
  )

  console.log(
    `  Claude cleanup complete: ${inputTokens} input, ${outputTokens} output tokens ($${costUsd.toFixed(4)})`
  )

  // Record Claude API call in New Relic
  recordCustomEvent("ClaudeAPICall", {
    actorId: actor.id,
    actorName: actor.name,
    model: MODEL_ID,
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    costUsd: costUsd,
    purpose: "death_cleanup",
  })

  // Verify we have text content
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude")
  }

  // Parse JSON response
  const jsonText = stripMarkdownCodeFences(textBlock.text)
  let parsed: ClaudeCleanupResponse

  try {
    parsed = JSON.parse(jsonText) as ClaudeCleanupResponse
  } catch (error) {
    console.error(`JSON parse error for ${actor.name}:`, error)
    console.error("Raw response:", textBlock.text.substring(0, 500))
    throw new Error(
      `Failed to parse Claude response: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }

  // Convert to CleanedDeathInfo
  const cleaned: CleanedDeathInfo = {
    cause: parsed.cause,
    causeConfidence: parsed.cause_confidence,
    details: parsed.details,
    detailsConfidence: parsed.details_confidence,
    circumstances: parsed.circumstances,
    circumstancesConfidence: parsed.circumstances_confidence,
    rumoredCircumstances: parsed.rumored_circumstances,
    locationOfDeath: parsed.location_of_death,
    notableFactors: parsed.notable_factors || [],
    relatedDeaths: parsed.related_deaths,
    additionalContext: parsed.additional_context,
    cleanupSource: "claude-opus-4.5",
    cleanupTimestamp: new Date().toISOString(),
  }

  return { cleaned, costUsd }
}

/**
 * Estimate the cost of a cleanup call based on raw data length.
 *
 * @param rawSources - Raw data to be processed
 * @returns Estimated cost in USD
 */
export function estimateCleanupCost(rawSources: RawSourceData[]): number {
  // Rough estimate: 4 chars per token for input
  const totalChars = rawSources.reduce((sum, s) => sum + s.text.length, 0)
  const estimatedInputTokens = Math.ceil(totalChars / 4) + 500 // Add 500 for prompt overhead
  const estimatedOutputTokens = 800 // Average expected output

  return (
    (estimatedInputTokens * INPUT_COST_PER_MILLION) / 1_000_000 +
    (estimatedOutputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000
  )
}
