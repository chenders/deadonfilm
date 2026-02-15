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

import { TMZSource } from "./tmz.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("TMZSource", () => {
  let source: TMZSource

  beforeEach(() => {
    source = new TMZSource()
    mockFetch.mockReset()
    mockFetchFromArchive.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("TMZ")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.TMZ)
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
      id: 301,
      tmdbId: 62891,
      name: "Lance Reddick",
      birthday: "1962-12-31",
      deathday: "2023-03-17",
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
      expect(result.error).toBe("Actor is not deceased")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns early for deaths before 2005", async () => {
      const oldActor: ActorForEnrichment = {
        ...testActor,
        name: "Marlon Brando",
        deathday: "2004-07-01",
      }

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("TMZ was not founded until 2005")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("finds obituary and extracts death information", async () => {
      // Search returns TMZ URL
      const searchHtml = `
        <html><body>
          <a href="https://www.tmz.com/2023/03/17/lance-reddick-dead-the-wire-john-wick/">
            Lance Reddick Dead at 60
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
              <p>Lance Reddick, the imposing character actor who starred in "The Wire"
              and the "John Wick" franchise, died Friday morning at his home in
              Studio City, California. He was 60.</p>
              <p>Reddick died of natural causes, according to his publicist.</p>
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
      expect(result.source.type).toBe(DataSourceType.TMZ)
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
      expect(result.error).toContain("No TMZ article found")
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
          <a href="https://www.tmz.com/2023/03/17/lance-reddick-dead/">Article</a>
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
          <a href="https://www.tmz.com/2023/03/17/lance-reddick-dead/">Article</a>
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
            <p>Lance Reddick died on March 17 at his home. He was 60.</p>
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
          <a href="https://www.tmz.com/2023/03/17/lance-reddick-interview/">Article</a>
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
            <p>Lance Reddick talks about his upcoming projects and his love of music.</p>
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
          <a href="https://www.tmz.com/2023/03/17/lance-reddick-dead/">Article</a>
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
      expect(result.error).toBe("Could not fetch TMZ article")
    })
  })
})
