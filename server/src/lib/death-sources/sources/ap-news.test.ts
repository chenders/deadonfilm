import { describe, it, expect, vi, beforeEach } from "vitest"
import { APNewsSource } from "./ap-news.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("APNewsSource", () => {
  let source: APNewsSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new APNewsSource()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("AP News")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.AP_NEWS)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is always available (no API key needed)", () => {
      expect(source.isAvailable()).toBe(true)
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

    it("returns results on successful search and article fetch", async () => {
      // Mock search results page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/article/john-smith-death-obituary-123">
                <h3>John Smith Dies at 74</h3>
                <p>The acclaimed actor John Smith has died after a battle with cancer.</p>
              </a>
            </body>
          </html>
        `,
      })
      // Mock article page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <head>
              <meta name="description" content="John Smith, beloved actor, passed away at his home in Los Angeles.">
            </head>
            <body>
              <article>
                <div class="RichTextStoryBody">
                  John Smith died peacefully at his home in Los Angeles on June 1, 2024.
                  He was 74 years old. The actor passed away after a battle with cancer.
                </div>
              </article>
            </body>
          </html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBeDefined()
      expect(result.source.url).toContain("apnews.com")
    })

    it("includes death year in search query", async () => {
      // Mock search results page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/article/john-smith-death-obituary-123">
                <h3>John Smith Dies at 74</h3>
                <p>The acclaimed actor John Smith has died after a battle with cancer.</p>
              </a>
            </body>
          </html>
        `,
      })
      // Mock article page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <div class="RichTextStoryBody">
                John Smith died peacefully at his home on June 1, 2024.
              </div>
            </body>
          </html>
        `,
      })

      await source.lookup(mockActor)

      // Verify the search URL includes the death year (2024)
      const searchUrl = mockFetch.mock.calls[0][0] as string
      expect(searchUrl).toContain("2024")
    })

    it("falls back to search snippet when article fetch fails", async () => {
      // Mock search results page with death info in snippet
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/article/john-smith-death-123">
                <h3>John Smith Dies</h3>
                <p>Actor John Smith has died of natural causes at age 74.</p>
              </a>
            </body>
          </html>
        `,
      })
      // Article fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.source.confidence).toBeLessThan(0.5) // Lower confidence for snippet-only
    })

    it("throws SourceAccessBlockedError on 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(mockActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 429", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      await expect(source.lookup(mockActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("handles no relevant articles found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/article/unrelated-123">
                <h3>Some Unrelated Article</h3>
                <p>This article has nothing to do with the actor.</p>
              </a>
            </body>
          </html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No relevant death articles")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })

    it("extracts location of death from article", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <a href="/article/john-smith-death-123">
              <h3>John Smith Dies</h3>
              <p>Actor has died.</p>
            </a>
          </body></html>
        `,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <div class="RichTextStoryBody">
              John Smith died at his home in Beverly Hills, California.
              He passed away peacefully surrounded by family.
            </div>
          </body></html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBeDefined()
    })

    it("extracts notable factors from article text", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <a href="/article/john-smith-death-123">
              <h3>John Smith Dies</h3>
              <p>Actor died of cancer.</p>
            </a>
          </body></html>
        `,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html><body>
            <div class="RichTextStoryBody">
              John Smith died after a long battle with cancer.
              He had been hospitalized for several weeks before his death.
            </div>
          </body></html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("cancer")
    })
  })
})
