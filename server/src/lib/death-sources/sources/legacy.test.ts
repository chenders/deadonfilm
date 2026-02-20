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

import { LegacySource } from "./legacy.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("LegacySource", () => {
  let source: LegacySource

  beforeEach(() => {
    source = new LegacySource()
    mockFetch.mockReset()
    mockFetchFromArchive.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Legacy.com")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.LEGACY)
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
      id: 123,
      tmdbId: 456,
      name: "Betty White",
      birthday: "1922-01-17",
      deathday: "2021-12-31",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 25.0,
    }

    it("returns early for living actors", async () => {
      const livingActor: ActorForEnrichment = {
        ...testActor,
        deathday: null,
      }

      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No death date provided")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns error for single-name actors", async () => {
      const singleNameActor: ActorForEnrichment = {
        ...testActor,
        name: "Cher",
      }

      const result = await source.lookup(singleNameActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Cannot search with single name")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("finds obituary via DuckDuckGo search and extracts death info", async () => {
      // DuckDuckGo search returns Legacy.com URL
      const searchHtml = `
        <html><body>
          <a href="https://www.legacy.com/us/obituaries/latimes/name/betty-white-obituary?id=32067890">
            Betty White Obituary
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Obituary page with death info
      const obituaryHtml = `
        <html>
          <body>
            <article>
              <p>Betty White, the beloved actress and comedian, died on December 31, 2021
              at her home in Los Angeles. She was 99 years old.</p>
              <p>White died of natural causes, just weeks before her 100th birthday.</p>
            </article>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => obituaryHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.LEGACY)
      expect(result.data?.circumstances).toContain("died")
    })

    it("returns error when no obituary found in search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Legacy.com obituary found")
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

    it("throws SourceAccessBlockedError on 403 during obituary fetch", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.legacy.com/us/obituaries/latimes/name/betty-white-obituary?id=32067890">
            Obituary
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Obituary page returns 403
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

    it("tries archive.org fallback when obituary returns 403", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.legacy.com/us/obituaries/latimes/name/betty-white-obituary?id=32067890">
            Obituary
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Obituary page returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      // Archive fallback returns content
      mockFetchFromArchive.mockResolvedValueOnce({
        success: true,
        content: `
          <html><body>
            <p>Betty White died on December 31, 2021 at her home in Los Angeles.</p>
          </body></html>
        `,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(mockFetchFromArchive).toHaveBeenCalled()
      expect(result.data?.circumstances).toContain("died")
    })

    it("returns error when obituary has no death info", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.legacy.com/us/obituaries/latimes/name/betty-white-obituary?id=32067890">
            Obituary
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const obituaryHtml = `
        <html>
          <body>
            <p>Betty White was a celebrated actress known for her roles in The Golden Girls.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => obituaryHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death details")
    })

    it("extracts location of death", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.legacy.com/us/obituaries/latimes/name/betty-white-obituary?id=32067890">
            Obituary
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const obituaryHtml = `
        <html>
          <body>
            <p>White died in Los Angeles from natural causes.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => obituaryHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
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

    it("returns error when obituary fetch fails with non-403 status", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.legacy.com/us/obituaries/latimes/name/betty-white-obituary?id=32067890">
            Obituary
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Obituary returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Could not fetch Legacy.com obituary")
    })

    it("includes additionalContext from Legacy.com", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.legacy.com/us/obituaries/latimes/name/betty-white-obituary?id=32067890">
            Obituary
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const obituaryHtml = `
        <html>
          <body>
            <p>White died in Los Angeles from natural causes on December 31.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => obituaryHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.additionalContext).toContain("Legacy.com")
    })
  })
})
