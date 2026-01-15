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

import { ChroniclingAmericaSource } from "./chronicling-america.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("ChroniclingAmericaSource", () => {
  let source: ChroniclingAmericaSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new ChroniclingAmericaSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Chronicling America")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.CHRONICLING_AMERICA)
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
      name: "Rudolph Valentino",
      birthday: "1895-05-06",
      deathday: "1926-08-23",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 15.0,
    }

    it("returns error when actor is not deceased", async () => {
      const livingActor = { ...testActor, deathday: null }
      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
    })

    it("returns error when death year is outside coverage", async () => {
      const modernActor = { ...testActor, deathday: "2020-01-01" }
      const result = await source.lookup(modernActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("outside Chronicling America coverage")
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
          results: [],
          pagination: { total: 0 },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No newspaper articles found for this actor in Chronicling America")
    })

    it("extracts death info from newspaper result", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "test-123",
              title: "Rudolph Valentino Dies in New York Hospital",
              date: "1926-08-24",
              url: "https://chroniclingamerica.loc.gov/lccn/test",
              description: [
                "Rudolph Valentino, the famous film star, died yesterday at Polyclinic Hospital.",
                "The actor succumbed to complications from a perforated ulcer.",
              ],
              contributor: ["The New York Times"],
              location: ["New York"],
            },
          ],
          pagination: { total: 1 },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.CHRONICLING_AMERICA)
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
