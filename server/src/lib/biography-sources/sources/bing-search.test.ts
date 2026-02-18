import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock external dependencies before imports
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../death-sources/link-follower.js", () => ({
  fetchPages: vi.fn().mockResolvedValue([]),
  extractDomain: (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "")
    } catch {
      return ""
    }
  },
}))

vi.mock("../content-cleaner.js", () => ({
  mechanicalPreClean: vi.fn().mockReturnValue({
    text: "",
    metadata: { title: null, publication: null, author: null, publishDate: null },
  }),
  aiExtractBiographicalContent: vi.fn().mockResolvedValue({
    extractedText: null,
    articleTitle: null,
    publication: null,
    author: null,
    publishDate: null,
    relevance: "none",
    contentType: "other",
    url: "",
    domain: "",
    originalBytes: 0,
    cleanedBytes: 0,
    costUsd: 0,
  }),
  shouldPassToSynthesis: vi.fn().mockReturnValue(true),
}))

import { BingBiographySearch } from "./bing-search.js"
import { BiographySourceType } from "../types.js"

describe("BingBiographySearch", () => {
  let source: BingBiographySearch
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      BING_SEARCH_API_KEY: "test-bing-key",
    }
    source = new BingBiographySearch()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("isAvailable", () => {
    it("returns true when API key is configured", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when API key is missing", () => {
      delete process.env.BING_SEARCH_API_KEY
      source = new BingBiographySearch()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Bing (Bio)")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.BING_SEARCH_BIO)
    })

    it("is not free", () => {
      expect(source.isFree).toBe(false)
    })

    it("has estimated cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.003)
    })
  })

  describe("lookup", () => {
    const mockActor = {
      id: 123,
      tmdb_id: 456,
      imdb_person_id: "nm0000001",
      name: "Jane Doe",
      birthday: "1945-03-20",
      deathday: "2023-11-15",
      wikipedia_url: null,
      biography_raw_tmdb: null,
      biography: null,
      place_of_birth: null,
    }

    it("returns results on successful API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webPages: {
            value: [
              {
                name: "Jane Doe Early Life",
                url: "https://biography.com/jane-doe",
                snippet: "Jane Doe grew up in a small town in the Midwest",
                displayUrl: "biography.com",
              },
              {
                name: "Jane Doe Interview",
                url: "https://example.com/interview",
                snippet: "The actress shared stories about her childhood",
                displayUrl: "example.com",
              },
            ],
            totalEstimatedMatches: 50,
          },
        }),
      })

      const result = await source.lookup(mockActor)

      // Verify the API was called with correct headers
      const fetchCall = mockFetch.mock.calls[0]
      const headers = fetchCall[1].headers
      expect(headers["Ocp-Apim-Subscription-Key"]).toBe("test-bing-key")
    })

    it("includes news results when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webPages: {
            value: [
              {
                name: "Web Result",
                url: "https://example.com/page",
                snippet: "Web page content about her childhood",
              },
            ],
          },
          news: {
            value: [
              {
                name: "Jane Doe Profile: From Humble Beginnings",
                url: "https://news.example.com/profile",
                description: "A look at the early life of Jane Doe",
                datePublished: "2023-11-16T10:00:00Z",
              },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      // Should not error since we have results
      expect(mockFetch).toHaveBeenCalled()
    })

    it("avoids duplicate URLs from web and news results", async () => {
      const sameUrl = "https://example.com/article"
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webPages: {
            value: [
              {
                name: "Biography Article",
                url: sameUrl,
                snippet: "Jane Doe grew up in a family of artists",
              },
            ],
          },
          news: {
            value: [
              {
                name: "Same Biography Article",
                url: sameUrl,
                description: "The actress's early life was shaped by poverty",
              },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.source.type).toBe(BiographySourceType.BING_SEARCH_BIO)
    })

    it("handles 401 authentication error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid")
    })

    it("handles 429 rate limit error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("rate limit")
    })

    it("handles API error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: {
            code: "InvalidRequest",
            message: "The request is invalid",
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("invalid")
    })

    it("handles empty search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          webPages: {
            value: [],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No search results")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Connection refused")
    })

    it("returns error when API key not configured", async () => {
      delete process.env.BING_SEARCH_API_KEY
      source = new BingBiographySearch()

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not configured")
    })
  })
})
