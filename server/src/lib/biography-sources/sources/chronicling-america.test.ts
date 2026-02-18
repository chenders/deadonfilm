import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { ChroniclingAmericaBiographySource } from "./chronicling-america.js"
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

const oldActor: ActorForBiography = {
  id: 456,
  tmdb_id: 1000,
  imdb_person_id: "nm0000001",
  name: "Rudolph Valentino",
  birthday: "1895-05-06",
  deathday: "1926-08-23",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Castellaneta, Italy",
}

const modernActor: ActorForBiography = {
  id: 789,
  tmdb_id: 2000,
  imdb_person_id: "nm0000002",
  name: "Modern Actor",
  birthday: "1980-01-01",
  deathday: "2020-06-15",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Los Angeles, USA",
}

/**
 * Build a Chronicling America search response.
 */
function buildChronAmResponse(
  results: Array<{
    id: string
    title: string
    date: string
    url: string
    description?: string[]
    contributor?: string[]
  }>
): object {
  return {
    results,
    pagination: {
      total: results.length,
      current: 1,
      perpage: 25,
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe("ChroniclingAmericaBiographySource", () => {
  let source: ChroniclingAmericaBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new ChroniclingAmericaBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Chronicling America")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.CHRONICLING_AMERICA_BIO)
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

  describe("date range validation", () => {
    it("skips actors born after 1963", async () => {
      const result = await source.lookup(modernActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("outside Chronicling America coverage")
      // Should not have made any fetch calls
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("accepts actors within the 1756-1963 range", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildChronAmResponse([
            {
              id: "sn12345/1926-08-24/ed-1/seq-1",
              title: "Rudolph Valentino: A Biography and Profile of the Screen Idol",
              date: "1926-08-24",
              url: "https://chroniclingamerica.loc.gov/lccn/sn12345/1926-08-24/ed-1/seq-1/",
              description: [
                "A detailed profile of Valentino's childhood in Italy and his early life before Hollywood fame, covering his personal struggles and family background.",
              ],
              contributor: ["The Los Angeles Times"],
            },
          ]),
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("works with actors who span the coverage boundary", async () => {
      // John Wayne was born 1907 (within range) but died 1979 (after range)
      // Should still search within the valid window (1907-1963)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildChronAmResponse([
            {
              id: "sn99999/1950-03-15/ed-1/seq-3",
              title: "John Wayne Biography: Profile of a Rising Star",
              date: "1950-03-15",
              url: "https://chroniclingamerica.loc.gov/lccn/sn99999/1950-03-15/ed-1/seq-3/",
              description: [
                "A biography and personal profile of John Wayne covering his childhood in Iowa, early life in California, and family background.",
              ],
              contributor: ["The New York Herald"],
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
    })
  })

  describe("lookup", () => {
    it("succeeds when biographical content found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildChronAmResponse([
            {
              id: "sn12345/1926-08-24/ed-1/seq-1",
              title: "Valentino: A Profile and Biography of the Great Lover",
              date: "1926-08-24",
              url: "https://chroniclingamerica.loc.gov/lccn/sn12345/1926-08-24/ed-1/seq-1/",
              description: [
                "Comprehensive profile of Rudolph Valentino covering his childhood in Castellaneta, his family, parents, personal life, and early struggles before Hollywood fame.",
              ],
              contributor: ["The New York Times"],
            },
          ]),
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Chronicling America")
      expect(result.data!.sourceType).toBe(BiographySourceType.CHRONICLING_AMERICA_BIO)
      expect(result.data!.domain).toBe("loc.gov")
      expect(result.data!.contentType).toBe("biography")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => buildChronAmResponse([]),
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No newspaper articles found")
    })

    it("returns failure when no relevant biographical results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildChronAmResponse([
            {
              id: "sn99999/1926-01-01/ed-1/seq-1",
              title: "Unrelated Article About Something Else",
              date: "1926-01-01",
              url: "https://chroniclingamerica.loc.gov/lccn/sn99999/1926-01-01/ed-1/seq-1/",
              description: ["Nothing about any actor"],
            },
          ]),
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No relevant biographical content")
    })

    it("returns failure when content is too short", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildChronAmResponse([
            {
              id: "sn12345/1926-08-24/ed-1/seq-1",
              title: "Valentino biography note",
              date: "1926-08-24",
              url: "https://chroniclingamerica.loc.gov/lccn/sn12345/",
              description: ["Brief."],
            },
          ]),
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("handles API HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 500")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("DNS resolution failed"))

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("DNS resolution failed")
    })

    it("uses newspaper contributor as publication", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildChronAmResponse([
            {
              id: "sn12345/1926-08-24/ed-1/seq-1",
              title: "Rudolph Valentino: Biography and Personal Life Profile",
              date: "1926-08-24",
              url: "https://chroniclingamerica.loc.gov/lccn/sn12345/",
              description: [
                "Full biography of Rudolph Valentino covering his childhood, early life, family, and personal history before fame.",
              ],
              contributor: ["The Chicago Tribune"],
            },
          ]),
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("The Chicago Tribune")
    })

    it("sets correct source metadata on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          buildChronAmResponse([
            {
              id: "sn12345/1926-08-24/ed-1/seq-1",
              title: "Valentino Interview and Biography Profile",
              date: "1926-08-24",
              url: "https://chroniclingamerica.loc.gov/lccn/sn12345/",
              description: [
                "An interview-based biography of Rudolph Valentino discussing his childhood in Italy, education, family, and personal struggles.",
              ],
              contributor: ["Los Angeles Herald"],
            },
          ]),
      })

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(true)
      expect(result.source.domain).toBe("loc.gov")
      expect(result.source.contentType).toBe("biography")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.ARCHIVAL)
      expect(result.source.reliabilityScore).toBe(0.9)
    })
  })
})
