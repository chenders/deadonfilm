/**
 * Shared helper for calling Claude and parsing JSON responses.
 *
 * Handles the full pipeline: API call with assistant prefill, text extraction,
 * markdown fence stripping, jsonrepair, and JSON.parse. Used by both biography
 * and death enrichment synthesis.
 *
 * Never throws — returns { data: null, error } on failure.
 */

import type Anthropic from "@anthropic-ai/sdk"
import { stripMarkdownCodeFences } from "../claude-batch/response-parser.js"
import { jsonrepair } from "jsonrepair"

export interface ClaudeJsonResult<T> {
  data: T | null
  inputTokens: number
  outputTokens: number
  error?: string
  /** Truncated raw text from Claude on parse failure, for debugging. */
  rawSnippet?: string
}

export async function callClaudeForJson<T = Record<string, unknown>>(
  client: Anthropic,
  options: {
    model: string
    maxTokens: number
    prompt: string
    system?: string
  }
): Promise<ClaudeJsonResult<T>> {
  const { model, maxTokens, prompt, system } = options

  // Call Claude with assistant prefill to force JSON output
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: "{" },
      ],
      ...(system !== undefined && { system }),
    })
  } catch (error) {
    return {
      data: null,
      inputTokens: 0,
      outputTokens: 0,
      error: `Claude API error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }

  // Defensive access — honor the "never throws" contract
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0

  // Extract text block — Array.isArray guard for never-throws contract
  const contentBlocks = Array.isArray(response.content) ? response.content : []
  const textBlock = contentBlocks.find((block) => block.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    return {
      data: null,
      inputTokens,
      outputTokens,
      error: "No text response from Claude",
    }
  }

  // Parse JSON: strip fences, restore { from prefill when needed, repair, parse
  try {
    const stripped = stripMarkdownCodeFences(textBlock.text.trim())
    const withBrace = stripped.startsWith("{") ? stripped : "{" + stripped
    const repaired = jsonrepair(withBrace)
    const parsed = JSON.parse(repaired) as T
    return { data: parsed, inputTokens, outputTokens }
  } catch (error) {
    return {
      data: null,
      inputTokens,
      outputTokens,
      error: `Failed to parse Claude response as JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      rawSnippet: textBlock.text.slice(0, 200),
    }
  }
}
