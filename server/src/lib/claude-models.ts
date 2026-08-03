/**
 * Single source of truth for Anthropic model IDs and their pricing.
 *
 * Every module that calls the Anthropic API MUST import its model ID from here
 * rather than declaring a private `const MODEL = "claude-..."`. Model IDs are
 * plain strings that are only validated by the API at request time, so a
 * retired ID does not fail at build, lint, or deploy — it fails as a 404 in
 * production on whichever code path happens to run first.
 *
 * That is exactly what happened in August 2026: `claude-sonnet-4-20250514` was
 * retired while six separate files each held their own copy of the string, and
 * the breakage surfaced as a 404 during biography enrichment.
 *
 * Pricing lives alongside the ID on purpose. The two are halves of the same
 * fact, and cost figures feed `costLimits.maxCostPerActor`, which gates the
 * enrichment pipelines. Changing a model without changing its pricing silently
 * corrupts cost tracking and the budget guard built on top of it.
 *
 * To verify every ID here is still live:
 *   curl -s https://api.anthropic.com/v1/models \
 *     -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"
 */

/** A model tier plus the pricing used for cost tracking. */
export interface ClaudeModelSpec {
  /** Anthropic model ID passed as `model` in API requests. */
  readonly id: string
  /** USD per million input tokens. */
  readonly inputCostPerMillion: number
  /** USD per million output tokens. */
  readonly outputCostPerMillion: number
}

/**
 * Capability tiers used across the enrichment pipelines.
 *
 * - `haiku` — cheap, high-throughput classification and extraction
 *   (content cleaning, incongruity scoring, Wikipedia section selection).
 * - `sonnet` — general synthesis and reasoning
 *   (biography synthesis, discovery integration, link following, AI helpers).
 * - `opus` — highest-quality synthesis where output is user-facing prose
 *   (death circumstances cleanup, Claude Batch enrichment).
 *
 * Prefer undated aliases (`claude-sonnet-5`) over dated pins
 * (`claude-sonnet-4-20250514`). Dated pins are what turned a routine model
 * retirement into a production outage.
 */
export const CLAUDE_MODELS = {
  haiku: {
    id: "claude-haiku-4-5-20251001",
    inputCostPerMillion: 1.0,
    outputCostPerMillion: 5.0,
  },
  sonnet: {
    id: "claude-sonnet-5",
    // NOTE: carried over from Sonnet 4. The Anthropic /v1/models endpoint does
    // not expose pricing, so these were not re-verified during the Sonnet 5
    // migration. Confirm against https://www.anthropic.com/pricing before
    // relying on Sonnet cost figures for budgeting.
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
  },
  opus: {
    id: "claude-opus-4-5-20251101",
    inputCostPerMillion: 15,
    outputCostPerMillion: 75,
  },
} as const satisfies Record<string, ClaudeModelSpec>

/** Capability tier name (`"haiku" | "sonnet" | "opus"`). */
export type ClaudeModelTier = keyof typeof CLAUDE_MODELS

/** Every model ID this codebase is allowed to send to the Anthropic API. */
export const CLAUDE_MODEL_IDS: Record<ClaudeModelTier, string> = {
  haiku: CLAUDE_MODELS.haiku.id,
  sonnet: CLAUDE_MODELS.sonnet.id,
  opus: CLAUDE_MODELS.opus.id,
}

/**
 * Calculates USD cost for a call against a given tier.
 *
 * @param tier - Capability tier the call was made against
 * @param inputTokens - Input tokens consumed
 * @param outputTokens - Output tokens produced
 * @returns Cost in USD
 */
export function calculateModelCost(
  tier: ClaudeModelTier,
  inputTokens: number,
  outputTokens: number
): number {
  const spec = CLAUDE_MODELS[tier]
  return (
    (inputTokens * spec.inputCostPerMillion) / 1_000_000 +
    (outputTokens * spec.outputCostPerMillion) / 1_000_000
  )
}
