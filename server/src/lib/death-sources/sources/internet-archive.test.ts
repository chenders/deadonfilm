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

import { InternetArchiveSource } from "./internet-archive.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("InternetArchiveSource", () => {
  let source: InternetArchiveSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new InternetArchiveSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Internet Archive")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.INTERNET_ARCHIVE)
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
      name: "Bela Lugosi",
      birthday: "1882-10-20",
      deathday: "1956-08-16",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 22.0,
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

    it("returns error when no results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 0,
            start: 0,
            docs: [],
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No items found for this actor in Internet Archive")
    })

    it("extracts death info from archive document", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0, QTime: 100 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "bela-lugosi-biography-1960",
                title: "Bela Lugosi: The Man Behind the Cape",
                description:
                  "A biography of Bela Lugosi, covering his life and death in Hollywood. Lugosi died of a heart attack in Los Angeles in 1956.",
                creator: "Robert Cremer",
                date: "1960",
                year: 1960,
                mediatype: "texts",
                collection: ["americana"],
                subject: ["Bela Lugosi", "Hollywood", "actors", "death", "biography"],
                downloads: 500,
              },
            ],
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.INTERNET_ARCHIVE)
      expect(result.data?.circumstances).toBeTruthy()
    })

    it("extracts notable factors from document", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "test-doc",
                title: "Bela Lugosi",
                description:
                  "Bela Lugosi died of a heart attack. This biography covers his Hollywood career and sudden death.",
                mediatype: "texts",
                downloads: 100,
              },
            ],
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("heart condition")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })
  })
})
