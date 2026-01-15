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

import { EuropeanaSource } from "./europeana.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("EuropeanaSource", () => {
  let source: EuropeanaSource

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("EUROPEANA_API_KEY", "test-api-key")
    source = new EuropeanaSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Europeana")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.EUROPEANA)
    })

    it("is marked as free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is available when API key is set", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("is not available without API key", () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new EuropeanaSource()
      expect(sourceWithoutKey.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Jean Gabin",
      birthday: "1904-05-17",
      deathday: "1976-11-15",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 18.0,
    }

    it("returns error when actor is not deceased", async () => {
      const livingActor = { ...testActor, deathday: null }
      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
    })

    it("returns error when API key is missing", async () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new EuropeanaSource()
      const result = await sourceWithoutKey.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("API key not configured")
    })

    it("returns error when search fails with HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Search failed")
    })

    it("returns error when no results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          itemsCount: 0,
          totalResults: 0,
          items: [],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No items found for this actor in Europeana")
    })

    it("extracts death info from archive item", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          itemsCount: 1,
          totalResults: 1,
          items: [
            {
              id: "/123/test",
              guid: "https://www.europeana.eu/item/123/test",
              title: ["Jean Gabin obituary - Le Monde"],
              dcDescription: [
                "Jean Gabin, le célèbre acteur français, est décédé le 15 novembre 1976 à Paris.",
                "Il a succombé à une leucémie.",
              ],
              dcDate: ["1976-11-16"],
              country: ["France"],
              provider: ["Bibliothèque nationale de France"],
              dataProvider: ["Le Monde Archives"],
              score: 85.5,
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.EUROPEANA)
      expect(result.data?.circumstances).toBeTruthy()
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })
  })
})
