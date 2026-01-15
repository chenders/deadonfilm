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

import { DoubanSource } from "./douban.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("DoubanSource", () => {
  let source: DoubanSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new DoubanSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Douban")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.DOUBAN)
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
      name: "Leslie Cheung",
      birthday: "1956-09-12",
      deathday: "2003-04-01",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 20.5,
    }

    it("returns error when actor is not deceased", async () => {
      const livingActor = { ...testActor, deathday: null }
      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
    })

    it("tries Wikidata first for Douban ID", async () => {
      // Mock Wikidata query returning no results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: { bindings: [] } }),
      })

      // Mock Douban search returning no results
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][0]).toContain("query.wikidata.org")
    })

    it("throws SourceAccessBlockedError on 403", async () => {
      // Mock Wikidata returning Douban ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: { bindings: [{ doubanId: { value: "1234" } }] },
        }),
      })

      // Mock Douban returning 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 418 (anti-scraping)", async () => {
      // Mock Wikidata returning Douban ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: { bindings: [{ doubanId: { value: "1234" } }] },
        }),
      })

      // Mock Douban returning 418 (I'm a teapot - anti-scraping)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 418,
        statusText: "I'm a teapot",
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("extracts death info from celebrity page", async () => {
      // Mock Wikidata returning Douban ID
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: { bindings: [{ doubanId: { value: "1234" } }] },
        }),
      })

      // Mock celebrity page with death info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <div class="intro">
                Leslie Cheung 1956年9月12日出生。
                他于2003年4月1日在香港去世。
                死因是自杀。
              </div>
            </body>
          </html>
        `,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.DOUBAN)
      expect(result.data?.circumstances).toBeTruthy()
    })

    it("handles network errors gracefully", async () => {
      // Mock Wikidata returning no results (will fall back to search)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: { bindings: [] } }),
      })

      // Mock Douban search failing with network error
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor not found on Douban")
    })
  })
})
