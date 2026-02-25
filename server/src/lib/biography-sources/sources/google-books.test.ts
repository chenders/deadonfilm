import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock the shared API clients
vi.mock("../../shared/google-books-api.js", () => ({
  searchGoogleBooks: vi.fn(),
  extractVolumeText: vi.fn(),
  formatVolumeAttribution: vi.fn(),
}))

vi.mock("../../shared/sanitize-source-text.js", () => ({
  sanitizeSourceText: vi.fn((text: string) => text),
}))

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { GoogleBooksBiographySource } from "./google-books.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"
import {
  searchGoogleBooks,
  extractVolumeText,
  formatVolumeAttribution,
} from "../../shared/google-books-api.js"
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

const richBiographicalContent = `John Wayne was born Marion Robert Morrison on May 26, 1907, in Winterset, Iowa. He grew up in California where his family moved when he was young. His childhood was marked by a close relationship with his parents and early exposure to the outdoors. Wayne attended Glendale High School, where he was a member of the football team. He received a scholarship to attend the University of Southern California, where he studied pre-law. His education was cut short when he lost his scholarship after a bodysurfing injury. His early life and personal struggles shaped his later career. Before fame, he worked odd jobs and spent time on movie sets. He married three times and had seven children.`

// ============================================================================
// Tests
// ============================================================================

describe("GoogleBooksBiographySource", () => {
  let source: GoogleBooksBiographySource
  const originalEnv = process.env.GOOGLE_BOOKS_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GOOGLE_BOOKS_API_KEY = "test-google-books-key"
    source = new GoogleBooksBiographySource()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GOOGLE_BOOKS_API_KEY = originalEnv
    } else {
      delete process.env.GOOGLE_BOOKS_API_KEY
    }
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Google Books")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.GOOGLE_BOOKS_BIO)
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
    it("returns true when GOOGLE_BOOKS_API_KEY is set", () => {
      process.env.GOOGLE_BOOKS_API_KEY = "test-key"
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when GOOGLE_BOOKS_API_KEY is not set", () => {
      delete process.env.GOOGLE_BOOKS_API_KEY
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    it("succeeds when Google Books returns biographical content", async () => {
      const mockVolume = {
        id: "vol1",
        volumeInfo: {
          title: "John Wayne: The Life and Legend",
          authors: ["Scott Eyman"],
          publishedDate: "2014",
        },
        searchInfo: { textSnippet: "Wayne <b>grew up</b> in California" },
        accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
      }

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 1,
        items: [mockVolume],
      })
      vi.mocked(extractVolumeText).mockReturnValue(richBiographicalContent)
      vi.mocked(formatVolumeAttribution).mockReturnValue(
        "John Wayne: The Life and Legend by Scott Eyman (2014)"
      )
      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalContent)

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Google Books")
      expect(result.data!.sourceType).toBe(BiographySourceType.GOOGLE_BOOKS_BIO)
      expect(result.data!.contentType).toBe("book_summary")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.data!.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
      expect(result.data!.reliabilityScore).toBe(0.85)
    })

    it("returns failure when no books found", async () => {
      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 0,
        items: [],
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toContain("No books found")
    })

    it("returns failure when no volumes have readable text", async () => {
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

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.data).toBeNull()
      expect(result.error).toContain("No readable text")
    })

    it("returns failure when content is too short", async () => {
      const mockVolume = {
        id: "vol1",
        volumeInfo: { title: "Brief Mention" },
        accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
      }

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 1,
        items: [mockVolume],
      })
      vi.mocked(extractVolumeText).mockReturnValue("Short text about childhood.")
      vi.mocked(sanitizeSourceText).mockReturnValue("Short text about childhood.")
      vi.mocked(formatVolumeAttribution).mockReturnValue("Brief Mention")

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("too short")
    })

    it("returns failure when text has no biographical keywords", async () => {
      const mockVolume = {
        id: "vol1",
        volumeInfo: { title: "Western Movies" },
        accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
      }

      const careerOnlyText =
        "John Wayne starred in over 170 films across a prolific career spanning five decades. He won the Academy Award for Best Actor for True Grit in 1969. His iconic roles include Rooster Cogburn and Ethan Edwards."

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 1,
        items: [mockVolume],
      })
      vi.mocked(extractVolumeText).mockReturnValue(careerOnlyText)
      vi.mocked(sanitizeSourceText).mockReturnValue(careerOnlyText)
      vi.mocked(formatVolumeAttribution).mockReturnValue("Western Movies")

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No biographical keywords")
    })

    it("handles API errors gracefully", async () => {
      vi.mocked(searchGoogleBooks).mockRejectedValue(
        new Error("Google Books API error: 500 Internal Server Error")
      )

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Google Books API error")
    })

    it("combines text from multiple volumes", async () => {
      const mockVolumes = [
        {
          id: "vol1",
          volumeInfo: { title: "Book One", authors: ["Author A"] },
          accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
        },
        {
          id: "vol2",
          volumeInfo: { title: "Book Two", authors: ["Author B"] },
          accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
        },
      ]

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 2,
        items: mockVolumes,
      })

      // First volume has biographical content
      const text1 =
        "Wayne grew up in a modest family in California. His childhood was spent outdoors."
      const text2 =
        "His parents supported his early education at Glendale High School where he played football."

      vi.mocked(extractVolumeText).mockReturnValueOnce(text1).mockReturnValueOnce(text2)
      vi.mocked(sanitizeSourceText).mockReturnValueOnce(text1).mockReturnValueOnce(text2)
      vi.mocked(formatVolumeAttribution)
        .mockReturnValueOnce("Book One by Author A")
        .mockReturnValueOnce("Book Two by Author B")

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.text).toContain("modest family")
      expect(result.data!.text).toContain("education")
    })

    it("uses biography-focused search query", async () => {
      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 0,
        items: [],
      })

      await source.lookup(testActor)

      expect(searchGoogleBooks).toHaveBeenCalledWith(
        expect.stringContaining("biography personal life"),
        5,
        expect.any(AbortSignal)
      )
      expect(searchGoogleBooks).toHaveBeenCalledWith(
        expect.stringContaining("John Wayne"),
        5,
        expect.any(AbortSignal)
      )
    })

    it("sets correct source metadata on success", async () => {
      const mockVolume = {
        id: "vol1",
        volumeInfo: { title: "Biography Book" },
        accessInfo: { viewability: "PARTIAL" as const, publicDomain: false },
      }

      vi.mocked(searchGoogleBooks).mockResolvedValue({
        totalItems: 1,
        items: [mockVolume],
      })
      vi.mocked(extractVolumeText).mockReturnValue(richBiographicalContent)
      vi.mocked(sanitizeSourceText).mockReturnValue(richBiographicalContent)
      vi.mocked(formatVolumeAttribution).mockReturnValue("Biography Book")

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(BiographySourceType.GOOGLE_BOOKS_BIO)
      expect(result.source.contentType).toBe("book_summary")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
      expect(result.source.reliabilityScore).toBe(0.85)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
