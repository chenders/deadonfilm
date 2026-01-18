import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Import after mocking
import {
  getSourceName,
  resolveRedirectUrl,
  resolveRedirectUrls,
  resolveGeminiUrls,
  isGeminiRedirectUrl,
  SOURCE_NAMES,
} from "./url-resolver.js"

describe("url-resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getSourceName", () => {
    it("returns mapped name for known domains", () => {
      expect(getSourceName("people.com")).toBe("People")
      expect(getSourceName("variety.com")).toBe("Variety")
      expect(getSourceName("bbc.com")).toBe("BBC News")
      expect(getSourceName("nytimes.com")).toBe("New York Times")
    })

    it("handles www prefix", () => {
      expect(getSourceName("www.people.com")).toBe("People")
      expect(getSourceName("www.variety.com")).toBe("Variety")
    })

    it("formats unknown domains as title case", () => {
      expect(getSourceName("unknownsite.com")).toBe("Unknownsite.com")
      expect(getSourceName("example.org")).toBe("Example.org")
    })

    it("returns 'Unknown' for empty domain", () => {
      expect(getSourceName("")).toBe("Unknown")
    })
  })

  describe("isGeminiRedirectUrl", () => {
    it("identifies Gemini grounding redirect URLs", () => {
      expect(
        isGeminiRedirectUrl(
          "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFj..."
        )
      ).toBe(true)
    })

    it("returns false for non-redirect URLs", () => {
      expect(isGeminiRedirectUrl("https://people.com/article/123")).toBe(false)
      expect(isGeminiRedirectUrl("https://variety.com/news")).toBe(false)
    })
  })

  describe("resolveRedirectUrl", () => {
    it("resolves redirect URL to final destination", async () => {
      const finalUrl = "https://people.com/article/actor-death"
      mockFetch.mockResolvedValueOnce({
        url: finalUrl,
        ok: true,
      })

      const result = await resolveRedirectUrl(
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123"
      )

      expect(result.finalUrl).toBe(finalUrl)
      expect(result.domain).toBe("people.com")
      expect(result.sourceName).toBe("People")
      expect(result.error).toBeUndefined()
    })

    it("handles fetch timeout gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("The operation was aborted"))

      const originalUrl = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123"
      const result = await resolveRedirectUrl(originalUrl)

      expect(result.originalUrl).toBe(originalUrl)
      expect(result.finalUrl).toBe(originalUrl) // Falls back to original
      expect(result.error).toBe("Timeout")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network unavailable"))

      const originalUrl = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123"
      const result = await resolveRedirectUrl(originalUrl)

      expect(result.finalUrl).toBe(originalUrl) // Falls back to original
      expect(result.error).toBe("Network unavailable")
    })

    it("returns original URL domain for already-resolved URLs", async () => {
      const directUrl = "https://variety.com/2024/film/news/actor-dies"
      mockFetch.mockResolvedValueOnce({
        url: directUrl,
        ok: true,
      })

      const result = await resolveRedirectUrl(directUrl)

      expect(result.finalUrl).toBe(directUrl)
      expect(result.sourceName).toBe("Variety")
    })
  })

  describe("resolveRedirectUrls", () => {
    it("resolves multiple URLs in parallel", async () => {
      mockFetch
        .mockResolvedValueOnce({
          url: "https://people.com/article1",
          ok: true,
        })
        .mockResolvedValueOnce({
          url: "https://variety.com/article2",
          ok: true,
        })

      const results = await resolveRedirectUrls([
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/DEF456",
      ])

      expect(results.length).toBe(2)
      expect(results[0].finalUrl).toBe("https://people.com/article1")
      expect(results[0].sourceName).toBe("People")
      expect(results[1].finalUrl).toBe("https://variety.com/article2")
      expect(results[1].sourceName).toBe("Variety")
    })

    it("returns empty array for empty input", async () => {
      const results = await resolveRedirectUrls([])
      expect(results).toEqual([])
    })

    it("handles partial failures gracefully", async () => {
      mockFetch
        .mockResolvedValueOnce({
          url: "https://people.com/article",
          ok: true,
        })
        .mockRejectedValueOnce(new Error("Network error"))

      const results = await resolveRedirectUrls([
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/DEF456",
      ])

      expect(results.length).toBe(2)
      expect(results[0].error).toBeUndefined()
      expect(results[1].error).toBe("Network error")
    })
  })

  describe("resolveGeminiUrls", () => {
    it("only resolves Gemini redirect URLs", async () => {
      mockFetch.mockResolvedValueOnce({
        url: "https://people.com/article",
        ok: true,
      })

      const results = await resolveGeminiUrls([
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ABC123",
        "https://variety.com/direct-link", // Not a redirect URL
      ])

      expect(results.length).toBe(2)

      // The redirect URL was resolved
      expect(results.find((r) => r.originalUrl.includes("grounding-api-redirect"))?.finalUrl).toBe(
        "https://people.com/article"
      )

      // The direct URL was kept as-is (no fetch needed)
      expect(
        results.find((r) => r.originalUrl === "https://variety.com/direct-link")?.finalUrl
      ).toBe("https://variety.com/direct-link")
      expect(mockFetch).toHaveBeenCalledTimes(1) // Only one fetch for the redirect
    })

    it("handles all direct URLs without fetching", async () => {
      const results = await resolveGeminiUrls([
        "https://variety.com/article1",
        "https://people.com/article2",
      ])

      expect(results.length).toBe(2)
      expect(results[0].sourceName).toBe("Variety")
      expect(results[1].sourceName).toBe("People")
      expect(mockFetch).not.toHaveBeenCalled() // No fetches needed
    })
  })

  describe("SOURCE_NAMES mapping", () => {
    it("includes major entertainment news sources", () => {
      expect(SOURCE_NAMES["variety.com"]).toBe("Variety")
      expect(SOURCE_NAMES["hollywoodreporter.com"]).toBe("Hollywood Reporter")
      expect(SOURCE_NAMES["deadline.com"]).toBe("Deadline")
      expect(SOURCE_NAMES["ew.com"]).toBe("Entertainment Weekly")
      expect(SOURCE_NAMES["tmz.com"]).toBe("TMZ")
      expect(SOURCE_NAMES["people.com"]).toBe("People")
    })

    it("includes major news sources", () => {
      expect(SOURCE_NAMES["bbc.com"]).toBe("BBC News")
      expect(SOURCE_NAMES["cnn.com"]).toBe("CNN")
      expect(SOURCE_NAMES["nytimes.com"]).toBe("New York Times")
      expect(SOURCE_NAMES["apnews.com"]).toBe("AP News")
      expect(SOURCE_NAMES["reuters.com"]).toBe("Reuters")
    })

    it("includes obituary sites", () => {
      expect(SOURCE_NAMES["legacy.com"]).toBe("Legacy.com")
      expect(SOURCE_NAMES["findagrave.com"]).toBe("Find a Grave")
    })

    it("includes reference sites", () => {
      expect(SOURCE_NAMES["wikipedia.org"]).toBe("Wikipedia")
      expect(SOURCE_NAMES["britannica.com"]).toBe("Britannica")
    })
  })
})
