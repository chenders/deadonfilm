import { describe, it, expect, vi, beforeEach } from "vitest"
import { OpenLibraryDeathSource } from "./open-library.js"
import { DataSourceType } from "../types.js"

// Mock the shared API clients
vi.mock("../../shared/open-library-api.js", () => ({
  searchOpenLibraryByPerson: vi.fn(),
  searchInsideBook: vi.fn(),
}))

vi.mock("../../shared/sanitize-source-text.js", () => ({
  sanitizeSourceText: vi.fn((text: string) => text),
}))

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { searchOpenLibraryByPerson, searchInsideBook } from "../../shared/open-library-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

describe("OpenLibraryDeathSource", () => {
  let source: OpenLibraryDeathSource

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
    source = new OpenLibraryDeathSource()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Open Library")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.OPEN_LIBRARY)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })
  })

  describe("isAvailable", () => {
    it("returns true (no API key needed)", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    it("returns successful result with search-inside highlights", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "John Wayne",
        subject_count: 5,
        works: [
          {
            key: "/works/OL123W",
            title: "John Wayne: The Life and Legend",
            authors: [{ name: "Scott Eyman" }],
            has_fulltext: true,
            ia: ["johnwaynetheli00eyman"],
            first_publish_year: 2014,
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([
        {
          pageNum: 342,
          highlight: "Wayne died of stomach cancer at UCLA Medical Center on June 11, 1979",
        },
      ])

      vi.mocked(sanitizeSourceText).mockReturnValue(
        "Wayne died of stomach cancer at UCLA Medical Center on June 11, 1979"
      )

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data?.circumstances).toContain("stomach cancer")
      expect(result.source.confidence).toBeGreaterThan(0)
    })

    it("returns unsuccessful result when no works found", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "",
        subject_count: 0,
        works: [],
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
    })

    it("returns low-confidence result with metadata only when no fulltext available", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "John Wayne",
        subject_count: 2,
        works: [
          {
            key: "/works/OL456W",
            title: "John Wayne: A Biography",
            authors: [{ name: "Author Name" }],
            has_fulltext: false,
          },
        ],
      })

      const result = await source.lookup(mockActor)

      // No fulltext works → low confidence metadata-only or unsuccessful
      // The implementation should handle this gracefully
      expect(result.error).toBeDefined()
    })

    it("returns unsuccessful result when search-inside finds no death content", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "John Wayne",
        subject_count: 1,
        works: [
          {
            key: "/works/OL789W",
            title: "Western Movies",
            authors: [{ name: "Film Author" }],
            has_fulltext: true,
            ia: ["westernmovies00film"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([])

      const result = await source.lookup(mockActor)

      // No highlights found → unsuccessful
      expect(result.success).toBe(false)
    })

    it("handles API errors gracefully", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockRejectedValue(
        new Error("Open Library API error: 500 Internal Server Error")
      )

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Open Library API error")
    })

    it("handles search-inside errors gracefully and continues", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "John Wayne",
        subject_count: 1,
        works: [
          {
            key: "/works/OL111W",
            title: "Book One",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            ia: ["bookone00auth"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockRejectedValue(new Error("Search inside timeout"))

      const result = await source.lookup(mockActor)

      // Should not throw — returns unsuccessful gracefully
      expect(result.success).toBe(false)
    })

    it("skips works without ia identifiers", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "John Wayne",
        subject_count: 2,
        works: [
          {
            key: "/works/OL222W",
            title: "No IA Book",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            // No ia field
          },
          {
            key: "/works/OL333W",
            title: "Has IA Book",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            ia: ["hasiabook00auth"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([
        {
          pageNum: 100,
          highlight: "He died of cancer in 1979",
        },
      ])

      vi.mocked(sanitizeSourceText).mockReturnValue("He died of cancer in 1979")

      const result = await source.lookup(mockActor)

      // Should only call searchInsideBook for the work with ia identifier
      expect(searchInsideBook).toHaveBeenCalledTimes(1)
      expect(searchInsideBook).toHaveBeenCalledWith(
        "hasiabook00auth",
        expect.any(String),
        expect.any(AbortSignal)
      )
      expect(result.success).toBe(true)
    })
  })
})
