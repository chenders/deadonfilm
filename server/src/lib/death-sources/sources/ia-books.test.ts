import { describe, it, expect, vi, beforeEach } from "vitest"
import { IABooksDeathSource } from "./ia-books.js"
import { DataSourceType } from "../types.js"

// Mock the shared API clients
vi.mock("../../shared/ia-books-api.js", () => ({
  searchIABooks: vi.fn(),
  searchInsideIA: vi.fn(),
  getPageOCR: vi.fn(),
}))

vi.mock("../../shared/sanitize-source-text.js", () => ({
  sanitizeSourceText: vi.fn((text: string) => text),
}))

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { searchIABooks, searchInsideIA, getPageOCR } from "../../shared/ia-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

describe("IABooksDeathSource", () => {
  let source: IABooksDeathSource

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
    source = new IABooksDeathSource()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Internet Archive Books")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.IA_BOOKS)
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
    it("returns successful result with OCR page text", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "hollywooddeaths00hist",
          title: "Hollywood Deaths and Tragedies",
          creator: "Film Historian",
          date: "2001",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([
        {
          text: "Wayne succumbed to stomach cancer",
          pageNum: 156,
        },
      ])

      vi.mocked(getPageOCR).mockResolvedValue(
        "John Wayne died of stomach cancer at UCLA Medical Center on June 11, 1979. He was 72 years old."
      )

      vi.mocked(sanitizeSourceText).mockReturnValue(
        "John Wayne died of stomach cancer at UCLA Medical Center on June 11, 1979. He was 72 years old."
      )

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data?.circumstances).toContain("stomach cancer")
      expect(result.source.type).toBe(DataSourceType.IA_BOOKS)
      expect(result.source.confidence).toBeGreaterThan(0)
    })

    it("returns unsuccessful result when no books found", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([])

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toBeDefined()
    })

    it("returns unsuccessful result when search-inside finds no matches", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "someBook00auth",
          title: "Some Book",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([])

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
    })

    it("handles API errors gracefully", async () => {
      vi.mocked(searchIABooks).mockRejectedValue(
        new Error("Internet Archive search error: 500 Internal Server Error")
      )

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Internet Archive search error")
    })

    it("falls back to search-inside text when OCR is unavailable", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "book00auth",
          title: "Death in Hollywood",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([
        {
          text: "Wayne died of cancer at age 72",
          pageNum: 42,
        },
      ])

      // OCR returns null (page not found)
      vi.mocked(getPageOCR).mockResolvedValue(null)

      vi.mocked(sanitizeSourceText).mockReturnValue("Wayne died of cancer at age 72")

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("died of cancer")
    })

    it("handles OCR errors gracefully and falls back to search-inside text", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "book00auth",
          title: "Film Stars",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([
        {
          text: "He passed away from illness",
          pageNum: 99,
        },
      ])

      vi.mocked(getPageOCR).mockRejectedValue(new Error("OCR unavailable"))

      vi.mocked(sanitizeSourceText).mockReturnValue("He passed away from illness")

      const result = await source.lookup(mockActor)

      // Should still succeed using the search-inside text
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("passed away")
    })

    it("returns zero confidence when text has no death keywords", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "westerns00auth",
          title: "Western Movies",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([
        {
          text: "Wayne appeared in many classic westerns",
          pageNum: 10,
        },
      ])

      vi.mocked(getPageOCR).mockResolvedValue(
        "John Wayne starred in numerous western films during his career."
      )

      vi.mocked(sanitizeSourceText).mockReturnValue(
        "John Wayne starred in numerous western films during his career."
      )

      const result = await source.lookup(mockActor)

      // No death keywords → zero confidence → unsuccessful
      expect(result.success).toBe(false)
    })

    it("handles search-inside errors and continues to next book", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "book1",
          title: "Book One",
          mediatype: "texts",
        },
        {
          identifier: "book2",
          title: "Book Two",
          mediatype: "texts",
        },
      ])

      // First book: search-inside fails
      vi.mocked(searchInsideIA)
        .mockRejectedValueOnce(new Error("timeout"))
        .mockResolvedValueOnce([
          {
            text: "He died suddenly in 1979",
            pageNum: 50,
          },
        ])

      vi.mocked(getPageOCR).mockResolvedValue("John Wayne died suddenly in 1979 of stomach cancer.")

      vi.mocked(sanitizeSourceText).mockReturnValue(
        "John Wayne died suddenly in 1979 of stomach cancer."
      )

      const result = await source.lookup(mockActor)

      // Should succeed from the second book
      expect(result.success).toBe(true)
      expect(searchInsideIA).toHaveBeenCalledTimes(2)
    })
  })
})
