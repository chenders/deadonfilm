import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock cache module before importing source
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock logger to avoid file operations during tests
vi.mock("../logger.js", () => ({
  getEnrichmentLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

import { GeminiFlashSource, GeminiProSource } from "./gemini.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("GeminiFlashSource", () => {
  let source: GeminiFlashSource

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-api-key")
    source = new GeminiFlashSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Gemini Flash")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.GEMINI_FLASH)
    })

    it("is not marked as free", () => {
      expect(source.isFree).toBe(false)
    })

    it("has correct cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.0001)
    })

    it("is available when API key is set", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("is not available without API key", () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new GeminiFlashSource()
      expect(sourceWithoutKey.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Test Actor",
      birthday: "1950-01-01",
      deathday: "2020-06-15",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 50.0,
    }

    it("returns error when API key is missing", async () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new GeminiFlashSource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("API key not configured")
    })

    it("extracts death info from API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      circumstances: "Died of heart failure",
                      notable_factors: ["sudden death"],
                      rumored_circumstances: null,
                      location_of_death: "New York City",
                      confidence: "high",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBe("Died of heart failure")
      expect(result.data?.locationOfDeath).toBe("New York City")
    })

    it("handles API errors gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Gemini API error")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })
  })
})

describe("GeminiProSource", () => {
  let source: GeminiProSource

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-api-key")
    source = new GeminiProSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Gemini Pro")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.GEMINI_PRO)
    })

    it("has correct cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.002)
    })

    it("uses search grounding", () => {
      expect(source.useSearchGrounding).toBe(true)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Test Actor",
      birthday: "1950-01-01",
      deathday: "2020-06-15",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 50.0,
    }

    it("extracts death info with grounding metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      circumstances: "Died of cancer after a long battle",
                      notable_factors: ["illness"],
                      rumored_circumstances: null,
                      location_of_death: "Los Angeles",
                      confidence: "high",
                    }),
                  },
                ],
              },
              groundingMetadata: {
                webSearchQueries: ["Test Actor death cause"],
                groundingSupports: [
                  {
                    segment: { text: "died of cancer" },
                    confidenceScores: [0.95],
                  },
                ],
              },
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBe("Died of cancer after a long battle")
      expect(result.source.rawData).toHaveProperty("groundingMetadata")
    })
  })
})
