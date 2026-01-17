import { describe, it, expect, vi, beforeEach } from "vitest"
import { DataSourceType, type SearchResult, type LinkFollowConfig } from "./types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("./cache.js", () => ({
  setCachedQuery: vi.fn(),
}))

// Import after mocking
import {
  selectLinksWithHeuristics,
  extractDomain,
  extractWithRegex,
  fetchPages,
} from "./link-follower.js"

describe("link-follower", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("extractDomain", () => {
    it("extracts domain from URL, stripping www", () => {
      expect(extractDomain("https://www.example.com/path/to/page")).toBe("example.com")
      expect(extractDomain("http://legacy.com/obituaries/123")).toBe("legacy.com")
    })

    it("handles URLs without www prefix", () => {
      expect(extractDomain("https://variety.com/2024/film/news")).toBe("variety.com")
    })

    it("keeps subdomains other than www", () => {
      // extractDomain keeps subdomains (except www)
      expect(extractDomain("https://en.wikipedia.org/wiki/Actor")).toBe("en.wikipedia.org")
      expect(extractDomain("https://news.bbc.co.uk/article")).toBe("news.bbc.co.uk")
    })

    it("returns empty string for invalid URLs", () => {
      expect(extractDomain("not-a-url")).toBe("")
      expect(extractDomain("")).toBe("")
    })
  })

  describe("selectLinksWithHeuristics", () => {
    const defaultConfig: LinkFollowConfig = {
      enabled: true,
      maxLinksPerActor: 3,
      maxCostPerActor: 0.01,
      aiLinkSelection: false,
      aiContentExtraction: false,
    }

    const mockResults: SearchResult[] = [
      {
        title: "Actor Dies at 75",
        url: "https://www.legacy.com/obituaries/actor-name",
        snippet: "Actor passed away peacefully",
        source: DataSourceType.DUCKDUCKGO,
        domain: "legacy.com",
      },
      {
        title: "Celebrity News",
        url: "https://www.tmz.com/gossip",
        snippet: "Celebrity spotted shopping",
        source: DataSourceType.DUCKDUCKGO,
        domain: "tmz.com",
      },
      {
        title: "Actor Cause of Death Revealed",
        url: "https://variety.com/2024/film/actor-death",
        snippet: "The cause of death has been confirmed",
        source: DataSourceType.DUCKDUCKGO,
        domain: "variety.com",
      },
      {
        title: "Actor - Wikipedia",
        url: "https://en.wikipedia.org/wiki/Actor",
        snippet: "Actor biography and filmography",
        source: DataSourceType.DUCKDUCKGO,
        domain: "wikipedia.org",
      },
    ]

    it("selects top links by domain scoring", () => {
      const result = selectLinksWithHeuristics(mockResults, 3, defaultConfig)

      expect(result.selectedUrls.length).toBeLessThanOrEqual(3)
      expect(result.costUsd).toBe(0) // Heuristic selection is free
    })

    it("prioritizes obituary and news domains", () => {
      const result = selectLinksWithHeuristics(mockResults, 3, defaultConfig)

      // Legacy.com and variety.com should be prioritized
      const selectedDomains = result.selectedUrls.map((url) => extractDomain(url))
      expect(selectedDomains).toContain("legacy.com")
      expect(selectedDomains).toContain("variety.com")
    })

    it("respects maxLinksPerActor config", () => {
      const limitedConfig = { ...defaultConfig, maxLinksPerActor: 1 }
      const result = selectLinksWithHeuristics(mockResults, 1, limitedConfig)

      expect(result.selectedUrls.length).toBe(1)
    })

    it("filters out blocked domains", () => {
      const configWithBlocked = {
        ...defaultConfig,
        blockedDomains: ["legacy.com"],
      }
      const result = selectLinksWithHeuristics(mockResults, 3, configWithBlocked)

      expect(result.selectedUrls.some((url) => url.includes("legacy.com"))).toBe(false)
    })

    it("only includes allowed domains when specified", () => {
      const configWithAllowed = {
        ...defaultConfig,
        allowedDomains: ["variety.com"],
      }
      const result = selectLinksWithHeuristics(mockResults, 3, configWithAllowed)

      expect(result.selectedUrls.every((url) => url.includes("variety.com"))).toBe(true)
    })
  })

  describe("extractWithRegex", () => {
    it("extracts death-related keywords from content", () => {
      // Content needs to be > 100 chars and mention actor name + death
      const content =
        "John Smith was a beloved actor who died of cancer on January 15, 2024. He had a long career in Hollywood spanning many decades. His death was a shock to fans worldwide."
      const pages = [
        {
          url: "https://example.com/article",
          content,
          title: "Actor Obituary",
          contentLength: content.length,
          fetchTimeMs: 100,
        },
      ]

      const result = extractWithRegex(pages, "John Smith")

      expect(result.confidence).toBeGreaterThan(0)
    })

    it("identifies suicide mentions", () => {
      const content =
        "John Smith took his own life after years of depression. The actor had struggled with mental health issues for many years before his tragic death at the age of 45."
      const pages = [
        {
          url: "https://example.com/article",
          content,
          title: "Tragic News",
          contentLength: content.length,
          fetchTimeMs: 100,
        },
      ]

      const result = extractWithRegex(pages, "John Smith")

      expect(result.notableFactors).toContain("suicide")
    })

    it("identifies overdose mentions", () => {
      const content =
        "John Smith passed away due to an accidental drug overdose according to the coroner report. The actor died at his home in Los Angeles at the age of 38."
      const pages = [
        {
          url: "https://example.com/article",
          content,
          title: "Death Report",
          contentLength: content.length,
          fetchTimeMs: 100,
        },
      ]

      const result = extractWithRegex(pages, "John Smith")

      expect(result.notableFactors).toContain("overdose")
    })

    it("returns null confidence for pages with no death info", () => {
      const content =
        "John Smith won an Academy Award for his outstanding performance in the film. He gave an emotional acceptance speech thanking his family and colleagues for their support."
      const pages = [
        {
          url: "https://example.com/article",
          content,
          title: "Career Highlights",
          contentLength: content.length,
          fetchTimeMs: 100,
        },
      ]

      const result = extractWithRegex(pages, "John Smith")

      // No death-related keywords found
      expect(result.circumstances).toBeNull()
    })

    it("handles empty pages array", () => {
      const result = extractWithRegex([], "John Smith")

      expect(result.confidence).toBe(0)
      expect(result.circumstances).toBeNull()
    })

    it("filters out pages with errors", () => {
      const pages = [
        {
          url: "https://example.com/article",
          content: "",
          title: "",
          contentLength: 0,
          fetchTimeMs: 100,
          error: "HTTP 404",
        },
      ]

      const result = extractWithRegex(pages, "John Smith")

      expect(result.confidence).toBe(0)
    })
  })

  describe("fetchPages", () => {
    it("fetches pages and extracts content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          "<html><head><title>Test Page</title></head><body>Page content here</body></html>",
      })

      const result = await fetchPages(["https://example.com/page"])

      expect(result.length).toBe(1)
      expect(result[0].error).toBeUndefined() // No error means success
      expect(result[0].title).toBe("Test Page")
      expect(result[0].content).toContain("Page content")
    })

    it("handles fetch failures gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await fetchPages(["https://example.com/page"])

      expect(result.length).toBe(1)
      expect(result[0].error).toBeDefined()
      expect(result[0].error).toContain("Network error")
    })

    it("handles HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not found",
      })

      const result = await fetchPages(["https://example.com/page"])

      expect(result.length).toBe(1)
      expect(result[0].error).toBeDefined()
      expect(result[0].error).toContain("404")
    })

    it("fetches multiple pages and returns array of same length", async () => {
      // mockFetch will be called once per URL
      mockFetch.mockImplementation(async () => ({
        ok: true,
        text: async () => "<html><head><title>Test Page</title></head><body>Content</body></html>",
      }))

      const result = await fetchPages(["https://example.com/page1", "https://example.com/page2"])

      expect(result.length).toBe(2)
      // Verify fetch was called for each URL
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
