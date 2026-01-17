/**
 * AI Helper functions for death enrichment.
 *
 * Provides AI-powered link selection and content extraction using Claude Sonnet.
 * These functions help search sources identify the most relevant links and
 * extract death information from page content.
 *
 * Default model: claude-sonnet-4-20250514 (configurable via --ai-model flag)
 */

import Anthropic from "@anthropic-ai/sdk"
import type { ActorForEnrichment, EnrichmentData } from "./types.js"
import { getEnrichmentLogger } from "./logger.js"

// Default AI model for helpers (Sonnet is cost-effective for these tasks)
export const DEFAULT_AI_HELPER_MODEL = "claude-sonnet-4-20250514"
const MAX_TOKENS = 1000

// Cost per million tokens (Sonnet 4 - May 2025)
const SONNET_INPUT_COST_PER_MILLION = 3
const SONNET_OUTPUT_COST_PER_MILLION = 15

/**
 * Search result to be ranked by AI.
 */
export interface SearchResultForRanking {
  url: string
  title: string
  snippet: string
}

/**
 * AI-ranked link with relevance score.
 */
export interface RankedLink {
  url: string
  score: number
  reason: string
}

/**
 * Result from AI helper operations.
 */
export interface AIHelperResult<T> {
  data: T
  costUsd: number
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

/**
 * Calculate cost based on token usage.
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * SONNET_INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * SONNET_OUTPUT_COST_PER_MILLION) / 1_000_000
  )
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
 * Use AI to select the most relevant links from search results.
 *
 * Given a list of search results (URLs, titles, snippets), ranks them by
 * how likely they are to contain useful death information for the actor.
 *
 * @param actor - Actor to find death information for
 * @param searchResults - Search results to rank
 * @param maxLinks - Maximum number of links to return
 * @param model - AI model to use (default: claude-sonnet-4-20250514)
 * @returns Ranked links with scores and reasons
 */
export async function aiSelectLinks(
  actor: ActorForEnrichment,
  searchResults: SearchResultForRanking[],
  maxLinks: number,
  model?: string
): Promise<AIHelperResult<RankedLink[]>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY required for AI link selection")
  }

  const startTime = Date.now()
  const modelId = model || DEFAULT_AI_HELPER_MODEL
  const logger = getEnrichmentLogger()
  const anthropic = new Anthropic()

  const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

  // Build prompt for link ranking
  const resultsJson = JSON.stringify(
    searchResults.map((r, i) => ({
      index: i,
      url: r.url,
      title: r.title,
      snippet: r.snippet.substring(0, 300),
    })),
    null,
    2
  )

  const prompt = `You are helping find death information for ${actor.name}${deathYear ? ` (died ${deathYear})` : ""}.

Search results to rank:
${resultsJson}

Select up to ${maxLinks} URLs most likely to contain DETAILED death information (cause, circumstances, location).

Prioritize:
1. Obituaries from reputable news sources
2. Wikipedia or encyclopedia articles with death sections
3. Entertainment news obituaries (Variety, Hollywood Reporter, Deadline)
4. Memorial or tribute pages with biographical details

Avoid:
- Generic IMDb/TMDB actor pages (no death details)
- Social media posts
- Fan sites without sources
- Pages that only mention the death briefly

Return JSON array:
[
  {"url": "...", "score": 0.0-1.0, "reason": "brief explanation"}
]

Return ONLY valid JSON array, no markdown fences.`

  logger.debug(`[AI_LINK_SELECT] ${actor.name}`, { resultCount: searchResults.length })

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  })

  const latencyMs = Date.now() - startTime
  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const costUsd = calculateCost(inputTokens, outputTokens)

  // Extract text content
  const textBlock = response.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude for link selection")
  }

  // Parse JSON response
  const jsonText = stripMarkdownCodeFences(textBlock.text)
  let ranked: RankedLink[]

  try {
    ranked = JSON.parse(jsonText) as RankedLink[]
  } catch (error) {
    logger.debug(`[AI_LINK_SELECT_PARSE_ERROR]`, { raw: textBlock.text.substring(0, 200) })
    // Return empty array on parse failure
    ranked = []
  }

  logger.debug(`[AI_LINK_SELECT_COMPLETE] ${actor.name}`, {
    selectedCount: ranked.length,
    costUsd: costUsd.toFixed(4),
    latencyMs,
  })

  return {
    data: ranked.slice(0, maxLinks),
    costUsd,
    model: modelId,
    inputTokens,
    outputTokens,
    latencyMs,
  }
}

/**
 * Use AI to extract death information from page content.
 *
 * Takes raw page content (HTML converted to text) and extracts structured
 * death information for the actor.
 *
 * @param actor - Actor to extract death information for
 * @param pageContent - Text content of the page (HTML tags already stripped)
 * @param pageUrl - URL of the page (for context)
 * @param model - AI model to use (default: claude-sonnet-4-20250514)
 * @returns Extracted death information
 */
export async function aiExtractDeathInfo(
  actor: ActorForEnrichment,
  pageContent: string,
  pageUrl: string,
  model?: string
): Promise<AIHelperResult<Partial<EnrichmentData>>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY required for AI content extraction")
  }

  const startTime = Date.now()
  const modelId = model || DEFAULT_AI_HELPER_MODEL
  const logger = getEnrichmentLogger()
  const anthropic = new Anthropic()

  const deathYear = actor.deathday ? new Date(actor.deathday).getFullYear() : null

  // Truncate content to avoid excessive token usage
  const maxContentLength = 8000
  const truncatedContent =
    pageContent.length > maxContentLength
      ? pageContent.substring(0, maxContentLength) + "\n[Content truncated...]"
      : pageContent

  const prompt = `Extract death information for ${actor.name}${deathYear ? ` (died ${deathYear})` : ""} from this page.

URL: ${pageUrl}

Page content:
${truncatedContent}

Extract death-related information into JSON:
{
  "circumstances": "Detailed narrative of death circumstances (timeline, location, discovery, etc). null if not found.",
  "rumoredCircumstances": "Alternative accounts or unconfirmed information. null if none.",
  "notableFactors": ["tags: on_set, overdose, suicide, homicide, accident, cancer, etc"],
  "locationOfDeath": "City, State/Country. null if not found.",
  "additionalContext": "Relevant career context (was filming, had retired, etc). null if none."
}

Instructions:
- Focus ONLY on death-related information
- Remove citation markers [1][2] and formatting artifacts
- Write clean prose suitable for publication
- Use null for any field not found in the content
- Return ONLY valid JSON, no markdown fences`

  logger.debug(`[AI_EXTRACT] ${actor.name}`, {
    url: pageUrl,
    contentLength: pageContent.length,
  })

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  })

  const latencyMs = Date.now() - startTime
  const inputTokens = response.usage.input_tokens
  const outputTokens = response.usage.output_tokens
  const costUsd = calculateCost(inputTokens, outputTokens)

  // Extract text content
  const textBlock = response.content.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude for content extraction")
  }

  // Parse JSON response
  const jsonText = stripMarkdownCodeFences(textBlock.text)
  let extracted: Partial<EnrichmentData>

  try {
    const parsed = JSON.parse(jsonText) as {
      circumstances?: string | null
      rumoredCircumstances?: string | null
      notableFactors?: string[] | null
      locationOfDeath?: string | null
      additionalContext?: string | null
    }

    extracted = {
      circumstances: parsed.circumstances ?? null,
      rumoredCircumstances: parsed.rumoredCircumstances ?? null,
      notableFactors: parsed.notableFactors ?? [],
      relatedCelebrities: [],
      locationOfDeath: parsed.locationOfDeath ?? null,
      additionalContext: parsed.additionalContext ?? null,
    }
  } catch (error) {
    logger.debug(`[AI_EXTRACT_PARSE_ERROR]`, { raw: textBlock.text.substring(0, 200) })
    // Return empty data on parse failure
    extracted = {
      circumstances: null,
      rumoredCircumstances: null,
      notableFactors: [],
      relatedCelebrities: [],
      locationOfDeath: null,
      additionalContext: null,
    }
  }

  logger.debug(`[AI_EXTRACT_COMPLETE] ${actor.name}`, {
    hasCircumstances: !!extracted.circumstances,
    costUsd: costUsd.toFixed(4),
    latencyMs,
  })

  return {
    data: extracted,
    costUsd,
    model: modelId,
    inputTokens,
    outputTokens,
    latencyMs,
  }
}

/**
 * Estimate cost for link selection based on number of results.
 */
export function estimateLinkSelectionCost(resultCount: number): number {
  // Rough estimate: ~100 tokens per result + 200 for prompt
  const estimatedInputTokens = resultCount * 100 + 200
  const estimatedOutputTokens = 200
  return calculateCost(estimatedInputTokens, estimatedOutputTokens)
}

/**
 * Estimate cost for content extraction based on content length.
 */
export function estimateExtractionCost(contentLength: number): number {
  // Rough estimate: 4 chars per token
  const estimatedInputTokens = Math.ceil(contentLength / 4) + 300
  const estimatedOutputTokens = 400
  return calculateCost(estimatedInputTokens, estimatedOutputTokens)
}
