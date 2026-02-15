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

import { WGASource } from "./wga.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("WGASource", () => {
  let source: WGASource

  beforeEach(() => {
    source = new WGASource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("WGA In Memoriam")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.WGA)
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
      id: 789,
      tmdbId: 101,
      name: "Nora Ephron",
      birthday: "1941-05-19",
      deathday: "2012-06-26",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 12.0,
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

    it("finds WGA page and extracts death info", async () => {
      // DuckDuckGo search returns WGA URL
      const searchHtml = `
        <html><body>
          <a href="https://www.wga.org/members/in-memoriam/nora-ephron">Nora Ephron In Memoriam</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // WGA page with death info
      const pageHtml = `
        <html><body>
          <article>
            <p>Nora Ephron died on June 26, 2012 in New York City from complications
            of acute myeloid leukemia. She was an acclaimed screenwriter and director,
            known for When Harry Met Sally and Sleepless in Seattle.</p>
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
      expect(result.source.type).toBe(DataSourceType.WGA)
      expect(result.source.confidence).toBeGreaterThanOrEqual(0.3)
      expect(result.source.confidence).toBeLessThanOrEqual(0.6)
      expect(result.data?.circumstances).toContain("died")
      expect(result.data?.additionalContext).toBe("Source: Writers Guild of America In Memoriam")
    })

    it("returns error when not found in search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Not found in WGA")
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
          <a href="https://www.wga.org/members/in-memoriam/nora-ephron">Nora Ephron</a>
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
          <a href="https://www.wga.org/members/nora-ephron">Nora Ephron</a>
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
          <p>Nora Ephron was an acclaimed screenwriter and filmmaker who won numerous awards.</p>
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
          <a href="https://www.wga.org/members/in-memoriam/nora-ephron">Nora Ephron</a>
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
      expect(result.error).toBe("Could not fetch WGA page")
    })

    it("extracts location of death when present", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://wga.org/in-memoriam/nora-ephron-obituary">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const pageHtml = `
        <html><body>
          <p>Ephron died in New York City from leukemia. She was 71 years old.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => pageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("New York City")
    })

    it("caps confidence at 0.6", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.wga.org/in-memoriam/nora-ephron-obituary">Obituary</a>
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
          <p>Ephron died in New York City from leukemia.
          ${"She was an acclaimed writer and director who changed Hollywood. ".repeat(10)}
          The star passed away peacefully surrounded by her family.</p>
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
