/**
 * Response parsing utilities for Claude Batch API responses.
 * Uses jsonrepair for robust JSON parsing and Zod for validation.
 */

import { jsonrepair } from "jsonrepair"
import { ClaudeResponseSchema, type ClaudeResponse } from "./schemas.js"

/**
 * Strips markdown code fences from JSON text.
 * Claude sometimes wraps JSON responses in ```json ... ```
 */
export function stripMarkdownCodeFences(text: string): string {
  let jsonText = text.trim()
  if (jsonText.startsWith("```")) {
    // Extract content between code fences, ignoring any text after closing fence
    const match = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (match) {
      jsonText = match[1].trim()
    } else {
      // Fallback: just strip opening fence if no closing fence found
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").trim()
    }
  }
  return jsonText
}

/**
 * Parse a Claude response text into a validated ClaudeResponse object.
 * Uses jsonrepair for robust parsing and Zod for validation.
 *
 * @param text - Raw response text from Claude
 * @returns Validated ClaudeResponse object
 * @throws Error if parsing or validation fails
 */
export function parseClaudeResponse(text: string): ClaudeResponse {
  // Step 1: Strip markdown code fences
  const jsonText = stripMarkdownCodeFences(text)

  // Step 2: Use jsonrepair to fix common JSON issues
  let repaired: string
  try {
    repaired = jsonrepair(jsonText)
  } catch {
    // If jsonrepair fails, try parsing the original
    repaired = jsonText
  }

  // Step 3: Parse JSON
  const json = JSON.parse(repaired)

  // Step 4: Validate with Zod schema
  return ClaudeResponseSchema.parse(json)
}

/**
 * Safely parse a Claude response, returning a result object instead of throwing.
 * Useful for failure recovery where we want to log errors gracefully.
 *
 * @param text - Raw response text from Claude
 * @returns Result object with success/data or success=false/error
 */
export function safeParseClaudeResponse(
  text: string
): { success: true; data: ClaudeResponse } | { success: false; error: string } {
  try {
    const data = parseClaudeResponse(text)
    return { success: true, data }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown parsing error"
    return { success: false, error: errorMessage }
  }
}
