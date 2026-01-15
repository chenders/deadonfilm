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

import { TroveSource } from "./trove.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("TroveSource", () => {
  let source: TroveSource

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("TROVE_API_KEY", "test-api-key")
    source = new TroveSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Trove")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.TROVE)
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
      const sourceWithoutKey = new TroveSource()
      expect(sourceWithoutKey.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Errol Flynn",
      birthday: "1909-06-20",
      deathday: "1959-10-14",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 20.0,
    }

    it("returns error when actor is not deceased", async () => {
      const livingActor = { ...testActor, deathday: null }
      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
    })

    it("returns error when API key is missing", async () => {
      vi.unstubAllEnvs()
      const sourceWithoutKey = new TroveSource()
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
          category: [
            {
              name: "newspaper",
              records: {
                total: 0,
                article: [],
              },
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No newspaper articles found for this actor in Trove")
    })

    it("extracts death info from newspaper article", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          category: [
            {
              name: "newspaper",
              records: {
                total: 1,
                article: [
                  {
                    id: "12345",
                    url: "https://trove.nla.gov.au/newspaper/article/12345",
                    heading: "Errol Flynn Dies in Vancouver",
                    title: {
                      id: "111",
                      value: "The Sydney Morning Herald",
                    },
                    date: "1959-10-15",
                    snippet:
                      "Errol Flynn, the Hollywood film star, died suddenly in Vancouver yesterday. The actor suffered a heart attack.",
                    troveUrl: "https://trove.nla.gov.au/newspaper/article/12345",
                    relevance: { score: 95 },
                  },
                ],
              },
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.TROVE)
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
