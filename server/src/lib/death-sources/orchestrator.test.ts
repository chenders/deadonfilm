import { describe, it, expect } from "vitest"
import { DEFAULT_CONFIG, DeathEnrichmentOrchestrator, mergeEnrichmentData } from "./orchestrator.js"
import { CostLimitExceededError } from "./types.js"
import type { EnrichmentResult, EnrichmentData, EnrichmentSourceEntry } from "./types.js"

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

describe("mergeEnrichmentData", () => {
  const createEmptyResult = (): EnrichmentResult => ({})

  const createSource = (name: string): EnrichmentSourceEntry => ({
    type: name as EnrichmentSourceEntry["type"],
    retrievedAt: new Date(),
    confidence: 0.8,
  })

  describe("core fields", () => {
    it("merges circumstances when not already set", () => {
      const result = createEmptyResult()
      const source = createSource("wikidata")

      mergeEnrichmentData(result, { circumstances: "Died of natural causes" }, source)

      expect(result.circumstances).toBe("Died of natural causes")
      expect(result.circumstancesSource).toBe(source)
    })

    it("does not overwrite existing circumstances (first-wins)", () => {
      const result = createEmptyResult()
      result.circumstances = "Original circumstances"
      const originalSource = createSource("original")
      result.circumstancesSource = originalSource

      mergeEnrichmentData(result, { circumstances: "New circumstances" }, createSource("new"))

      expect(result.circumstances).toBe("Original circumstances")
      expect(result.circumstancesSource).toBe(originalSource)
    })

    it("merges notable factors when array is non-empty", () => {
      const result = createEmptyResult()
      const source = createSource("perplexity")

      mergeEnrichmentData(result, { notableFactors: ["sudden", "accident"] }, source)

      expect(result.notableFactors).toEqual(["sudden", "accident"])
      expect(result.notableFactorsSource).toBe(source)
    })

    it("does not merge empty notable factors array", () => {
      const result = createEmptyResult()

      mergeEnrichmentData(result, { notableFactors: [] }, createSource("test"))

      expect(result.notableFactors).toBeUndefined()
    })

    it("merges location of death", () => {
      const result = createEmptyResult()
      const source = createSource("findagrave")

      mergeEnrichmentData(result, { locationOfDeath: "Los Angeles, California" }, source)

      expect(result.locationOfDeath).toBe("Los Angeles, California")
      expect(result.locationOfDeathSource).toBe(source)
    })
  })

  describe("career context fields", () => {
    it("merges lastProject when not already set", () => {
      const result = createEmptyResult()
      const source = createSource("perplexity")
      const lastProject = {
        title: "Final Movie",
        year: 2023,
        tmdbId: 12345,
        imdbId: "tt1234567",
        type: "movie" as const,
      }

      mergeEnrichmentData(result, { lastProject }, source)

      expect(result.lastProject).toEqual(lastProject)
      expect(result.lastProjectSource).toBe(source)
    })

    it("does not overwrite existing lastProject (first-wins)", () => {
      const result = createEmptyResult()
      const originalProject = {
        title: "Original",
        year: 2020,
        tmdbId: null,
        imdbId: null,
        type: "movie" as const,
      }
      result.lastProject = originalProject
      const originalSource = createSource("original")
      result.lastProjectSource = originalSource

      const newProject = {
        title: "New",
        year: 2023,
        tmdbId: null,
        imdbId: null,
        type: "movie" as const,
      }
      mergeEnrichmentData(result, { lastProject: newProject }, createSource("new"))

      expect(result.lastProject).toBe(originalProject)
      expect(result.lastProjectSource).toBe(originalSource)
    })

    it("merges careerStatusAtDeath when not already set", () => {
      const result = createEmptyResult()
      const source = createSource("gemini")

      mergeEnrichmentData(result, { careerStatusAtDeath: "active" }, source)

      expect(result.careerStatusAtDeath).toBe("active")
      expect(result.careerStatusAtDeathSource).toBe(source)
    })

    it("does not overwrite existing careerStatusAtDeath (first-wins)", () => {
      const result = createEmptyResult()
      result.careerStatusAtDeath = "retired"
      const originalSource = createSource("original")
      result.careerStatusAtDeathSource = originalSource

      mergeEnrichmentData(result, { careerStatusAtDeath: "active" }, createSource("new"))

      expect(result.careerStatusAtDeath).toBe("retired")
      expect(result.careerStatusAtDeathSource).toBe(originalSource)
    })

    it("merges posthumousReleases when array is non-empty", () => {
      const result = createEmptyResult()
      const source = createSource("openai")
      const releases = [
        { title: "After Life", year: 2024, tmdbId: 99999, imdbId: null, type: "movie" as const },
      ]

      mergeEnrichmentData(result, { posthumousReleases: releases }, source)

      expect(result.posthumousReleases).toEqual(releases)
      expect(result.posthumousReleasesSource).toBe(source)
    })

    it("does not merge empty posthumousReleases array", () => {
      const result = createEmptyResult()

      mergeEnrichmentData(result, { posthumousReleases: [] }, createSource("test"))

      expect(result.posthumousReleases).toBeUndefined()
    })

    it("does not overwrite existing posthumousReleases (first-wins)", () => {
      const result = createEmptyResult()
      const originalReleases = [
        { title: "Original", year: 2020, tmdbId: null, imdbId: null, type: "movie" as const },
      ]
      result.posthumousReleases = originalReleases
      const originalSource = createSource("original")
      result.posthumousReleasesSource = originalSource

      const newReleases = [
        { title: "New", year: 2024, tmdbId: null, imdbId: null, type: "movie" as const },
      ]
      mergeEnrichmentData(result, { posthumousReleases: newReleases }, createSource("new"))

      expect(result.posthumousReleases).toBe(originalReleases)
      expect(result.posthumousReleasesSource).toBe(originalSource)
    })

    it("merges relatedDeaths when not already set", () => {
      const result = createEmptyResult()
      const source = createSource("claude")

      mergeEnrichmentData(result, { relatedDeaths: "Spouse died in same accident" }, source)

      expect(result.relatedDeaths).toBe("Spouse died in same accident")
      expect(result.relatedDeathsSource).toBe(source)
    })

    it("does not overwrite existing relatedDeaths (first-wins)", () => {
      const result = createEmptyResult()
      result.relatedDeaths = "Original related deaths info"
      const originalSource = createSource("original")
      result.relatedDeathsSource = originalSource

      mergeEnrichmentData(result, { relatedDeaths: "New info" }, createSource("new"))

      expect(result.relatedDeaths).toBe("Original related deaths info")
      expect(result.relatedDeathsSource).toBe(originalSource)
    })
  })

  describe("null and undefined handling", () => {
    it("does not merge null values", () => {
      const result = createEmptyResult()

      mergeEnrichmentData(
        result,
        {
          circumstances: null as unknown as string,
          lastProject: null,
          careerStatusAtDeath: null,
        },
        createSource("test")
      )

      expect(result.circumstances).toBeUndefined()
      expect(result.lastProject).toBeUndefined()
      expect(result.careerStatusAtDeath).toBeUndefined()
    })

    it("does not merge undefined values", () => {
      const result = createEmptyResult()

      mergeEnrichmentData(result, {}, createSource("test"))

      expect(result.circumstances).toBeUndefined()
      expect(result.lastProject).toBeUndefined()
    })
  })

  describe("multiple merges from different sources", () => {
    it("combines fields from multiple sources", () => {
      const result = createEmptyResult()
      const source1 = createSource("wikidata")
      const source2 = createSource("perplexity")
      const source3 = createSource("findagrave")

      // First source provides circumstances
      mergeEnrichmentData(result, { circumstances: "Heart attack" }, source1)

      // Second source provides career context
      mergeEnrichmentData(
        result,
        {
          lastProject: {
            title: "Final Film",
            year: 2023,
            tmdbId: null,
            imdbId: null,
            type: "movie",
          },
          careerStatusAtDeath: "active",
        },
        source2
      )

      // Third source provides location
      mergeEnrichmentData(result, { locationOfDeath: "New York, NY" }, source3)

      expect(result.circumstances).toBe("Heart attack")
      expect(result.circumstancesSource).toBe(source1)
      expect(result.lastProject?.title).toBe("Final Film")
      expect(result.lastProjectSource).toBe(source2)
      expect(result.careerStatusAtDeath).toBe("active")
      expect(result.careerStatusAtDeathSource).toBe(source2)
      expect(result.locationOfDeath).toBe("New York, NY")
      expect(result.locationOfDeathSource).toBe(source3)
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
