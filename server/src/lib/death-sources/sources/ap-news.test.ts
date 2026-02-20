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

import { APNewsSource } from "./ap-news.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("APNewsSource", () => {
  let source: APNewsSource

  beforeEach(() => {
    source = new APNewsSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    const mockActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "John Smith",
      birthday: "1950-01-15",
      deathday: "2024-06-01",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    it("returns early for living actors", async () => {
      const livingActor: ActorForEnrichment = {
        ...mockActor,
        deathday: null,
      }

      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("finds obituary and extracts death information", async () => {
      // Search returns AP News URL
      const searchHtml = `
        <html><body>
          <a href="https://apnews.com/article/john-smith-death-obituary-123">
            John Smith Dies at 74
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
              <p>John Smith, the acclaimed actor, died on June 1, 2024 at his home in Los Angeles.
              He was 74 years old. Smith passed away after a battle with cancer.</p>
            </article>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.AP_NEWS)
      expect(result.data?.circumstances).toContain("died")
    })

    it("returns error when no obituary found in search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No AP News obituary found")
    })

    it("returns error when search is blocked", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it("throws SourceAccessBlockedError on 403 during article fetch", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://apnews.com/article/john-smith-dead/">Article</a>
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

      await expect(source.lookup(mockActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("returns error when article fetch fails with non-403 status", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://apnews.com/article/john-smith-dead/">Article</a>
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

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Could not fetch AP News article")
    })

    it("returns error when article has no death info", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://apnews.com/article/john-smith-interview/">Article</a>
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
            <p>John Smith talks about his upcoming movie and reflects on his career.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death information")
    })

    it("extracts location of death from article", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://apnews.com/article/john-smith-dies/">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html><body>
          <p>Smith died in Los Angeles from cardiac arrest.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("extracts notable factors from article text", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://apnews.com/article/john-smith-dies/">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html><body>
          <p>John Smith died suddenly at his home. An autopsy was performed and a
          coroner investigation is underway. His death was unexpected and came
          as a tragedy to the entertainment community.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("autopsy")
      expect(result.data?.notableFactors).toContain("sudden")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it("prefers obituary URLs over other article types", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://apnews.com/article/john-smith-interview-123">Interview</a>
          <a href="https://apnews.com/article/john-smith-obituary-dead-456">Obituary</a>
          <a href="https://apnews.com/article/john-smith-review-789">Review</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html><body><p>John Smith died on June 1, 2024.</p></body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      await source.lookup(mockActor)

      // Should fetch the obituary URL, not the interview
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("obituary"),
        expect.any(Object)
      )
    })
  })
})
