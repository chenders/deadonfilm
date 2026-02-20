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

// Mock archive fallback
const mockFetchFromArchive = vi.fn()
vi.mock("../archive-fallback.js", () => ({
  fetchFromArchive: (...args: unknown[]) => mockFetchFromArchive(...args),
}))

// Mock searchWeb in news-utils to bypass Google CSE and route through mocked fetch directly
vi.mock("./news-utils.js", async () => {
  const actual = await vi.importActual<typeof import("./news-utils.js")>("./news-utils.js")
  return {
    ...actual,
    searchWeb: vi
      .fn()
      .mockImplementation(
        async (query: string, options?: { userAgent?: string; signal?: AbortSignal }) => {
          const response = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            { headers: { "User-Agent": options?.userAgent || "test" }, signal: options?.signal }
          )
          if (!response.ok)
            return { html: "", engine: "duckduckgo" as const, error: `HTTP ${response.status}` }
          const html = await response.text()
          return { html, engine: "duckduckgo" as const }
        }
      ),
  }
})

import { BBCNewsSource } from "./bbc-news.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("BBCNewsSource", () => {
  let source: BBCNewsSource

  beforeEach(() => {
    source = new BBCNewsSource()
    mockFetch.mockReset()
    mockFetchFromArchive.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("BBC News")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.BBC_NEWS)
    })

    it("is marked as free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is available by default", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 501,
      tmdbId: 17419,
      name: "Alan Rickman",
      birthday: "1946-02-21",
      deathday: "2016-01-14",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 35.0,
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

    it("returns early for deaths before 1997", async () => {
      const oldActor: ActorForEnrichment = {
        ...testActor,
        name: "Audrey Hepburn",
        deathday: "1993-01-20",
      }

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("BBC News online archives don't cover deaths before 1997")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("finds obituary and extracts death information", async () => {
      // Search returns BBC News URL
      const searchHtml = `
        <html><body>
          <a href="https://www.bbc.co.uk/news/entertainment-arts-35313604">
            Alan Rickman Dies Aged 69
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article with death info
      const articleHtml = `
        <html>
          <body>
            <article>
              <p>Alan Rickman, the acclaimed British actor known for playing Severus Snape
              in the Harry Potter films and Hans Gruber in Die Hard, died on January 14
              in London after a battle with cancer. He was 69.</p>
              <p>Rickman's family confirmed that he died of pancreatic cancer, which
              he had been privately battling.</p>
            </article>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.BBC_NEWS)
      expect(result.data?.circumstances).toContain("died")
    })

    it("returns error when no obituary found in search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No BBC News obituary found")
    })

    it("returns error when search is blocked", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it("throws SourceAccessBlockedError on 403 during article fetch", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.bbc.co.uk/news/entertainment-arts-35313604">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      // Archive fallback also fails
      mockFetchFromArchive.mockResolvedValueOnce({
        success: false,
        content: null,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("tries archive.org fallback when article returns 403", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.bbc.co.uk/news/entertainment-arts-35313604">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      // Archive fallback returns content
      mockFetchFromArchive.mockResolvedValueOnce({
        success: true,
        content: `
          <html><body>
            <p>Alan Rickman died on January 14 after a battle with cancer. He was 69.</p>
          </body></html>
        `,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(mockFetchFromArchive).toHaveBeenCalled()
      expect(result.data?.circumstances).toContain("died")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it("returns error when article has no death info", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.bbc.co.uk/news/entertainment-arts-35313604">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html>
          <body>
            <p>Alan Rickman discusses his career and his approach to acting.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death information")
    })

    it("returns error when search fails with non-403 status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it("returns error when article fetch fails with non-403 status", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.bbc.co.uk/news/entertainment-arts-35313604">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Could not fetch BBC News article")
    })
  })
})
