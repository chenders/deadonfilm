import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { TroveBiographySource } from "./trove.js"
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
  name: "Errol Flynn",
  birthday: "1909-06-20",
  deathday: "1959-10-14",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Hobart, Tasmania, Australia",
}

/**
 * Build a Trove API search response.
 */
function buildTroveResponse(
  articles: Array<{
    id: string
    heading: string
    snippet?: string
    date?: string
    troveUrl?: string
    titleValue?: string
    relevanceScore?: number
  }>
): object {
  return {
    category: [
      {
        name: "newspaper",
        records: {
          total: articles.length,
          article: articles.map((a) => ({
            id: a.id,
            url: `https://api.trove.nla.gov.au/v3/newspaper/${a.id}`,
            heading: a.heading,
            category: "Article",
            title: {
              id: "t-123",
              value: a.titleValue || "The Sydney Morning Herald",
            },
            date: a.date || "1940-01-15",
            relevance: {
              score: a.relevanceScore ?? 50,
            },
            snippet: a.snippet,
            troveUrl: a.troveUrl || `https://trove.nla.gov.au/newspaper/article/${a.id}`,
          })),
        },
      },
    ],
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("TroveBiographySource", () => {
  let source: TroveBiographySource
  const originalEnv = process.env.TROVE_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TROVE_API_KEY = "test-trove-key"
    source = new TroveBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalEnv !== undefined) {
      process.env.TROVE_API_KEY = originalEnv
    } else {
      delete process.env.TROVE_API_KEY
    }
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Trove")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.TROVE_BIO)
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
    it("returns true when TROVE_API_KEY is set", () => {
      process.env.TROVE_API_KEY = "test-key"
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when TROVE_API_KEY is not set", () => {
      delete process.env.TROVE_API_KEY
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    it("succeeds when biographical article found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildTroveResponse([
            {
              id: "12345",
              heading: "Errol Flynn: A Biography and Profile of Tasmania's Famous Son",
              snippet:
                "A comprehensive profile of Errol Flynn covering his childhood in Hobart, his early life in Tasmania, personal struggles, family background, and education before he found fame in Hollywood.",
              date: "1940-03-15",
              titleValue: "The Sydney Morning Herald",
              relevanceScore: 85,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Trove")
      expect(result.data!.sourceType).toBe(BiographySourceType.TROVE_BIO)
      expect(result.data!.publication).toBe("The Sydney Morning Herald")
      expect(result.data!.domain).toBe("trove.nla.gov.au")
      expect(result.data!.contentType).toBe("biography")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when API key is not configured", async () => {
      delete process.env.TROVE_API_KEY

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("TROVE_API_KEY")
    })

    it("returns failure when no articles found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          category: [
            {
              name: "newspaper",
              records: { total: 0, article: [] },
            },
          ],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No newspaper articles found")
    })

    it("returns failure when no relevant biographical articles found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildTroveResponse([
            {
              id: "99999",
              heading: "Completely Unrelated Story About Weather",
              snippet: "The rain continued throughout the day in Melbourne.",
              relevanceScore: 10,
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
          buildTroveResponse([
            {
              id: "12345",
              heading: "Flynn biography note",
              snippet: "Brief.",
              relevanceScore: 50,
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
        status: 403,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 403")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network unreachable"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network unreachable")
    })

    it("cleans HTML from snippets", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildTroveResponse([
            {
              id: "12345",
              heading: "Errol Flynn: Profile and Biography of a Star",
              snippet:
                "<strong>Errol Flynn</strong> was born in <em>Hobart</em>, Tasmania. His childhood was marked by personal struggles. He grew up with his parents in a family that valued education. Before fame, he worked odd jobs. His early life shaped his later career.",
              relevanceScore: 75,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // HTML tags should be removed
      expect(result.data!.text).not.toContain("<strong>")
      expect(result.data!.text).not.toContain("<em>")
    })

    it("sets correct source metadata on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildTroveResponse([
            {
              id: "12345",
              heading: "Errol Flynn: Interview and Profile",
              snippet:
                "A biographical interview with Errol Flynn discussing his childhood in Tasmania, family background, parents, personal life, and education before Hollywood.",
              titleValue: "The Age",
              relevanceScore: 80,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("The Age")
      expect(result.source.domain).toBe("trove.nla.gov.au")
      expect(result.source.contentType).toBe("biography")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.ARCHIVAL)
      expect(result.source.reliabilityScore).toBe(0.9)
    })

    it("prefers articles with biographical keywords over plain name matches", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildTroveResponse([
            {
              id: "11111",
              heading: "Flynn stars in new adventure movie at Warner Bros",
              snippet:
                "Flynn appears in a new adventure film alongside co-stars from the latest production at Warner Bros studios.",
              relevanceScore: 90,
            },
            {
              id: "22222",
              heading: "Errol Flynn: A Personal Profile and Biography",
              snippet:
                "A detailed biography and profile of Errol Flynn covering his childhood, family background, education, and personal life in Tasmania.",
              relevanceScore: 70,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.url).toContain("22222")
    })
  })
})
