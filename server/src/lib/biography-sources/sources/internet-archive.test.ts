import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { InternetArchiveBiographySource } from "./internet-archive.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 123,
  tmdb_id: 2157,
  imdb_person_id: "nm0000078",
  name: "John Wayne",
  birthday: "1907-05-26",
  deathday: "1979-06-11",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Winterset, Iowa, USA",
}

/**
 * Build an Internet Archive search response with the given docs.
 */
function buildIAResponse(
  docs: Array<{
    identifier: string
    title?: string
    description?: string | string[]
    subject?: string | string[]
    creator?: string
    date?: string
    downloads?: number
  }>
): object {
  return {
    responseHeader: { status: 0, QTime: 10 },
    response: {
      numFound: docs.length,
      start: 0,
      docs: docs.map((d) => ({
        identifier: d.identifier,
        title: d.title,
        description: d.description,
        subject: d.subject,
        creator: d.creator,
        date: d.date,
        downloads: d.downloads ?? 100,
        mediatype: "texts",
      })),
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("InternetArchiveBiographySource", () => {
  let source: InternetArchiveBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new InternetArchiveBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Internet Archive")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.INTERNET_ARCHIVE_BIO)
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

    it("is always available (no API key needed)", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    it("succeeds when biographical content found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildIAResponse([
            {
              identifier: "john-wayne-biography-1960",
              title: "John Wayne: A Biography of the American Icon",
              description:
                "A comprehensive biography of John Wayne detailing his early life, childhood in Iowa, education at USC, personal struggles before fame, and family relationships. He grew up in Glendale, California where his parents settled.",
              subject: ["biography", "actors", "Hollywood"],
              creator: "Author Name",
              date: "1960",
              downloads: 500,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Internet Archive")
      expect(result.data!.sourceType).toBe(BiographySourceType.INTERNET_ARCHIVE_BIO)
      expect(result.data!.publication).toBe("Internet Archive")
      expect(result.data!.domain).toBe("archive.org")
      expect(result.data!.contentType).toBe("biography")
      expect(result.data!.url).toContain("archive.org/details/john-wayne-biography-1960")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0, QTime: 10 },
          response: { numFound: 0, start: 0, docs: [] },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No items found")
    })

    it("returns failure when no relevant biographical docs found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildIAResponse([
            {
              identifier: "random-audio-file",
              title: "Random Audio Recording",
              description: "Some unrelated audio recording from 1960",
              downloads: 10,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No relevant biographical content")
    })

    it("returns failure when content is too short", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildIAResponse([
            {
              identifier: "john-wayne-short",
              title: "John Wayne biography note",
              description: "Short.",
              downloads: 10,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("handles API HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 503")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection timeout"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Connection timeout")
    })

    it("prefers docs with full name match over last name only", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildIAResponse([
            {
              identifier: "wayne-general",
              title: "Wayne County History and Biography",
              description: "A history of Wayne County including interview excerpts",
              downloads: 200,
            },
            {
              identifier: "john-wayne-bio",
              title: "John Wayne: The Complete Biography",
              description:
                "Biography of John Wayne detailing his early life in Iowa and personal struggles before fame",
              downloads: 100,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.url).toContain("john-wayne-bio")
    })

    it("handles array description fields", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildIAResponse([
            {
              identifier: "wayne-memoir",
              title: "Memoir of John Wayne: early life and childhood",
              description: [
                "First part of biography covering John Wayne's childhood and family.",
                "Second part covering his personal life before fame and education.",
              ],
              subject: ["biography", "memoir"],
              downloads: 300,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.text).toContain("childhood")
    })

    it("sets correct source metadata on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildIAResponse([
            {
              identifier: "john-wayne-profile",
              title: "John Wayne: An Interview and Biography",
              description:
                "A detailed profile and interview with John Wayne discussing his childhood, family, and personal life",
              downloads: 250,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("Internet Archive")
      expect(result.source.domain).toBe("archive.org")
      expect(result.source.contentType).toBe("biography")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.ARCHIVAL)
      expect(result.source.reliabilityScore).toBe(0.9)
    })
  })
})
