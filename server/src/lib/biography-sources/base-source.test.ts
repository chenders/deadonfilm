import { describe, it, expect, vi, beforeEach, type Mock } from "vitest"

vi.mock("../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import {
  BaseBiographySource,
  BIO_REQUIRED_KEYWORDS,
  BIO_BONUS_KEYWORDS,
  setIgnoreCache,
  type BiographyLookupResult,
} from "./base-source.js"
import type { ActorForBiography, BiographySourceType } from "./types.js"
import { ReliabilityTier } from "../death-sources/types.js"
import { getCachedQuery, setCachedQuery } from "../death-sources/cache.js"

// ============================================================================
// Test Subclass
// ============================================================================

class TestBiographySource extends BaseBiographySource {
  readonly name = "test-bio"
  readonly type = "wikipedia-bio" as BiographySourceType
  readonly isFree = true
  readonly estimatedCostPerQuery = 0
  readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

  public lookupResult: BiographyLookupResult = {
    success: true,
    source: {
      type: "wikipedia-bio" as BiographySourceType,
      url: "https://example.com",
      retrievedAt: new Date(),
      confidence: 0.8,
      reliabilityTier: ReliabilityTier.SECONDARY_COMPILATION,
      reliabilityScore: 0.85,
      costUsd: 0,
      publication: "Wikipedia",
      articleTitle: "Test Actor",
      domain: "en.wikipedia.org",
      contentType: "biography",
    },
    data: {
      sourceName: "test-bio",
      sourceType: "wikipedia-bio" as BiographySourceType,
      text: "Test biography text about childhood and early life",
      url: "https://example.com",
      confidence: 0.8,
      reliabilityTier: ReliabilityTier.SECONDARY_COMPILATION,
      reliabilityScore: 0.85,
      publication: "Wikipedia",
      articleTitle: "Test Actor",
      domain: "en.wikipedia.org",
      contentType: "biography",
    },
  }

  protected async performLookup(): Promise<BiographyLookupResult> {
    return this.lookupResult
  }

  // Expose protected methods for testing
  public testCalculateBiographicalConfidence(text: string): number {
    return this.calculateBiographicalConfidence(text)
  }

  public testCreateSourceEntry(
    startTime: number,
    confidence: number,
    options?: {
      url?: string
      queryUsed?: string
      rawData?: unknown
      publication?: string
      articleTitle?: string
      domain?: string
      contentType?: string
    }
  ) {
    return this.createSourceEntry(startTime, confidence, options)
  }

  public testBuildBiographyQuery(actor: ActorForBiography): string {
    return this.buildBiographyQuery(actor)
  }

  public testGetCacheKey(actor: ActorForBiography): string {
    return this.getCacheKey(actor)
  }

  // Allow adjusting rate limit delay for tests
  public setMinDelay(ms: number): void {
    this.minDelayMs = ms
  }
}

// ============================================================================
// Test Actor Fixture
// ============================================================================

const testActor: ActorForBiography = {
  id: 12345,
  tmdb_id: 67890,
  imdb_person_id: "nm0000001",
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  wikipedia_url: "https://en.wikipedia.org/wiki/John_Wayne",
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Winterset, Iowa, USA",
}

// ============================================================================
// Tests
// ============================================================================

describe("BaseBiographySource", () => {
  let source: TestBiographySource

  beforeEach(() => {
    source = new TestBiographySource()
    source.setMinDelay(0) // Disable rate limiting for most tests
    setIgnoreCache(false)
    // resetAllMocks clears call history AND queued Once implementations
    vi.resetAllMocks()
    // Restore default mock behavior
    vi.mocked(getCachedQuery).mockResolvedValue(null)
    vi.mocked(setCachedQuery).mockResolvedValue(undefined)
  })

  // ==========================================================================
  // Confidence Calculation
  // ==========================================================================

  describe("calculateBiographicalConfidence", () => {
    it("returns 0 when no biographical keywords found", () => {
      const confidence = source.testCalculateBiographicalConfidence(
        "This is a completely unrelated text about programming and databases."
      )
      expect(confidence).toBe(0)
    })

    it("returns > 0 when required keywords found", () => {
      const confidence = source.testCalculateBiographicalConfidence(
        "He spent his childhood in a small town."
      )
      expect(confidence).toBeGreaterThan(0)
    })

    it("increases with more keyword matches", () => {
      const lowConfidence = source.testCalculateBiographicalConfidence(
        "He spent his childhood in Iowa."
      )
      const highConfidence = source.testCalculateBiographicalConfidence(
        "He spent his childhood in Iowa. His early life was shaped by his parents. He grew up on a farm and went to school nearby."
      )
      expect(highConfidence).toBeGreaterThan(lowConfidence)
    })

    it("caps at 1.0", () => {
      // Text with many required and bonus keywords
      const text = [
        "He spent his childhood in poverty as an orphan.",
        "His early life was shaped by his parents and family.",
        "He grew up as an immigrant and was self-taught.",
        "He went to school on a scholarship.",
        "He married young, had children, and struggled.",
        "His personal life included military service before fame.",
        "He was born in a small town and his siblings helped him.",
        "His education was cut short. He got his first job early.",
        "He was adopted by a kind family after divorce of his parents.",
        "He served in the military and was a self-taught scholar.",
      ].join(" ")

      const confidence = source.testCalculateBiographicalConfidence(text)
      expect(confidence).toBeLessThanOrEqual(1.0)
    })

    it("recognizes all required keywords", () => {
      for (const keyword of BIO_REQUIRED_KEYWORDS) {
        const confidence = source.testCalculateBiographicalConfidence(
          `This text contains the keyword ${keyword} in context.`
        )
        expect(confidence, `Expected confidence > 0 for keyword "${keyword}"`).toBeGreaterThan(0)
      }
    })

    it("gives bonus for biographical detail keywords", () => {
      // Text with one required keyword (for base confidence)
      const baseText = "He spent his childhood in Iowa."
      const baseConfidence = source.testCalculateBiographicalConfidence(baseText)

      // Text with required keyword + bonus keywords
      const bonusText =
        "He spent his childhood in Iowa. He received a scholarship and was an immigrant."
      const bonusConfidence = source.testCalculateBiographicalConfidence(bonusText)

      expect(bonusConfidence).toBeGreaterThan(baseConfidence)
    })

    it("bonus keywords alone do not produce confidence", () => {
      // Only bonus keywords, no required keywords
      const confidence = source.testCalculateBiographicalConfidence(
        "He received a scholarship and struggled with poverty."
      )
      expect(confidence).toBe(0)
    })
  })

  // ==========================================================================
  // Source Entry Creation
  // ==========================================================================

  describe("createSourceEntry", () => {
    it("creates BiographySourceEntry with all fields", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.75, {
        url: "https://example.com/bio",
        queryUsed: "test query",
        rawData: { test: true },
        publication: "Wikipedia",
        articleTitle: "John Wayne",
        domain: "en.wikipedia.org",
        contentType: "biography",
      })

      expect(entry.type).toBe("wikipedia-bio")
      expect(entry.url).toBe("https://example.com/bio")
      expect(entry.confidence).toBe(0.75)
      expect(entry.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
      expect(entry.reliabilityScore).toBe(0.85)
      expect(entry.publication).toBe("Wikipedia")
      expect(entry.articleTitle).toBe("John Wayne")
      expect(entry.domain).toBe("en.wikipedia.org")
      expect(entry.contentType).toBe("biography")
      expect(entry.queryUsed).toBe("test query")
      expect(entry.rawData).toEqual({ test: true })
      expect(entry.retrievedAt).toBeInstanceOf(Date)
    })

    it("sets costUsd to 0 for free sources", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.5)
      expect(entry.costUsd).toBe(0)
    })

    it("defaults optional fields to null", () => {
      const entry = source.testCreateSourceEntry(Date.now(), 0.5)
      expect(entry.url).toBeNull()
      expect(entry.publication).toBeNull()
      expect(entry.articleTitle).toBeNull()
      expect(entry.domain).toBeNull()
      expect(entry.contentType).toBeNull()
    })
  })

  // ==========================================================================
  // Rate Limiting
  // ==========================================================================

  describe("rate limiting", () => {
    it("delays between requests", async () => {
      source.setMinDelay(100) // 100ms rate limit

      const start = Date.now()
      await source.lookup(testActor)
      await source.lookup(testActor)
      const elapsed = Date.now() - start

      // Second request should have been delayed
      expect(elapsed).toBeGreaterThanOrEqual(90) // Allow small timing variance
    })
  })

  // ==========================================================================
  // Cache Behavior
  // ==========================================================================

  describe("cache behavior", () => {
    it("returns cached result on second call", async () => {
      const cachedResult: BiographyLookupResult = {
        success: true,
        source: {
          type: "wikipedia-bio" as BiographySourceType,
          url: "https://cached.example.com",
          retrievedAt: new Date("2025-01-01"),
          confidence: 0.9,
          costUsd: 0,
        },
        data: {
          sourceName: "test-bio",
          sourceType: "wikipedia-bio" as BiographySourceType,
          text: "Cached biography text",
          confidence: 0.9,
        },
      }

      ;(getCachedQuery as Mock).mockResolvedValueOnce({
        id: 1,
        sourceType: "wikipedia-bio",
        actorId: 12345,
        queryString: source.testGetCacheKey(testActor),
        queryHash: "abc123",
        responseStatus: 200,
        responseRaw: cachedResult,
        isCompressed: false,
        responseSizeBytes: 100,
        errorMessage: null,
        queriedAt: new Date("2025-01-01"),
        responseTimeMs: 50,
        costUsd: null,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.retrievedAt).toBeInstanceOf(Date)
      // Should not have called performLookup - cache was hit
      expect(setCachedQuery).not.toHaveBeenCalled()
    })

    it("returns cached error result", async () => {
      ;(getCachedQuery as Mock).mockResolvedValueOnce({
        id: 1,
        sourceType: "wikipedia-bio",
        actorId: 12345,
        queryString: source.testGetCacheKey(testActor),
        queryHash: "abc123",
        responseStatus: 500,
        responseRaw: null,
        isCompressed: false,
        responseSizeBytes: null,
        errorMessage: "Previously failed",
        queriedAt: new Date("2025-01-01"),
        responseTimeMs: 50,
        costUsd: null,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Previously failed")
    })

    it("skips cache when globalIgnoreCache is true", async () => {
      setIgnoreCache(true)
      ;(getCachedQuery as Mock).mockResolvedValueOnce({
        id: 1,
        sourceType: "wikipedia-bio",
        responseRaw: source.lookupResult,
        errorMessage: null,
        queriedAt: new Date(),
      })

      await source.lookup(testActor)

      // getCachedQuery should NOT have been called
      expect(getCachedQuery).not.toHaveBeenCalled()
      // setCachedQuery SHOULD have been called (storing the fresh result)
      expect(setCachedQuery).toHaveBeenCalled()
    })

    it("caches successful results", async () => {
      await source.lookup(testActor)

      expect(setCachedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 12345,
          responseStatus: 200,
          errorMessage: null,
        })
      )
    })

    it("caches errors", async () => {
      source.lookupResult = {
        success: false,
        source: source.testCreateSourceEntry(Date.now(), 0),
        data: null,
        error: "Test error",
      }

      await source.lookup(testActor)

      expect(setCachedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 12345,
          responseStatus: 500,
          errorMessage: "Test error",
        })
      )
    })
  })

  // ==========================================================================
  // Biography Query Builder
  // ==========================================================================

  describe("buildBiographyQuery", () => {
    it("builds correct query string for actor", () => {
      const query = source.testBuildBiographyQuery(testActor)
      expect(query).toBe('"John Wayne" biography early life personal childhood')
    })

    it("handles actors with special characters in name", () => {
      const actor: ActorForBiography = {
        ...testActor,
        name: "Ren\u00e9e Zellweger",
      }
      const query = source.testBuildBiographyQuery(actor)
      expect(query).toBe('"Ren\u00e9e Zellweger" biography early life personal childhood')
    })
  })

  // ==========================================================================
  // isAvailable
  // ==========================================================================

  describe("isAvailable", () => {
    it("returns true by default", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  // ==========================================================================
  // reliabilityScore
  // ==========================================================================

  describe("reliabilityScore", () => {
    it("returns correct score for tier", () => {
      expect(source.reliabilityScore).toBe(0.85)
    })
  })

  // ==========================================================================
  // Error handling in lookup
  // ==========================================================================

  describe("error handling", () => {
    it("catches errors from performLookup and returns failure result", async () => {
      const errorSource = new (class extends BaseBiographySource {
        readonly name = "error-source"
        readonly type = "wikipedia-bio" as BiographySourceType
        readonly isFree = true
        readonly estimatedCostPerQuery = 0
        readonly reliabilityTier = ReliabilityTier.SECONDARY_COMPILATION

        protected async performLookup(): Promise<BiographyLookupResult> {
          throw new Error("Network failure")
        }
      })()

      const result = await errorSource.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network failure")
      expect(result.data).toBeNull()
      // Error should be cached
      expect(setCachedQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: "Network failure",
        })
      )
    })
  })
})
