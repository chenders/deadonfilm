/**
 * Tests for AI helper functions.
 *
 * Note: Integration tests that call the actual AI API should be run manually
 * with valid API keys. These unit tests focus on validation, error handling,
 * and cost estimation.
 */

import { describe, it, expect } from "vitest"
import {
  estimateLinkSelectionCost,
  estimateExtractionCost,
  DEFAULT_AI_HELPER_MODEL,
} from "./ai-helpers.js"

describe("AI Helpers", () => {
  describe("DEFAULT_AI_HELPER_MODEL", () => {
    it("exports the default model", () => {
      expect(DEFAULT_AI_HELPER_MODEL).toBe("claude-sonnet-4-20250514")
    })
  })

  describe("estimateLinkSelectionCost", () => {
    it("returns cost for zero results (base prompt cost)", () => {
      const cost = estimateLinkSelectionCost(0)
      expect(cost).toBeGreaterThan(0) // Still has base prompt cost
    })

    it("estimates cost based on result count", () => {
      const cost = estimateLinkSelectionCost(5)
      expect(cost).toBeGreaterThan(0)
      expect(cost).toBeLessThan(0.01) // Should be very small
    })

    it("increases cost with more results", () => {
      const smallCost = estimateLinkSelectionCost(1)
      const largeCost = estimateLinkSelectionCost(10)
      expect(largeCost).toBeGreaterThan(smallCost)
    })

    it("has base cost plus per-result cost", () => {
      // The formula is: (resultCount * 100 + 200) * inputCost + 200 * outputCost
      // With more results, the cost increases but base cost dominates for small counts
      const cost0 = estimateLinkSelectionCost(0)
      const cost5 = estimateLinkSelectionCost(5)
      const cost10 = estimateLinkSelectionCost(10)

      // Cost should increase with more results
      expect(cost5).toBeGreaterThan(cost0)
      expect(cost10).toBeGreaterThan(cost5)

      // The incremental cost should be consistent (100 tokens per result)
      const increment5to10 = cost10 - cost5
      const increment0to5 = cost5 - cost0
      expect(Math.abs(increment5to10 - increment0to5)).toBeLessThan(0.0001)
    })
  })

  describe("estimateExtractionCost", () => {
    it("returns cost for zero length (base prompt cost)", () => {
      const cost = estimateExtractionCost(0)
      expect(cost).toBeGreaterThan(0) // Still has base prompt cost
    })

    it("estimates cost based on content length", () => {
      const shortCost = estimateExtractionCost(100)
      const longCost = estimateExtractionCost(10000)

      expect(shortCost).toBeGreaterThan(0)
      expect(longCost).toBeGreaterThan(shortCost)
    })

    it("scales with content length", () => {
      const cost1k = estimateExtractionCost(1000)
      const cost10k = estimateExtractionCost(10000)
      // Longer content should cost more
      expect(cost10k).toBeGreaterThan(cost1k)
    })
  })
})
