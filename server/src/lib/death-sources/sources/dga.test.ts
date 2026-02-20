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

import { DGASource } from "./dga.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("DGASource", () => {
  let source: DGASource

  beforeEach(() => {
    source = new DGASource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("DGA Deceased Members")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.DGA)
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
      id: 555,
      tmdbId: 777,
      name: "John Frankenheimer",
      birthday: "1930-02-19",
      deathday: "2002-07-06",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 8.0,
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

    it("finds DGA page and extracts death info", async () => {
      // DuckDuckGo search returns DGA URL
      const searchHtml = `
        <html><body>
          <a href="https://www.dga.org/members/deceased/john-frankenheimer">
            John Frankenheimer - Deceased Members
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // DGA page with death info
      const pageHtml = `
        <html><body>
          <article>
            <p>John Frankenheimer died on July 6, 2002 in Los Angeles following
            complications from spinal surgery. He was a pioneering director known
            for The Manchurian Candidate and other acclaimed political thrillers.</p>
          </article>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => pageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.DGA)
      expect(result.source.confidence).toBeGreaterThanOrEqual(0.3)
      expect(result.source.confidence).toBeLessThanOrEqual(0.6)
      expect(result.data?.circumstances).toContain("died")
      expect(result.data?.additionalContext).toBe("Source: Directors Guild of America")
    })

    it("returns error when not found in search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Not found in DGA")
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

    it("throws SourceAccessBlockedError on 403 during page fetch", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.dga.org/members/deceased/john-frankenheimer">
            John Frankenheimer
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Page returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })

    it("returns error when page has no death info", async () => {
      // Search returns URL
      const searchHtml = `
        <html><body>
          <a href="https://www.dga.org/members/john-frankenheimer">John Frankenheimer</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Page with no death sentences
      const pageHtml = `
        <html><body>
          <p>John Frankenheimer was a renowned film and television director.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => pageHtml,
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

    it("returns error when page fetch fails with non-403 status", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.dga.org/members/deceased/john-frankenheimer">
            John Frankenheimer
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Could not fetch DGA page")
    })

    it("extracts location of death when present", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://dga.org/members/deceased/john-frankenheimer-obituary">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const pageHtml = `
        <html><body>
          <p>Frankenheimer died in Los Angeles from complications following surgery.
          He was 72 years old.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => pageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("caps confidence at 0.6", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.dga.org/members/deceased/john-frankenheimer-obituary">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Long text with location to max out confidence bonuses
      const pageHtml = `
        <html><body>
          <p>Frankenheimer died in Los Angeles from complications following surgery.
          ${"He was a pioneering director who changed the thriller genre forever. ".repeat(10)}
          The director passed away peacefully surrounded by his family.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => pageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.confidence).toBeLessThanOrEqual(0.6)
    })
  })
})
