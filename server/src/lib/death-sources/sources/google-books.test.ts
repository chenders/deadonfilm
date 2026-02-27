import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GoogleBooksDeathSource } from "./google-books.js"
import { DataSourceType } from "../types.js"

// Mock the shared API clients
vi.mock("../../shared/google-books-api.js", () => ({
  searchGoogleBooks: vi.fn(),
  extractVolumeText: vi.fn(),
  formatVolumeAttribution: vi.fn(),
}))

vi.mock("../../shared/sanitize-source-text.js", () => ({
  sanitizeSourceText: vi.fn((text: string) => text),
}))

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import {
  searchGoogleBooks,
  extractVolumeText,
  formatVolumeAttribution,
} from "../../shared/google-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

describe("GoogleBooksDeathSource", () => {
  let source: GoogleBooksDeathSource
  const originalEnv = process.env

  const mockActor = {
    id: 1,
    tmdbId: 4724,
    name: "John Wayne",
    birthday: "1907-05-26",
    deathday: "1979-06-11",
    causeOfDeath: null,
    causeOfDeathDetails: null,
    popularity: 25.0,
    imdb_person_id: "nm0000078",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      GOOGLE_BOOKS_API_KEY: "test-google-books-key",
    }
    source = new GoogleBooksDeathSource()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Google Books")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.GOOGLE_BOOKS)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })
  })

  describe("isAvailable", () => {
    it("returns true when API key is configured", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when API key is missing", () => {
      delete process.env.GOOGLE_BOOKS_API_KEY
      source = new GoogleBooksDeathSource()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    it("returns successful result with death-related book content", async () => {
      const mockVolume = {
        id: "vol1",
        volumeInfo: {
          title: "Hollywood Deaths",
          authors: ["Film Historian"],
          publishedDate: "2005",
        },
        searchInfo: { textSnippet: "John Wayne died of stomach cancer" },
        accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
      }

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 1,
        items: [mockVolume],
      })
      vi.mocked(extractVolumeText).mockReturnValue(
        "John Wayne died of stomach cancer in 1979 at age 72."
      )
      vi.mocked(formatVolumeAttribution).mockReturnValue(
        "Hollywood Deaths by Film Historian (2005)"
      )
      vi.mocked(sanitizeSourceText).mockReturnValue(
        "John Wayne died of stomach cancer in 1979 at age 72."
      )

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data?.circumstances).toContain("John Wayne died of stomach cancer")
      expect(result.data?.additionalContext).toContain("Hollywood Deaths by Film Historian")
      expect(result.source.type).toBe(DataSourceType.GOOGLE_BOOKS)
      expect(result.source.confidence).toBeGreaterThan(0)
    })

    it("returns unsuccessful result when no books found", async () => {
      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 0,
        items: [],
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
    })

    it("returns unsuccessful result when no volumes have text", async () => {
      const mockVolume = {
        id: "vol1",
        volumeInfo: { title: "Some Book" },
        accessInfo: { viewability: "NO_PAGES" as const, publicDomain: false },
      }

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 1,
        items: [mockVolume],
      })
      vi.mocked(extractVolumeText).mockReturnValue(null)

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
    })

    it("handles API errors gracefully", async () => {
      vi.mocked(searchGoogleBooks).mockRejectedValue(
        new Error("Google Books API error: 500 Internal Server Error")
      )

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Google Books API error")
    })

    it("returns zero confidence when text has no death keywords", async () => {
      const mockVolume = {
        id: "vol1",
        volumeInfo: { title: "John Wayne: A Life" },
        accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
      }

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 1,
        items: [mockVolume],
      })
      vi.mocked(extractVolumeText).mockReturnValue(
        "John Wayne starred in many westerns throughout his career."
      )
      vi.mocked(formatVolumeAttribution).mockReturnValue("John Wayne: A Life")
      vi.mocked(sanitizeSourceText).mockReturnValue(
        "John Wayne starred in many westerns throughout his career."
      )

      const result = await source.lookup(mockActor)

      // No death keywords → zero confidence → unsuccessful
      expect(result.success).toBe(false)
    })

    it("uses death year in search query", async () => {
      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 0,
        items: [],
      })

      await source.lookup(mockActor)

      expect(searchGoogleBooks).toHaveBeenCalledWith(
        expect.stringContaining("1979"),
        5,
        expect.any(AbortSignal)
      )
    })

    it("handles actor without deathday", async () => {
      const actorNoDeathday = { ...mockActor, deathday: null }

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 0,
        items: [],
      })

      await source.lookup(actorNoDeathday)

      // Should still call search but without year
      expect(searchGoogleBooks).toHaveBeenCalled()
    })
  })
})
