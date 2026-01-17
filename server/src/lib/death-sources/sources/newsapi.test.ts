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

import { NewsAPISource } from "./newsapi.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("NewsAPISource", () => {
  let source: NewsAPISource
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv, NEWSAPI_KEY: "test-api-key" }
    source = new NewsAPISource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("NewsAPI")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.NEWSAPI)
    })

    it("is marked as free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is available when API key is set", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("is not available when API key is missing", () => {
      process.env = { ...originalEnv }
      delete process.env.NEWSAPI_KEY
      const sourceWithoutKey = new NewsAPISource()
      expect(sourceWithoutKey.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Chadwick Boseman",
      birthday: "1976-11-29",
      deathday: "2020-08-28",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 40.0,
    }

    it("returns early for living actors", async () => {
      const livingActor: ActorForEnrichment = {
        ...testActor,
        deathday: null,
      }

      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns error when API key not configured", async () => {
      process.env = { ...originalEnv }
      delete process.env.NEWSAPI_KEY
      const sourceWithoutKey = new NewsAPISource()

      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("NewsAPI key not configured")
    })

    it("finds articles and extracts death information", async () => {
      const apiResponse = {
        status: "ok",
        totalResults: 2,
        articles: [
          {
            source: { id: null, name: "BBC News" },
            title: "Chadwick Boseman dies of cancer at 43",
            description:
              "The Black Panther star Chadwick Boseman died of colon cancer, his family announced.",
            url: "https://bbc.com/news/chadwick-boseman",
            content:
              "Chadwick Boseman, who played Black Panther in the Marvel Cinematic Universe, died on August 28 after a four-year battle with colon cancer. He was 43.",
          },
          {
            source: { id: null, name: "CNN" },
            title: "Chadwick Boseman obituary",
            description:
              "Actor Chadwick Boseman passed away at his home in Los Angeles surrounded by family.",
            url: "https://cnn.com/entertainment/chadwick-boseman-obituary",
            content: null,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.NEWSAPI)
      expect(result.data?.circumstances).toContain("cancer")
      expect(result.data?.additionalContext).toContain("BBC News")
    })

    it("returns error when no articles found", async () => {
      const apiResponse = {
        status: "ok",
        totalResults: 0,
        articles: [],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No news articles found")
    })

    it("handles API error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          status: "error",
          code: "apiKeyInvalid",
          message: "Your API key is invalid.",
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Your API key is invalid")
    })

    it("extracts location of death", async () => {
      const apiResponse = {
        status: "ok",
        totalResults: 1,
        articles: [
          {
            source: { id: null, name: "Variety" },
            title: "Actor dies in New York",
            description: "Boseman died in Los Angeles from complications.",
            url: "https://variety.com/article",
            content: null,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("extracts notable factors", async () => {
      const apiResponse = {
        status: "ok",
        totalResults: 1,
        articles: [
          {
            source: { id: null, name: "CNN" },
            title: "Actor died suddenly",
            description:
              "Boseman died suddenly at his home. An autopsy was performed. His death was unexpected and came as a tragedy.",
            url: "https://cnn.com/article",
            content: null,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("sudden")
      expect(result.data?.notableFactors).toContain("autopsy")
    })

    it("returns error when articles have no death info", async () => {
      const apiResponse = {
        status: "ok",
        totalResults: 1,
        articles: [
          {
            source: { id: null, name: "Entertainment Weekly" },
            title: "Chadwick Boseman interview",
            description: "We spoke to Chadwick Boseman about his upcoming projects.",
            url: "https://ew.com/interview",
            content: "In this exclusive interview...",
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death information found")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })

    it("includes API key in request header", async () => {
      const apiResponse = {
        status: "ok",
        totalResults: 0,
        articles: [],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      })

      await source.lookup(testActor)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Api-Key": "test-api-key",
          }),
        })
      )
    })

    it("aggregates information from multiple sources", async () => {
      const apiResponse = {
        status: "ok",
        totalResults: 3,
        articles: [
          {
            source: { id: null, name: "BBC" },
            title: "Actor Boseman dies",
            description: "He died of colon cancer.",
            url: "https://bbc.com/1",
            content: null,
          },
          {
            source: { id: null, name: "CNN" },
            title: "Boseman death",
            description: "Boseman passed away at his home.",
            url: "https://cnn.com/2",
            content: null,
          },
          {
            source: { id: null, name: "NBC" },
            title: "Remembering Boseman",
            description: "Boseman died after a battle with illness.",
            url: "https://nbc.com/3",
            content: null,
          },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => apiResponse,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Should mention multiple sources
      expect(result.data?.additionalContext).toContain("3 article(s)")
    })
  })
})
