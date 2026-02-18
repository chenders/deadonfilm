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

import { GoogleBiographySearch } from "./google-search.js"
import { BiographySourceType } from "../types.js"

describe("GoogleBiographySearch", () => {
  let source: GoogleBiographySearch
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      GOOGLE_SEARCH_API_KEY: "test-api-key",
      GOOGLE_SEARCH_CX: "test-cx",
    }
    source = new GoogleBiographySearch()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("isAvailable", () => {
    it("returns true when API key and CX are configured", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when API key is missing", () => {
      delete process.env.GOOGLE_SEARCH_API_KEY
      source = new GoogleBiographySearch()
      expect(source.isAvailable()).toBe(false)
    })

    it("returns false when CX is missing", () => {
      delete process.env.GOOGLE_SEARCH_CX
      source = new GoogleBiographySearch()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Google (Bio)")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.GOOGLE_SEARCH_BIO)
    })

    it("is not free", () => {
      expect(source.isFree).toBe(false)
    })

    it("has estimated cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0.005)
    })
  })

  describe("lookup", () => {
    const mockActor = {
      id: 123,
      tmdb_id: 456,
      imdb_person_id: "nm0000001",
      name: "John Smith",
      birthday: "1950-01-15",
      deathday: "2024-06-01",
      wikipedia_url: null,
      biography_raw_tmdb: null,
      biography: null,
      place_of_birth: null,
    }

    it("returns results on successful API response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              title: "John Smith Early Life and Biography",
              link: "https://biography.com/john-smith",
              snippet: "John Smith grew up in a small town and attended local school",
              displayLink: "biography.com",
            },
            {
              title: "John Smith Interview",
              link: "https://example.com/interview",
              snippet: "The actor's childhood was shaped by family struggles",
              displayLink: "example.com",
            },
          ],
          searchInformation: {
            totalResults: "100",
            searchTime: 0.5,
          },
        }),
      })

      const result = await source.lookup(mockActor)

      // Verify the API was called with correct parameters
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain("customsearch/v1")
      expect(callUrl).toContain("key=test-api-key")
      expect(callUrl).toContain("cx=test-cx")
      expect(callUrl).toContain("John+Smith")
    })

    it("handles API rate limit error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
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
            code: 400,
            message: "Invalid API key",
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid API key")
    })

    it("handles empty search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No search results")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })

    it("returns error when API keys not configured", async () => {
      delete process.env.GOOGLE_SEARCH_API_KEY
      source = new GoogleBiographySearch()

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not configured")
    })
  })
})
