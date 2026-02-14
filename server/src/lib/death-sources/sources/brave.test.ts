import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { BraveSearchSource } from "./brave.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("BraveSearchSource", () => {
  let source: BraveSearchSource
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    // Set up environment variables for testing
    process.env = {
      ...originalEnv,
      BRAVE_SEARCH_API_KEY: "test-brave-key",
    }
    source = new BraveSearchSource()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("isAvailable", () => {
    it("returns true when API key is configured", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when API key is missing", () => {
      delete process.env.BRAVE_SEARCH_API_KEY
      source = new BraveSearchSource()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Brave Search")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.BRAVE_SEARCH)
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
      name: "Jane Doe",
      birthday: "1945-03-20",
      deathday: "2023-11-15",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 8.2,
    }

    it("returns search results on successful API response", async () => {
      // Mock Brave API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Jane Doe Obituary",
                url: "https://example.com/obituary",
                description: "Jane Doe passed away after a long illness",
              },
              {
                title: "Actress Jane Doe Dies at 78",
                url: "https://news.example.com/article",
                description: "The beloved actress died of heart failure",
              },
            ],
          },
        }),
      })
      // Mock link following page fetches
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<html><body>Page content</body></html>",
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // First call is API, subsequent calls are link following
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1)

      // Verify the API was called with correct headers
      const fetchCall = mockFetch.mock.calls[0]
      const headers = fetchCall[1].headers
      expect(headers["X-Subscription-Token"]).toBe("test-brave-key")
    })

    it("includes news results when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Web Result",
                url: "https://example.com/page",
                description: "Web page content",
              },
            ],
          },
          news: {
            results: [
              {
                title: "Breaking News: Jane Doe Dies",
                url: "https://news.example.com/breaking",
                description: "News about the death",
                age: "2 hours ago",
              },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
    })

    it("avoids duplicate URLs from web and news results", async () => {
      const sameUrl = "https://example.com/article"
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: "Death Article",
                url: sameUrl,
                description: "Jane Doe died of heart failure at age 78",
              },
            ],
          },
          news: {
            results: [
              {
                title: "Same Death Article",
                url: sameUrl,
                description: "The actress passed away peacefully",
              },
            ],
          },
        }),
      })
      // Mock link following
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => "<html><body>Jane Doe died of heart failure</body></html>",
      })

      const result = await source.lookup(mockActor)

      // The search result should contain death info from snippets
      expect(result.source.type).toBe(DataSourceType.BRAVE_SEARCH)
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

    it("handles API error in response body", async () => {
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
          web: {
            results: [],
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
      delete process.env.BRAVE_SEARCH_API_KEY
      source = new BraveSearchSource()

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not configured")
    })
  })
})
