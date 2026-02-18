import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { EuropeanaBiographySource } from "./europeana.js"
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
  name: "Marlene Dietrich",
  birthday: "1901-12-27",
  deathday: "1992-05-06",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Berlin, Germany",
}

/**
 * Build a Europeana API search response.
 */
function buildEuropeanaResponse(
  items: Array<{
    id: string
    guid?: string
    title: string[]
    dcDescription?: string[]
    dataProvider?: string[]
    provider?: string[]
    country?: string[]
    year?: string[]
    score?: number
    edmIsShownAt?: string[]
  }>
): object {
  return {
    success: true,
    itemsCount: items.length,
    totalResults: items.length,
    items: items.map((item) => ({
      id: item.id,
      guid: item.guid || `https://www.europeana.eu/item${item.id}`,
      title: item.title,
      dcDescription: item.dcDescription,
      dataProvider: item.dataProvider,
      provider: item.provider,
      country: item.country,
      year: item.year,
      score: item.score ?? 50,
      edmIsShownAt: item.edmIsShownAt,
    })),
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("EuropeanaBiographySource", () => {
  let source: EuropeanaBiographySource
  const originalEnv = process.env.EUROPEANA_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.EUROPEANA_API_KEY = "test-europeana-key"
    source = new EuropeanaBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (originalEnv !== undefined) {
      process.env.EUROPEANA_API_KEY = originalEnv
    } else {
      delete process.env.EUROPEANA_API_KEY
    }
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Europeana")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.EUROPEANA_BIO)
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
    it("returns true when EUROPEANA_API_KEY is set", () => {
      process.env.EUROPEANA_API_KEY = "test-key"
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when EUROPEANA_API_KEY is not set", () => {
      delete process.env.EUROPEANA_API_KEY
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("lookup", () => {
    it("succeeds when biographical content found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildEuropeanaResponse([
            {
              id: "/123/item1",
              title: ["Marlene Dietrich: A Biography and Personal Profile"],
              dcDescription: [
                "A comprehensive biography of Marlene Dietrich covering her childhood in Berlin, her early life in Germany, personal struggles, family background, education at the Max Reinhardt drama school, and her career before Hollywood.",
              ],
              dataProvider: ["Deutsche Kinemathek"],
              country: ["Germany"],
              year: ["1940"],
              score: 90,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Europeana")
      expect(result.data!.sourceType).toBe(BiographySourceType.EUROPEANA_BIO)
      expect(result.data!.publication).toBe("Deutsche Kinemathek")
      expect(result.data!.domain).toBe("europeana.eu")
      expect(result.data!.contentType).toBe("biography")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when API key is not configured", async () => {
      delete process.env.EUROPEANA_API_KEY

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("EUROPEANA_API_KEY")
    })

    it("returns failure when no items found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          itemsCount: 0,
          totalResults: 0,
          items: [],
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No items found")
    })

    it("returns failure when API returns success=false", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          itemsCount: 0,
          totalResults: 0,
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No items found")
    })

    it("returns failure when no relevant biographical items found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildEuropeanaResponse([
            {
              id: "/999/unrelated",
              title: ["Completely Unrelated Document"],
              dcDescription: ["This has nothing to do with any actor"],
              score: 10,
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
          buildEuropeanaResponse([
            {
              id: "/123/short",
              title: ["Dietrich biography note"],
              dcDescription: ["Brief."],
              score: 50,
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
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 500")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("SSL certificate expired"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("SSL certificate expired")
    })

    it("uses edmIsShownAt URL when available", async () => {
      const showUrl = "https://library.example.eu/item/123"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildEuropeanaResponse([
            {
              id: "/123/item1",
              title: ["Marlene Dietrich: A Biography"],
              dcDescription: [
                "A detailed biography of Marlene Dietrich covering her childhood in Berlin, family, personal life, education, and early career before Hollywood.",
              ],
              edmIsShownAt: [showUrl],
              dataProvider: ["Berlin State Library"],
              score: 80,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.url).toBe(showUrl)
    })

    it("falls back to guid when edmIsShownAt not available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildEuropeanaResponse([
            {
              id: "/123/item1",
              guid: "https://www.europeana.eu/item/123/item1",
              title: ["Marlene Dietrich: Biography and Profile"],
              dcDescription: [
                "Biography covering Marlene Dietrich's childhood, family background, personal life, education, and early years in Berlin.",
              ],
              dataProvider: ["Film Museum"],
              score: 70,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.url).toContain("europeana.eu")
    })

    it("sets correct source metadata on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildEuropeanaResponse([
            {
              id: "/123/item1",
              title: ["Dietrich: Profile and Interview"],
              dcDescription: [
                "A profile and interview covering Marlene Dietrich's personal life, childhood in Berlin, family, education, and early career.",
              ],
              dataProvider: ["Deutsche Kinemathek"],
              provider: ["European Film Gateway"],
              score: 85,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("Deutsche Kinemathek")
      expect(result.source.domain).toBe("europeana.eu")
      expect(result.source.contentType).toBe("biography")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.ARCHIVAL)
      expect(result.source.reliabilityScore).toBe(0.9)
    })

    it("falls back to provider when dataProvider not available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildEuropeanaResponse([
            {
              id: "/123/item1",
              title: ["Marlene Dietrich: A Personal Biography"],
              dcDescription: [
                "Biography and profile of Marlene Dietrich covering childhood, personal life, family background, and education in Berlin.",
              ],
              provider: ["European Film Gateway"],
              score: 75,
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("European Film Gateway")
    })
  })
})
