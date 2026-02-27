import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the shared API clients
vi.mock("../../shared/ia-books-api.js", () => ({
  searchIABooks: vi.fn(),
  searchInsideIA: vi.fn(),
  getPageOCR: vi.fn(),
}))

vi.mock("../../shared/sanitize-source-text.js", () => ({
  sanitizeSourceText: vi.fn((text: string) => text),
}))

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { IABooksBiographySource } from "./ia-books.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"
import { searchIABooks, searchInsideIA, getPageOCR } from "../../shared/ia-books-api.js"
import { sanitizeSourceText } from "../../shared/sanitize-source-text.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 1,
  tmdb_id: 4724,
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  imdb_person_id: "nm0000078",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Winterset, Iowa, USA",
}

const richBiographicalText = `Marion Robert Morrison was born on May 26, 1907, in Winterset, Iowa. His family moved to California when he was a child, and he grew up in Glendale. His childhood was spent exploring the outdoors with his parents. He attended Glendale High School where he excelled in football, earning a scholarship to USC. His education at the university was cut short by a bodysurfing injury.`

// ============================================================================
// Tests
// ============================================================================

describe("IABooksBiographySource", () => {
  let source: IABooksBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new IABooksBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("IA Books")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.IA_BOOKS_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has ARCHIVAL reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.ARCHIVAL)
    })

    it("has 0.9 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.9)
    })
  })

  describe("isAvailable", () => {
    it("returns true always (no API key required)", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    it("succeeds when IA books with biographical content are found", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "johnwaynebiography",
          title: "John Wayne: American",
          creator: "Randy Roberts",
          date: "1995",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([{ text: richBiographicalText, pageNum: 15 }])

      vi.mocked(getPageOCR).mockResolvedValue(richBiographicalText)
      vi.mocked(sanitizeSourceText).mockReturnValue(
        richBiographicalText + "\n\n" + richBiographicalText
      )

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("IA Books")
      expect(result.data!.sourceType).toBe(BiographySourceType.IA_BOOKS_BIO)
      expect(result.data!.contentType).toBe("book_excerpt")
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.data!.reliabilityTier).toBe(ReliabilityTier.ARCHIVAL)
      expect(result.data!.reliabilityScore).toBe(0.9)
    })

    it("returns failure when no books found on IA", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([])

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toContain("No books found on Internet Archive")
    })

    it("returns failure when no biographical passages found inside books", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "somebook",
          title: "Some Book",
          mediatype: "texts",
        },
      ])

      // All search-inside queries return empty
      vi.mocked(searchInsideIA).mockResolvedValue([])

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No biographical passages")
    })

    it("returns failure when content is too short", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "briefbook",
          title: "Brief Book",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([
        { text: "Wayne grew up in California with his family.", pageNum: 5 },
      ])

      vi.mocked(getPageOCR).mockResolvedValue(null)
      vi.mocked(sanitizeSourceText).mockReturnValue("Wayne grew up in California with his family.")

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("too short")
    })

    it("handles API errors gracefully", async () => {
      vi.mocked(searchIABooks).mockRejectedValue(
        new Error("Internet Archive search error: 500 Internal Server Error")
      )

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Internet Archive search error")
    })

    it("continues when individual search-inside calls fail", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "book1",
          title: "Book One",
          mediatype: "texts",
        },
      ])

      // First keyword fails, subsequent succeed
      vi.mocked(searchInsideIA)
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce([{ text: richBiographicalText, pageNum: 10 }])
        .mockResolvedValue([])

      vi.mocked(getPageOCR).mockResolvedValue(null)
      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalText)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
    })

    it("continues when OCR page retrieval fails", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "book1",
          title: "Book One",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([{ text: richBiographicalText, pageNum: 10 }])

      // OCR fails but search-inside text is still usable
      vi.mocked(getPageOCR).mockRejectedValue(new Error("OCR not available"))
      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalText)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
    })

    it("skips very short search-inside hits", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "book1",
          title: "Book One",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([
        { text: "short", pageNum: 1 }, // Too short (< 20 chars), should be skipped
        { text: richBiographicalText, pageNum: 10 },
      ])

      vi.mocked(getPageOCR).mockResolvedValue(null)
      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalText)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
    })

    it("searches multiple books up to the limit", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        { identifier: "book1", title: "Book 1", mediatype: "texts" },
        { identifier: "book2", title: "Book 2", mediatype: "texts" },
        { identifier: "book3", title: "Book 3", mediatype: "texts" },
        { identifier: "book4", title: "Book 4", mediatype: "texts" },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([])

      await source.lookup(testActor)

      // Should search at most 3 books * 4 keywords = 12 calls
      const calledIdentifiers = vi.mocked(searchInsideIA).mock.calls.map((call) => call[0])
      const uniqueBooks = new Set(calledIdentifiers)
      expect(uniqueBooks.size).toBeLessThanOrEqual(3)
      expect(uniqueBooks.has("book4")).toBe(false)
    })

    it("returns failure when text has no biographical keywords", async () => {
      const careerOnlyText =
        "John Wayne appeared in over 170 films and won an Academy Award for his role in True Grit. He was one of the most popular film stars of the twentieth century and starred in westerns and war films."

      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "careerbook",
          title: "Western Stars",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([{ text: careerOnlyText, pageNum: 5 }])

      vi.mocked(getPageOCR).mockResolvedValue(null)
      vi.mocked(sanitizeSourceText).mockReturnValue(careerOnlyText)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No biographical keywords")
    })

    it("sets correct source metadata on success", async () => {
      vi.mocked(searchIABooks).mockResolvedValue([
        {
          identifier: "biographybook",
          title: "Biography Book",
          mediatype: "texts",
        },
      ])

      vi.mocked(searchInsideIA).mockResolvedValue([{ text: richBiographicalText, pageNum: 10 }])

      vi.mocked(getPageOCR).mockResolvedValue(null)
      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalText)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(BiographySourceType.IA_BOOKS_BIO)
      expect(result.source.contentType).toBe("book_excerpt")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.ARCHIVAL)
      expect(result.source.reliabilityScore).toBe(0.9)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
