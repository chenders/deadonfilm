import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { GuardianBiographySource } from "./guardian.js"
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
 * Build a Guardian API response with the given articles.
 */
function buildGuardianResponse(
  articles: Array<{
    webTitle: string
    webUrl: string
    bodyText?: string
    standfirst?: string
    sectionId?: string
  }>
): object {
  return {
    response: {
      status: "ok",
      total: articles.length,
      results: articles.map((a, i) => ({
        id: `article-${i}`,
        type: "article",
        sectionId: a.sectionId || "film",
        sectionName: "Film",
        webPublicationDate: "2020-01-15T12:00:00Z",
        webTitle: a.webTitle,
        webUrl: a.webUrl,
        apiUrl: `https://content.guardianapis.com/article-${i}`,
        fields: {
          bodyText: a.bodyText || "",
          standfirst: a.standfirst || "",
          trailText: "",
        },
      })),
    },
  }
}

const richBiographicalContent = `John Wayne was born Marion Robert Morrison on May 26, 1907, in Winterset, Iowa. He grew up in California where his family moved when he was young. His childhood was marked by a close relationship with his parents and early exposure to the outdoors. Wayne attended Glendale High School, where he was a member of the football team. He received a scholarship to attend the University of Southern California, where he studied pre-law. His education was cut short when he lost his scholarship after a bodysurfing injury. His early life and personal struggles shaped his later career. Before fame, he worked odd jobs and spent time on movie sets. He married three times and had seven children.`

// ============================================================================
// Tests
// ============================================================================

describe("GuardianBiographySource", () => {
  let source: GuardianBiographySource
  const originalEnv = process.env.GUARDIAN_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GUARDIAN_API_KEY = "test-guardian-key"
    source = new GuardianBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalEnv !== undefined) {
      process.env.GUARDIAN_API_KEY = originalEnv
    } else {
      delete process.env.GUARDIAN_API_KEY
    }
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("The Guardian")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.GUARDIAN_BIO)
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
    it("returns true when GUARDIAN_API_KEY is set", () => {
      process.env.GUARDIAN_API_KEY = "test-key"
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when GUARDIAN_API_KEY is not set", () => {
      delete process.env.GUARDIAN_API_KEY
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    it("succeeds when Guardian API returns biographical article", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildGuardianResponse([
            {
              webTitle: "John Wayne: profile of an American icon",
              webUrl: "https://www.theguardian.com/film/john-wayne-profile",
              bodyText: richBiographicalContent,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("The Guardian")
      expect(result.data!.sourceType).toBe(BiographySourceType.GUARDIAN_BIO)
      expect(result.data!.publication).toBe("The Guardian")
      expect(result.data!.domain).toBe("theguardian.com")
      expect(result.data!.contentType).toBe("profile")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no articles found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: { status: "ok", total: 0, results: [] },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No articles found")
    })

    it("returns failure when API key is not configured", async () => {
      delete process.env.GUARDIAN_API_KEY

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Guardian API key not configured")
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

    it("handles API HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 500")
    })

    it("returns failure when article body text is empty", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildGuardianResponse([
            {
              webTitle: "John Wayne Profile",
              webUrl: "https://www.theguardian.com/film/john-wayne",
              bodyText: "",
              standfirst: "",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("no body text")
    })

    it("returns failure when content is too short after cleaning", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildGuardianResponse([
            {
              webTitle: "John Wayne Brief",
              webUrl: "https://www.theguardian.com/film/john-wayne-brief",
              bodyText: "Short text about John Wayne.",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("prefers articles with biographical keywords in title", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildGuardianResponse([
            {
              webTitle: "John Wayne wins award",
              webUrl: "https://www.theguardian.com/film/john-wayne-award",
              bodyText: richBiographicalContent,
            },
            {
              webTitle: "John Wayne: a profile of the man behind the legend",
              webUrl: "https://www.theguardian.com/film/john-wayne-profile",
              bodyText: richBiographicalContent,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("john-wayne-profile")
    })

    it("sets correct source metadata on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildGuardianResponse([
            {
              webTitle: "John Wayne: interview with Hollywood legend",
              webUrl: "https://www.theguardian.com/film/john-wayne-interview",
              bodyText: richBiographicalContent,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("The Guardian")
      expect(result.source.domain).toBe("theguardian.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
      expect(result.source.reliabilityScore).toBe(0.95)
      expect(result.source.url).toContain("theguardian.com")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })

    it("calculates biographical confidence from content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildGuardianResponse([
            {
              webTitle: "John Wayne biography",
              webUrl: "https://www.theguardian.com/film/john-wayne",
              bodyText: richBiographicalContent,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Content has many biographical keywords: "born in", "grew up", "parents",
      // "childhood", "education", "school", "scholarship", "family", "married", "personal"
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
