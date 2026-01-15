import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock cache module before importing base-source
vi.mock("./cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock logger to avoid file operations during tests
vi.mock("./logger.js", () => ({
  getEnrichmentLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

import {
  BaseDataSource,
  DEATH_KEYWORDS,
  CIRCUMSTANCE_KEYWORDS,
  NOTABLE_FACTOR_KEYWORDS,
} from "./base-source.js"
import type { ActorForEnrichment, SourceLookupResult, EnrichmentSourceEntry } from "./types.js"
import { DataSourceType } from "./types.js"

/**
 * Concrete test implementation of BaseDataSource
 */
class TestSource extends BaseDataSource {
  readonly name = "Test Source"
  readonly type = DataSourceType.DUCKDUCKGO // Using an existing type for testing
  readonly isFree = true
  readonly estimatedCostPerQuery = 0

  // Expose for testing
  protected minDelayMs = 100

  // Allow controlling the lookup result
  public mockResult: SourceLookupResult | null = null
  public lookupCalled = false
  public lastActor: ActorForEnrichment | null = null

  protected async performLookup(actor: ActorForEnrichment): Promise<SourceLookupResult> {
    this.lookupCalled = true
    this.lastActor = actor

    if (this.mockResult) {
      return this.mockResult
    }

    return {
      success: true,
      source: this.createSourceEntry(Date.now(), 0.8, "https://test.com"),
      data: {
        circumstances: "Test circumstances",
        rumoredCircumstances: null,
        notableFactors: ["accident"],
        relatedCelebrities: [],
        locationOfDeath: "Los Angeles, CA",
        additionalContext: null,
      },
    }
  }

  // Expose protected methods for testing
  public testCreateSourceEntry(
    startTime: number,
    confidence: number,
    url?: string,
    prompt?: string,
    rawData?: Record<string, unknown>
  ): EnrichmentSourceEntry {
    return this.createSourceEntry(startTime, confidence, url, prompt, rawData)
  }
}

describe("BaseDataSource", () => {
  let source: TestSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new TestSource()
  })

  describe("isAvailable", () => {
    it("returns true by default", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "John Smith",
      birthday: "1950-01-15",
      deathday: "2020-03-20",
      causeOfDeath: "Heart attack",
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    it("calls performLookup with the actor", async () => {
      await source.lookup(testActor)

      expect(source.lookupCalled).toBe(true)
      expect(source.lastActor).toEqual(testActor)
    })

    it("returns the result from performLookup", async () => {
      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBe("Test circumstances")
    })

    it("catches and wraps errors from performLookup", async () => {
      // Create a new source that throws
      class ErrorSource extends TestSource {
        protected async performLookup(): Promise<SourceLookupResult> {
          throw new Error("Test error")
        }
      }

      const errorSource = new ErrorSource()
      const result = await errorSource.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Test error")
    })
  })

  describe("createSourceEntry", () => {
    it("creates a source entry with correct type", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.75, "https://test.com")
      expect(entry.type).toBe(DataSourceType.DUCKDUCKGO)
    })

    it("sets confidence level", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.75)
      expect(entry.confidence).toBe(0.75)
    })

    it("sets URL when provided", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.5, "https://test.com")
      expect(entry.url).toBe("https://test.com")
    })

    it("sets retrievedAt to current date", () => {
      const before = new Date()
      const entry = source.testCreateSourceEntry(Date.now(), 0.5)
      const after = new Date()

      expect(entry.retrievedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(entry.retrievedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it("includes optional queryUsed when provided", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.5, undefined, "test query")
      expect(entry.queryUsed).toBe("test query")
    })

    it("includes optional rawData when provided", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.5, undefined, undefined, {
        key: "value",
      })
      expect(entry.rawData).toEqual({ key: "value" })
    })

    it("calculates cost based on estimatedCostPerQuery", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.5)
      expect(entry.costUsd).toBe(0) // TestSource has estimatedCostPerQuery = 0
    })
  })
})

describe("Keyword exports", () => {
  describe("DEATH_KEYWORDS", () => {
    it("contains common death-related terms", () => {
      expect(DEATH_KEYWORDS).toContain("died")
      expect(DEATH_KEYWORDS).toContain("death")
      expect(DEATH_KEYWORDS).toContain("passed away")
      expect(DEATH_KEYWORDS).toContain("cause of death")
    })

    it("is a non-empty array", () => {
      expect(Array.isArray(DEATH_KEYWORDS)).toBe(true)
      expect(DEATH_KEYWORDS.length).toBeGreaterThan(0)
    })
  })

  describe("CIRCUMSTANCE_KEYWORDS", () => {
    it("contains death circumstance terms", () => {
      expect(CIRCUMSTANCE_KEYWORDS).toContain("accident")
      expect(CIRCUMSTANCE_KEYWORDS).toContain("suicide")
      expect(CIRCUMSTANCE_KEYWORDS).toContain("overdose")
      expect(CIRCUMSTANCE_KEYWORDS).toContain("murder")
    })

    it("is a non-empty array", () => {
      expect(Array.isArray(CIRCUMSTANCE_KEYWORDS)).toBe(true)
      expect(CIRCUMSTANCE_KEYWORDS.length).toBeGreaterThan(0)
    })
  })

  describe("NOTABLE_FACTOR_KEYWORDS", () => {
    it("contains notable factor terms", () => {
      expect(NOTABLE_FACTOR_KEYWORDS).toContain("sudden")
      expect(NOTABLE_FACTOR_KEYWORDS).toContain("unexpected")
      expect(NOTABLE_FACTOR_KEYWORDS).toContain("controversial")
    })

    it("is a non-empty array", () => {
      expect(Array.isArray(NOTABLE_FACTOR_KEYWORDS)).toBe(true)
      expect(NOTABLE_FACTOR_KEYWORDS.length).toBeGreaterThan(0)
    })
  })
})
