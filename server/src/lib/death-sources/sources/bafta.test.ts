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

import { BAFTASource } from "./bafta.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("BAFTASource", () => {
  let source: BAFTASource

  beforeEach(() => {
    source = new BAFTASource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("BAFTA")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.BAFTA)
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
      name: "Alan Rickman",
      birthday: "1946-02-21",
      deathday: "2016-01-14",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 20.0,
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

    it("finds BAFTA page and extracts death info", async () => {
      // DuckDuckGo search returns BAFTA URL
      const searchHtml = `
        <html><body>
          <a href="https://www.bafta.org/tribute/alan-rickman">Alan Rickman Tribute</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // BAFTA page with death info
      const pageHtml = `
        <html><body>
          <article>
            <p>Alan Rickman died on 14 January 2016 in London from pancreatic cancer.
            He was one of the most celebrated British actors of his generation,
            known for his distinctive voice and commanding screen presence.</p>
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
      expect(result.source.type).toBe(DataSourceType.BAFTA)
      expect(result.source.confidence).toBeGreaterThanOrEqual(0.3)
      expect(result.source.confidence).toBeLessThanOrEqual(0.6)
      expect(result.data?.circumstances).toContain("died")
      expect(result.data?.additionalContext).toBe(
        "Source: BAFTA (British Academy of Film and Television Arts)"
      )
    })

    it("returns error when not found in search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Not found in BAFTA")
    })

    it("throws SourceAccessBlockedError on 403 during search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 403 during page fetch", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.bafta.org/tribute/alan-rickman">Alan Rickman</a>
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
      expect(result.error).toBe("Network error")
    })

    it("returns error when page has no death info", async () => {
      // Search returns URL
      const searchHtml = `
        <html><body>
          <a href="https://www.bafta.org/member/alan-rickman">Alan Rickman</a>
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
          <p>Alan Rickman was a BAFTA-winning actor known for his many acclaimed performances.</p>
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
      expect(result.error).toBe("Search failed: HTTP 500")
    })

    it("returns error when page fetch fails with non-403 status", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.bafta.org/tribute/alan-rickman">Alan Rickman</a>
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
      expect(result.error).toBe("Could not fetch BAFTA page")
    })

    it("extracts location of death when present", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://bafta.org/tribute/alan-rickman-obituary">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const pageHtml = `
        <html><body>
          <p>Rickman died in London from pancreatic cancer. He was 69 years old.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => pageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("London")
    })

    it("caps confidence at 0.6", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.bafta.org/tribute/alan-rickman-obituary">Obituary</a>
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
          <p>Rickman died in London from pancreatic cancer.
          ${"He was a beloved actor who starred in many films. ".repeat(10)}
          The star passed away peacefully surrounded by his family and friends.</p>
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
