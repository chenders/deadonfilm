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

import { AlloCineSource } from "./allocine.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("AlloCineSource", () => {
  let source: AlloCineSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new AlloCineSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("AlloCiné")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.ALLOCINE)
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
      name: "Jean-Paul Belmondo",
      birthday: "1933-04-09",
      deathday: "2021-09-06",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 15.5,
    }

    it("returns error when actor is not deceased", async () => {
      const livingActor = { ...testActor, deathday: null }
      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
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

    it("throws SourceAccessBlockedError on 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("returns error when actor not found in search results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor not found in AlloCiné search results")
    })

    it("extracts death info from actor page", async () => {
      // Mock search results with actor link
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="/personne/fichepersonne_gen_cpersonne=1234.html">Jean-Paul Belmondo</a>
            </body>
          </html>
        `,
      })

      // Mock actor page with death info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
            <body>
              <div class="bio">
                Jean-Paul Belmondo est né en 1933.
                Il est décédé le 6 septembre 2021 à Paris.
                L'acteur est mort de causes naturelles.
              </div>
            </body>
          </html>
        `,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.ALLOCINE)
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
