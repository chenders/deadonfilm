/**
 * Shared helper for calling Claude and parsing JSON responses.
 *
 * Handles the full pipeline: API call, text extraction, markdown fence
 * stripping, jsonrepair, and JSON.parse. Used by both biography and death
 * enrichment synthesis.
 *
 * Never throws — returns { data: null, error } on failure.
 */

import type Anthropic from "@anthropic-ai/sdk"
import { stripMarkdownCodeFences } from "../claude-batch/response-parser.js"
import { jsonrepair } from "jsonrepair"

/**
 * Extracts the assistant's text from a Claude response.
 *
 * ALWAYS use this instead of `message.content[0].text`. Models with extended
 * thinking emit a `thinking` block first, so `content[0]` is not the text block
 * and index-based access silently yields an empty string rather than an error.
 * Scanning for the first `text` block behaves identically on models that emit
 * no thinking block, so this is safe across every model generation.
 *
 * @param message - Response from `client.messages.create()`
 * @returns The first text block's content, or `""` if the response has none
 */
export function extractClaudeText(message: Anthropic.Message): string {
  const blocks = Array.isArray(message.content) ? message.content : []
  const textBlock = blocks.find((block) => block.type === "text")
  return textBlock && textBlock.type === "text" ? textBlock.text : ""
}

/**
 * Isolates the JSON object from a model response that may be wrapped in prose.
 *
 * Prefill used to guarantee the response began mid-object, so the old parser
 * could assume a leading `{`. Without prefill the model occasionally frames the
 * object ("Here is the biography:\n{...}\nLet me know if..."), and `jsonrepair`
 * cannot recover from leading prose — it needs an object to start with.
 *
 * Returns null when the text contains no object at all. That case MUST be
 * treated as a failure rather than handed to `jsonrepair`: given prose,
 * jsonrepair happily coerces "Looking at the sources, I can see that..." into
 * the array `["Looking at the sources", "I can see that..."]`, which parses
 * successfully and would be written to the database as enrichment output.
 * A silent bad parse is worse than a loud failure.
 *
 * @param text - Response text with markdown fences already stripped
 * @returns Substring to hand to `jsonrepair`, or null if no object is present
 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) {
    return null
  }
  return text.slice(start, end + 1)
}

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

  // NOTE: this previously sent an assistant prefill (`{ role: "assistant",
  // content: "{" }`) to force JSON output. Models from the 4.6 generation
  // onward reject prefill with:
  //   400 "This model does not support assistant message prefill.
  //        The conversation must end with a user message."
  // JSON is now coerced by the prompt and recovered by extractJsonObject()
  // below, which is generation-agnostic.
  let response: Anthropic.Message
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
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

  // Skips any leading thinking block — see extractClaudeText()
  const rawText = extractClaudeText(response)
  if (!rawText) {
    return {
      data: null,
      inputTokens,
      outputTokens,
      error: "No text response from Claude",
    }
  }

  // Parse JSON: strip fences, isolate the object, repair, parse
  try {
    const stripped = stripMarkdownCodeFences(rawText.trim())
    const objectText = extractJsonObject(stripped)
    if (objectText === null) {
      throw new Error("response contains no JSON object")
    }
    const parsed: unknown = JSON.parse(jsonrepair(objectText))
    // Guard the shape jsonrepair produced. Callers all expect a JSON object;
    // accepting an array or scalar here would write malformed enrichment data.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(
        `expected a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`
      )
    }
    return { data: parsed as T, inputTokens, outputTokens }
  } catch (error) {
    return {
      data: null,
      inputTokens,
      outputTokens,
      error: `Failed to parse Claude response as JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      rawSnippet: rawText.slice(0, 200),
    }
  }
}
