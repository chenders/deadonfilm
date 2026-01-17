import { describe, it, expect } from "vitest"
import { DEFAULT_CONFIG, DeathEnrichmentOrchestrator } from "./orchestrator.js"
import { CostLimitExceededError } from "./types.js"

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

    it("has no cost limits by default", () => {
      expect(DEFAULT_CONFIG.costLimits).toBeUndefined()
    })
  })

  describe("constructor", () => {
    it("creates orchestrator with default config", () => {
      // Disable status bar for test to avoid TTY checks
      const orchestrator = new DeathEnrichmentOrchestrator({}, false)
      expect(orchestrator).toBeDefined()
    })

    it("accepts custom cost limits", () => {
      const orchestrator = new DeathEnrichmentOrchestrator(
        {
          costLimits: {
            maxCostPerActor: 0.01,
            maxTotalCost: 1.0,
          },
        },
        false
      )
      expect(orchestrator).toBeDefined()
    })
  })

  describe("getStats", () => {
    it("returns empty stats initially", () => {
      const orchestrator = new DeathEnrichmentOrchestrator({}, false)
      const stats = orchestrator.getStats()

      expect(stats.actorsProcessed).toBe(0)
      expect(stats.actorsEnriched).toBe(0)
      expect(stats.fillRate).toBe(0)
      expect(stats.totalCostUsd).toBe(0)
      expect(stats.totalTimeMs).toBe(0)
      expect(stats.costBySource).toEqual({})
      expect(stats.errors).toEqual([])
    })
  })
})

describe("CostLimitExceededError", () => {
  it("creates error with per-actor limit type", () => {
    const error = new CostLimitExceededError(
      "Cost limit exceeded",
      "per-actor",
      0.015,
      0.01,
      123,
      "John Doe"
    )

    expect(error.name).toBe("CostLimitExceededError")
    expect(error.message).toBe("Cost limit exceeded")
    expect(error.limitType).toBe("per-actor")
    expect(error.currentCost).toBe(0.015)
    expect(error.limit).toBe(0.01)
    expect(error.actorId).toBe(123)
    expect(error.actorName).toBe("John Doe")
  })

  it("creates error with total limit type", () => {
    const error = new CostLimitExceededError("Total cost limit exceeded", "total", 1.5, 1.0)

    expect(error.name).toBe("CostLimitExceededError")
    expect(error.limitType).toBe("total")
    expect(error.currentCost).toBe(1.5)
    expect(error.limit).toBe(1.0)
    expect(error.actorId).toBeUndefined()
    expect(error.actorName).toBeUndefined()
  })

  it("extends Error class", () => {
    const error = new CostLimitExceededError("Test", "total", 1, 0.5)
    expect(error instanceof Error).toBe(true)
  })

  describe("partialResults", () => {
    it("stores partial results when provided", () => {
      const partialResults = new Map<number, { circumstances: string }>([
        [1, { circumstances: "Actor 1 details" }],
        [2, { circumstances: "Actor 2 details" }],
      ])

      const error = new CostLimitExceededError(
        "Cost limit exceeded",
        "total",
        1.5,
        1.0,
        undefined,
        undefined,
        partialResults
      )

      expect(error.partialResults).toBeDefined()
      expect(error.partialResults?.size).toBe(2)
      expect(error.partialResults?.get(1)).toEqual({ circumstances: "Actor 1 details" })
      expect(error.partialResults?.get(2)).toEqual({ circumstances: "Actor 2 details" })
    })

    it("allows iterating over partial results", () => {
      const partialResults = new Map<number, string>([
        [100, "Result A"],
        [200, "Result B"],
        [300, "Result C"],
      ])

      const error = new CostLimitExceededError(
        "Limit exceeded",
        "total",
        2.0,
        1.5,
        undefined,
        undefined,
        partialResults
      )

      const collectedResults: Array<[number, string]> = []
      if (error.partialResults) {
        for (const [actorId, result] of error.partialResults) {
          collectedResults.push([actorId, result])
        }
      }

      expect(collectedResults).toEqual([
        [100, "Result A"],
        [200, "Result B"],
        [300, "Result C"],
      ])
    })

    it("defaults to undefined when not provided", () => {
      const error = new CostLimitExceededError("Cost limit exceeded", "total", 1.0, 0.5)
      expect(error.partialResults).toBeUndefined()
    })

    it("can store empty map", () => {
      const emptyMap = new Map<number, unknown>()
      const error = new CostLimitExceededError(
        "Limit exceeded",
        "total",
        1.0,
        0.5,
        undefined,
        undefined,
        emptyMap
      )

      expect(error.partialResults).toBeDefined()
      expect(error.partialResults?.size).toBe(0)
    })
  })
})
