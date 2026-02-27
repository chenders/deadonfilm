import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the shared API clients
vi.mock("../../shared/open-library-api.js", () => ({
  searchOpenLibraryByPerson: vi.fn(),
  searchInsideBook: vi.fn(),
}))

vi.mock("../../shared/sanitize-source-text.js", () => ({
  sanitizeSourceText: vi.fn((text: string) => text),
}))

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { OpenLibraryBiographySource } from "./open-library.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"
import { searchOpenLibraryByPerson, searchInsideBook } from "../../shared/open-library-api.js"
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

const richBiographicalHighlight = `Marion Morrison grew up in a modest family in Glendale, California. His parents moved from Iowa when he was young. His childhood was shaped by the California landscape. He attended school at Glendale High where he played football and earned a scholarship to USC.`

// ============================================================================
// Tests
// ============================================================================

describe("OpenLibraryBiographySource", () => {
  let source: OpenLibraryBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new OpenLibraryBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Open Library")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.OPEN_LIBRARY_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has SECONDARY_COMPILATION reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
    })

    it("has 0.85 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.85)
    })
  })

  describe("isAvailable", () => {
    it("returns true always (no API key required)", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    it("succeeds when books with biographical content are found", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 5,
        works: [
          {
            key: "/works/OL123W",
            title: "John Wayne: The Life and Legend",
            authors: [{ name: "Scott Eyman" }],
            has_fulltext: true,
            ia: ["johnwaynelifeandlegend"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([
        { pageNum: 42, highlight: richBiographicalHighlight },
      ])

      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalHighlight)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Open Library")
      expect(result.data!.sourceType).toBe(BiographySourceType.OPEN_LIBRARY_BIO)
      expect(result.data!.contentType).toBe("book_excerpt")
      expect(result.data!.text).toContain("Glendale, California")
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.data!.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
    })

    it("returns failure when no books found about person", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "",
        subject_count: 0,
        works: [],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toContain("No books found")
    })

    it("returns failure when no digitized books available", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 3,
        works: [
          {
            key: "/works/OL123W",
            title: "John Wayne Biography",
            authors: [{ name: "Someone" }],
            has_fulltext: false,
            ia: [],
          },
        ],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No digitized books")
    })

    it("returns failure when no biographical passages found inside books", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 1,
        works: [
          {
            key: "/works/OL123W",
            title: "Western Movies",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            ia: ["westernmovies"],
          },
        ],
      })

      // All search-inside queries return empty
      vi.mocked(searchInsideBook).mockResolvedValue([])

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No biographical passages")
    })

    it("returns failure when content is too short", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 1,
        works: [
          {
            key: "/works/OL123W",
            title: "Brief Book",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            ia: ["briefbook"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([
        { pageNum: 1, highlight: "Wayne grew up in California." },
      ])

      vi.mocked(sanitizeSourceText).mockReturnValue("Wayne grew up in California.")

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("too short")
    })

    it("handles API errors gracefully", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockRejectedValue(
        new Error("Open Library API error: 500 Internal Server Error")
      )

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Open Library API error")
    })

    it("continues when individual search-inside calls fail", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 1,
        works: [
          {
            key: "/works/OL123W",
            title: "John Wayne Book",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            ia: ["johnwaynebook"],
          },
        ],
      })

      // First keyword search fails, subsequent ones succeed
      vi.mocked(searchInsideBook)
        .mockRejectedValueOnce(new Error("Timeout"))
        .mockResolvedValueOnce([{ pageNum: 10, highlight: richBiographicalHighlight }])
        .mockResolvedValue([])

      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalHighlight)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
    })

    it("skips very short highlights", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 1,
        works: [
          {
            key: "/works/OL123W",
            title: "A Book",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            ia: ["abook"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([
        { pageNum: 1, highlight: "short" }, // Too short (< 20 chars), should be skipped
        { pageNum: 2, highlight: richBiographicalHighlight },
      ])

      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalHighlight)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Only the longer highlight should be included
      expect(result.data!.text).not.toContain("short\n\n")
    })

    it("searches multiple books up to the limit", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 5,
        works: [
          {
            key: "/works/OL1W",
            title: "Book 1",
            authors: [{ name: "A" }],
            has_fulltext: true,
            ia: ["book1"],
          },
          {
            key: "/works/OL2W",
            title: "Book 2",
            authors: [{ name: "B" }],
            has_fulltext: true,
            ia: ["book2"],
          },
          {
            key: "/works/OL3W",
            title: "Book 3",
            authors: [{ name: "C" }],
            has_fulltext: true,
            ia: ["book3"],
          },
          {
            key: "/works/OL4W",
            title: "Book 4",
            authors: [{ name: "D" }],
            has_fulltext: true,
            ia: ["book4"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([])

      await source.lookup(testActor)

      // Should search at most 3 books * 4 keywords = 12 calls
      // The 4th book should not be searched
      const calledIdentifiers = vi.mocked(searchInsideBook).mock.calls.map((call) => call[0])
      const uniqueBooks = new Set(calledIdentifiers)
      expect(uniqueBooks.size).toBeLessThanOrEqual(3)
      expect(uniqueBooks.has("book4")).toBe(false)
    })

    it("sets correct source metadata on success", async () => {
      vi.mocked(searchOpenLibraryByPerson).mockResolvedValue({
        name: "john_wayne",
        subject_count: 1,
        works: [
          {
            key: "/works/OL123W",
            title: "John Wayne Bio",
            authors: [{ name: "Author" }],
            has_fulltext: true,
            ia: ["johnwaynebio"],
          },
        ],
      })

      vi.mocked(searchInsideBook).mockResolvedValue([
        { pageNum: 42, highlight: richBiographicalHighlight },
      ])
      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalHighlight)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(BiographySourceType.OPEN_LIBRARY_BIO)
      expect(result.source.contentType).toBe("book_excerpt")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
      expect(result.source.reliabilityScore).toBe(0.85)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
