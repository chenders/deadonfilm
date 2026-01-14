import { describe, it, expect } from "vitest"
import { DEFAULT_CONFIG } from "./orchestrator.js"

/**
 * Tests for the DeathEnrichmentOrchestrator.
 *
 * Note: Full integration tests with actual sources would require
 * network access and API keys. These tests focus on configuration
 * and exported constants.
 */
describe("DeathEnrichmentOrchestrator", () => {
  describe("DEFAULT_CONFIG", () => {
    it("has limit set to 100", () => {
      expect(DEFAULT_CONFIG.limit).toBe(100)
    })

    it("enables free sources by default", () => {
      expect(DEFAULT_CONFIG.sourceCategories.free).toBe(true)
    })

    it("disables paid sources by default", () => {
      expect(DEFAULT_CONFIG.sourceCategories.paid).toBe(false)
    })

    it("disables AI sources by default", () => {
      expect(DEFAULT_CONFIG.sourceCategories.ai).toBe(false)
    })

    it("sets stopOnMatch to true", () => {
      expect(DEFAULT_CONFIG.stopOnMatch).toBe(true)
    })

    it("sets confidenceThreshold to 0.5", () => {
      expect(DEFAULT_CONFIG.confidenceThreshold).toBe(0.5)
    })

    it("sets minPopularity to 0", () => {
      expect(DEFAULT_CONFIG.minPopularity).toBe(0)
    })

    it("sets dryRun to false", () => {
      expect(DEFAULT_CONFIG.dryRun).toBe(false)
    })

    it("sets recentOnly to false", () => {
      expect(DEFAULT_CONFIG.recentOnly).toBe(false)
    })

    it("has empty specificSources object", () => {
      expect(DEFAULT_CONFIG.specificSources).toEqual({})
    })

    it("has empty aiModels object", () => {
      expect(DEFAULT_CONFIG.aiModels).toEqual({})
    })
  })
})
