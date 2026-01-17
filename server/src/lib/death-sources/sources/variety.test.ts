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

import { VarietySource } from "./variety.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("VarietySource", () => {
  let source: VarietySource

  beforeEach(() => {
    source = new VarietySource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Variety")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.VARIETY)
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
      name: "Matthew Perry",
      birthday: "1969-08-19",
      deathday: "2023-10-28",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 30.0,
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

    it("finds obituary and extracts death information", async () => {
      // Search returns Variety URL
      const searchHtml = `
        <html><body>
          <a href="https://variety.com/2023/tv/news/matthew-perry-obituary-dead-dies-friends-1235782234/">
            Matthew Perry Dead: 'Friends' Star Was 54
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
              <p>Matthew Perry, the Emmy-nominated actor who starred as Chandler Bing on
              the beloved NBC sitcom "Friends," died on October 28 at his home in Los Angeles.
              He was 54.</p>
              <p>Perry was found unresponsive in a jacuzzi at his Pacific Palisades home.
              His death was attributed to the acute effects of ketamine.</p>
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
      expect(result.source.type).toBe(DataSourceType.VARIETY)
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
      expect(result.error).toContain("No Variety obituary found")
    })

    it("throws SourceAccessBlockedError on 403 during search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 403 during article fetch", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://variety.com/2023/tv/news/matthew-perry-dead/">Article</a>
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

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("returns error when article has no death info", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://variety.com/2023/tv/news/matthew-perry-interview/">Article</a>
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
            <p>Matthew Perry talks about his upcoming book and reflects on his time on Friends.</p>
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

    it("extracts location of death", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://variety.com/2023/tv/news/actor-dies/">Obituary</a>
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
            <p>Perry died in Los Angeles from cardiac arrest.</p>
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
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("extracts notable factors", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://variety.com/2023/tv/news/actor-dies/">Obituary</a>
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
            <p>Perry died suddenly at his home. An autopsy was performed and a
            coroner investigation is underway. His death was unexpected and came
            as a tragedy to the entertainment community.</p>
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
      expect(result.data?.notableFactors).toContain("autopsy")
      expect(result.data?.notableFactors).toContain("sudden")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
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

    it("returns error when article fetch fails with non-403 status", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://variety.com/2023/tv/news/matthew-perry-dead/">Article</a>
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
      expect(result.error).toBe("Could not fetch Variety article")
    })

    it("prefers obituary URLs over other article types", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://variety.com/2023/tv/news/matthew-perry-interview/">Interview</a>
          <a href="https://variety.com/2023/tv/news/matthew-perry-obituary-dead/">Obituary</a>
          <a href="https://variety.com/2023/tv/news/matthew-perry-review/">Review</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html><body><p>Perry died on October 28.</p></body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      await source.lookup(testActor)

      // Should fetch the obituary URL, not the interview
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("obituary"),
        expect.any(Object)
      )
    })
  })
})
