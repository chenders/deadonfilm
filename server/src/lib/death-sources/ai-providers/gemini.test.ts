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

// Mock url-resolver before importing source
vi.mock("../url-resolver.js", () => ({
  resolveGeminiUrls: vi.fn().mockResolvedValue([]),
}))

import { GeminiFlashSource, GeminiProSource } from "./gemini.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"
import { resolveGeminiUrls } from "../url-resolver.js"

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
                      sources: ["https://example.com/article1", "https://example.com/article2"],
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
      // First source URL is stored at top level for backward compatibility
      expect(result.source.url).toBe("https://example.com/article1")
      // All sources are stored in rawData.parsed.sources
      const rawData = result.source.rawData as { parsed: { sources: string[] } }
      expect(rawData.parsed.sources).toEqual([
        "https://example.com/article1",
        "https://example.com/article2",
      ])
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
                      sources: [
                        "https://news.example.com/obituary",
                        "https://wiki.example.org/actor",
                        "https://hospital.example.com/announcement",
                      ],
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
      // First source URL is stored at top level
      expect(result.source.url).toBe("https://news.example.com/obituary")
      // All sources are stored in rawData.parsed.sources
      const rawData = result.source.rawData as { parsed: { sources: string[] } }
      expect(rawData.parsed.sources).toEqual([
        "https://news.example.com/obituary",
        "https://wiki.example.org/actor",
        "https://hospital.example.com/announcement",
      ])
    })

    it("resolves grounding chunk URLs and stores resolved sources", async () => {
      const mockResolvedSources = [
        {
          originalUrl: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
          finalUrl: "https://people.com/obituary/test-actor",
          domain: "people.com",
          sourceName: "People",
        },
        {
          originalUrl: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/DEF456",
          finalUrl: "https://variety.com/news/test-actor-dies",
          domain: "variety.com",
          sourceName: "Variety",
        },
      ]
      vi.mocked(resolveGeminiUrls).mockResolvedValueOnce(mockResolvedSources)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      circumstances: "Died peacefully at home",
                      notable_factors: [],
                      rumored_circumstances: null,
                      location_of_death: "New York",
                      confidence: "high",
                      sources: [],
                    }),
                  },
                ],
              },
              groundingMetadata: {
                webSearchQueries: ["Test Actor death"],
                groundingChunks: [
                  {
                    web: {
                      uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
                      title: "People Article",
                    },
                  },
                  {
                    web: {
                      uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/DEF456",
                      title: "Variety Article",
                    },
                  },
                ],
              },
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(resolveGeminiUrls).toHaveBeenCalledWith([
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/DEF456",
      ])

      // First resolved URL should be used as the source URL
      expect(result.source.url).toBe("https://people.com/obituary/test-actor")

      // Resolved sources should be stored in rawData
      const rawData = result.source.rawData as { resolvedSources: typeof mockResolvedSources }
      expect(rawData.resolvedSources).toEqual(mockResolvedSources)
    })

    it("handles grounding URL resolution failure gracefully", async () => {
      vi.mocked(resolveGeminiUrls).mockRejectedValueOnce(new Error("Resolution failed"))

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      circumstances: "Died of natural causes",
                      notable_factors: [],
                      rumored_circumstances: null,
                      location_of_death: "Chicago",
                      confidence: "medium",
                      sources: ["https://fallback.example.com"],
                    }),
                  },
                ],
              },
              groundingMetadata: {
                groundingChunks: [
                  {
                    web: {
                      uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/FAIL",
                    },
                  },
                ],
              },
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      // Should still succeed, falling back to parsed sources
      expect(result.success).toBe(true)
      expect(result.source.url).toBe("https://fallback.example.com")

      // resolvedSources should be empty due to failure
      const rawData = result.source.rawData as { resolvedSources: unknown[] }
      expect(rawData.resolvedSources).toEqual([])
    })
  })
})
