import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { NYTimesBiographySource } from "./nytimes.js"
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
 * Build a NYT API response with the given articles.
 */
function buildNYTResponse(
  articles: Array<{
    headline: string
    abstract?: string
    lead_paragraph?: string
    snippet?: string
    web_url?: string
    section_name?: string
    type_of_material?: string
  }>
): object {
  return {
    status: "OK",
    response: {
      docs: articles.map((a, i) => ({
        web_url: a.web_url || `https://www.nytimes.com/article/john-wayne-${i}`,
        snippet: a.snippet || "",
        lead_paragraph: a.lead_paragraph || "",
        abstract: a.abstract || "",
        headline: {
          main: a.headline,
        },
        pub_date: "2020-01-15T00:00:00+0000",
        document_type: "article",
        news_desk: "Arts",
        section_name: a.section_name || "Arts",
        type_of_material: a.type_of_material || "News",
        keywords: [],
      })),
      meta: {
        hits: articles.length,
        offset: 0,
      },
    },
  }
}

const richBiographicalAbstract = `John Wayne, born Marion Robert Morrison, grew up in a modest family in Winterset, Iowa. His childhood was shaped by his parents' difficult marriage and a move to California. Before fame, he was a football scholarship student at USC where his education led to a chance meeting with director John Ford. His personal life included three marriages and seven children.`

// ============================================================================
// Tests
// ============================================================================

describe("NYTimesBiographySource", () => {
  let source: NYTimesBiographySource
  const originalEnv = process.env.NYTIMES_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NYTIMES_API_KEY = "test-nyt-key"
    source = new NYTimesBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalEnv !== undefined) {
      process.env.NYTIMES_API_KEY = originalEnv
    } else {
      delete process.env.NYTIMES_API_KEY
    }
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("New York Times")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.NYTIMES_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has TIER_1_NEWS reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
    })

    it("has 0.95 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.95)
    })
  })

  describe("isAvailable", () => {
    it("returns true when NYTIMES_API_KEY is set", () => {
      process.env.NYTIMES_API_KEY = "test-key"
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when NYTIMES_API_KEY is not set", () => {
      delete process.env.NYTIMES_API_KEY
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    it("succeeds when NYT API returns biographical article", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildNYTResponse([
            {
              headline: "John Wayne: A Profile of the American Icon",
              abstract: richBiographicalAbstract,
              lead_paragraph:
                "John Wayne was born in Winterset, Iowa, and grew up in modest circumstances with his parents and siblings.",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("The New York Times")
      expect(result.data!.sourceType).toBe(BiographySourceType.NYTIMES_BIO)
      expect(result.data!.publication).toBe("The New York Times")
      expect(result.data!.domain).toBe("nytimes.com")
      expect(result.data!.contentType).toBe("profile")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no articles found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          response: {
            docs: [],
            meta: { hits: 0, offset: 0 },
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No articles found")
    })

    it("returns failure when API key is not configured", async () => {
      delete process.env.NYTIMES_API_KEY

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("NYT API key not configured")
    })

    it("handles API rate limit (429)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("rate limit exceeded")
    })

    it("handles invalid API key (401)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid NYT API key")
    })

    it("handles API HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 500")
    })

    it("returns failure when article has no text content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildNYTResponse([
            {
              headline: "John Wayne",
              abstract: "",
              lead_paragraph: "",
              snippet: "",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("no text content")
    })

    it("returns failure when content is too short after cleaning", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildNYTResponse([
            {
              headline: "John Wayne",
              abstract: "Short text.",
              lead_paragraph: "Very short.",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("prefers articles with biographical keywords in headline", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildNYTResponse([
            {
              headline: "John Wayne Wins Oscar",
              abstract: richBiographicalAbstract,
              web_url: "https://www.nytimes.com/oscar",
            },
            {
              headline: "John Wayne: An Intimate Profile",
              abstract: richBiographicalAbstract,
              web_url: "https://www.nytimes.com/profile",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("profile")
    })

    it("caps confidence at 0.7 due to limited content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildNYTResponse([
            {
              headline: "John Wayne profile",
              abstract: richBiographicalAbstract,
              lead_paragraph: richBiographicalAbstract,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.confidence).toBeLessThanOrEqual(0.7)
    })

    it("sets correct source metadata on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildNYTResponse([
            {
              headline: "John Wayne interview",
              abstract: richBiographicalAbstract,
              lead_paragraph: richBiographicalAbstract,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("The New York Times")
      expect(result.source.domain).toBe("nytimes.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
      expect(result.source.reliabilityScore).toBe(0.95)
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Connection refused")
    })
  })
})
