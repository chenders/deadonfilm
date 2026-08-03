import { describe, it, expect } from "vitest"
import {
  CLAUDE_MODELS,
  CLAUDE_MODEL_IDS,
  calculateModelCost,
  type ClaudeModelTier,
} from "./claude-models.js"

/**
 * Model IDs are plain strings validated only by the Anthropic API at request
 * time, so a retired ID fails as a production 404 rather than at build time.
 *
 * These tests deliberately do NOT assert `id === "claude-sonnet-5"`. Restating
 * the constant proves nothing and makes the next migration a multi-file change.
 * Instead they assert the properties that actually protect us: that no known
 * retired ID is in use, and that IDs are shaped the way our convention requires.
 *
 * Liveness against the real API is verified out-of-band:
 *   curl -s https://api.anthropic.com/v1/models \
 *     -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"
 */

/** Model IDs Anthropic has retired. Adding one here fails the build if still referenced. */
const RETIRED_MODEL_IDS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-3-haiku-20240307",
  "claude-3-sonnet-20240229",
  "claude-3-opus-20240229",
  "claude-3-5-sonnet-20240620",
  "claude-3-5-sonnet-20241022",
]

const TIERS: ClaudeModelTier[] = ["haiku", "sonnet", "opus"]

describe("CLAUDE_MODELS", () => {
  it("defines every capability tier used by the enrichment pipelines", () => {
    expect(Object.keys(CLAUDE_MODELS).sort()).toEqual(["haiku", "opus", "sonnet"])
  })

  it.each(TIERS)("does not reference a retired model ID for tier %s", (tier) => {
    expect(RETIRED_MODEL_IDS).not.toContain(CLAUDE_MODELS[tier].id)
  })

  it.each(TIERS)("uses a well-formed anthropic model ID for tier %s", (tier) => {
    expect(CLAUDE_MODELS[tier].id).toMatch(/^claude-[a-z0-9-]+$/)
  })

  it.each(TIERS)("defines positive pricing for tier %s", (tier) => {
    const spec = CLAUDE_MODELS[tier]
    expect(spec.inputCostPerMillion).toBeGreaterThan(0)
    expect(spec.outputCostPerMillion).toBeGreaterThan(0)
  })

  it("prices output above input for every tier", () => {
    for (const tier of TIERS) {
      const spec = CLAUDE_MODELS[tier]
      expect(spec.outputCostPerMillion).toBeGreaterThan(spec.inputCostPerMillion)
    }
  })

  it("orders tiers cheapest to most expensive: haiku < sonnet < opus", () => {
    expect(CLAUDE_MODELS.haiku.inputCostPerMillion).toBeLessThan(
      CLAUDE_MODELS.sonnet.inputCostPerMillion
    )
    expect(CLAUDE_MODELS.sonnet.inputCostPerMillion).toBeLessThan(
      CLAUDE_MODELS.opus.inputCostPerMillion
    )
  })

  it("assigns a distinct model to each tier", () => {
    const ids = TIERS.map((t) => CLAUDE_MODELS[t].id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("CLAUDE_MODEL_IDS", () => {
  it("mirrors the ids from CLAUDE_MODELS", () => {
    expect(CLAUDE_MODEL_IDS).toEqual({
      haiku: CLAUDE_MODELS.haiku.id,
      sonnet: CLAUDE_MODELS.sonnet.id,
      opus: CLAUDE_MODELS.opus.id,
    })
  })
})

describe("calculateModelCost", () => {
  it("computes cost from per-million token pricing", () => {
    const expected =
      (1_000_000 * CLAUDE_MODELS.sonnet.inputCostPerMillion) / 1_000_000 +
      (500_000 * CLAUDE_MODELS.sonnet.outputCostPerMillion) / 1_000_000
    expect(calculateModelCost("sonnet", 1_000_000, 500_000)).toBeCloseTo(expected, 10)
  })

  it("returns zero for zero usage", () => {
    expect(calculateModelCost("opus", 0, 0)).toBe(0)
  })

  it("charges more for opus than haiku on identical usage", () => {
    expect(calculateModelCost("opus", 10_000, 1_000)).toBeGreaterThan(
      calculateModelCost("haiku", 10_000, 1_000)
    )
  })
})
