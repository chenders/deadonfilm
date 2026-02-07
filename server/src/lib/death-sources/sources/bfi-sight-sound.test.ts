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

import { BFISightSoundSource } from "./bfi-sight-sound.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("BFISightSoundSource", () => {
  let source: BFISightSoundSource

  beforeEach(() => {
    source = new BFISightSoundSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("BFI Sight & Sound")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.BFI_SIGHT_SOUND)
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
      name: "Gene Hackman",
      birthday: "1930-01-30",
      deathday: "2025-02-26",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 15.5,
    }

    it("returns error when actor has no death date", async () => {
      const actorWithoutDeathday = {
        ...testActor,
        deathday: null,
      }

      const result = await source.lookup(actorWithoutDeathday)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death date")
    })

    it("returns early for deaths before 2015", async () => {
      const oldActor: ActorForEnrichment = {
        ...testActor,
        name: "Christopher Reeve",
        deathday: "2004-10-10",
      }

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("BFI memoriam lists not available before 2015")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns error when memoriam page is not found and alternate year also fails", async () => {
      // First call returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      // Alternate year also returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Actor not found")
    })

    it("throws SourceAccessBlockedError when receiving 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("returns error when HTTP error occurs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("HTTP 500")
    })

    it("returns error when actor not found in memoriam", async () => {
      // Main memoriam page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No matching entries</body></html>",
      })
      // Alternate year attempt
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No matching entries</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Actor not found")
    })

    it("extracts data when actor is found in memoriam", async () => {
      const memoriamHtml = `
        <html><body>
          <div>
            <p><strong>Gene Hackman</strong> (30 Jan 1930 – 26 Feb 2025):
            American film and stage actor known for his versatile performances.</p>
          </div>
        </body></html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => memoriamHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.BFI_SIGHT_SOUND)
      expect(result.source.confidence).toBeGreaterThan(0)
    })

    it("handles fetch errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })

    it("fetches individual obituary when URL is found", async () => {
      const memoriamHtml = `
        <html><body>
          <div>
            <a href="/features/gene-hackman-obituary">Gene Hackman</a> (30 Jan 1930 – 26 Feb 2025):
            Legendary actor passed away at his home.
          </div>
        </body></html>
      `

      const obituaryHtml = `
        <html><body>
          <article>
            <p>Gene Hackman died peacefully at his home in Santa Fe, New Mexico.
            The actor was known for his iconic roles in films like The French Connection.</p>
          </article>
        </body></html>
      `

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => memoriamHtml,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => obituaryHtml,
        })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Two fetches: memoriam page + individual obituary
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("tries alternate year when actor not found in primary year", async () => {
      // Primary year - no match
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No actors</body></html>",
      })

      // Alternate year - has match
      const alternateYearHtml = `
        <html><body>
          <p><strong>Gene Hackman</strong> (1930 – 2025): American actor.</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => alternateYearHtml,
      })

      const result = await source.lookup(testActor)

      // Should have tried alternate year
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.success).toBe(true)
    })
  })

  describe("name matching", () => {
    const testActor: ActorForEnrichment = {
      id: 1,
      tmdbId: 2,
      name: "Angela Lansbury",
      birthday: "1925-10-16",
      deathday: "2022-10-11",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10,
    }

    it("matches names with different formatting", async () => {
      const memoriamHtml = `
        <html><body>
          <div>
            <p><strong>Angela Lansbury</strong> (16 Oct 1925 – 11 Oct 2022):
            Beloved actress known for Murder, She Wrote.</p>
          </div>
        </body></html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => memoriamHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
    })

    it("matches by last name when full name differs slightly", async () => {
      const memoriamHtml = `
        <html><body>
          <div>
            <p><strong>Dame Angela Lansbury</strong> (1925 – 2022):
            Theatre legend.</p>
          </div>
        </body></html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => memoriamHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
    })
  })
})
