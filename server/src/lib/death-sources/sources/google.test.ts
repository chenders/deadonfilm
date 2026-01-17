import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GoogleSearchSource } from "./google.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("GoogleSearchSource", () => {
  let source: GoogleSearchSource
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up environment variables for testing
    process.env = {
      ...originalEnv,
      GOOGLE_SEARCH_API_KEY: "test-api-key",
      GOOGLE_SEARCH_CX: "test-cx",
    }
    source = new GoogleSearchSource()
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
      source = new GoogleSearchSource()
      expect(source.isAvailable()).toBe(false)
    })

    it("returns false when CX is missing", () => {
      delete process.env.GOOGLE_SEARCH_CX
      source = new GoogleSearchSource()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Google")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.GOOGLE_SEARCH)
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
      tmdbId: 456,
      name: "John Smith",
      birthday: "1950-01-15",
      deathday: "2024-06-01",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    it("returns search results on successful API response", async () => {
      // Mock Google API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              title: "John Smith Obituary",
              link: "https://example.com/obituary",
              snippet: "John Smith passed away peacefully at age 74",
              displayLink: "example.com",
            },
            {
              title: "Actor John Smith Dies",
              link: "https://news.example.com/article",
              snippet: "The actor died of natural causes",
              displayLink: "news.example.com",
            },
          ],
          searchInformation: {
            totalResults: "100",
            searchTime: 0.5,
          },
        }),
      })
      // Mock link following page fetches
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<html><body>Page content about John Smith</body></html>",
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // First call is API, subsequent calls are link following
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1)

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
      source = new GoogleSearchSource()

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not configured")
    })
  })
})
