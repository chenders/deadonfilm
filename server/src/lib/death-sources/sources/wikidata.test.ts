import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { WikidataSource, isValidLabel, getValidLabel } from "./wikidata.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("isValidLabel", () => {
  describe("returns false for invalid values", () => {
    it("returns false for undefined", () => {
      expect(isValidLabel(undefined)).toBe(false)
    })

    it("returns false for empty string", () => {
      expect(isValidLabel("")).toBe(false)
    })

    it("returns false for http URLs", () => {
      expect(isValidLabel("http://example.com")).toBe(false)
      expect(isValidLabel("http://www.wikidata.org/.well-known/genid/abc123")).toBe(false)
    })

    it("returns false for https URLs", () => {
      expect(isValidLabel("https://example.com")).toBe(false)
      expect(isValidLabel("https://www.wikidata.org/entity/Q12345")).toBe(false)
    })

    it("returns false for genid references", () => {
      expect(isValidLabel("genid-abc123")).toBe(false)
      expect(isValidLabel("some-genid-reference")).toBe(false)
      expect(isValidLabel("t12345genid6789")).toBe(false)
    })

    it("returns false for raw Wikidata entity IDs", () => {
      expect(isValidLabel("Q12345")).toBe(false)
      expect(isValidLabel("Q1")).toBe(false)
      expect(isValidLabel("Q999999999")).toBe(false)
    })
  })

  describe("returns true for valid labels", () => {
    it("returns true for normal text labels", () => {
      expect(isValidLabel("heart attack")).toBe(true)
      expect(isValidLabel("natural causes")).toBe(true)
      expect(isValidLabel("Los Angeles")).toBe(true)
    })

    it("returns true for labels with special characters", () => {
      expect(isValidLabel("New York City, USA")).toBe(true)
      expect(isValidLabel("cancer (lung)")).toBe(true)
      expect(isValidLabel("suicide — self-inflicted")).toBe(true)
    })

    it("returns true for labels that contain Q but are not raw entity IDs", () => {
      expect(isValidLabel("Quality control")).toBe(true)
      expect(isValidLabel("Q&A session")).toBe(true)
      expect(isValidLabel("Q12345 in text")).toBe(true) // Contains Q12345 but not exact match
    })

    it("returns true for numeric strings that are not entity IDs", () => {
      expect(isValidLabel("12345")).toBe(true)
      expect(isValidLabel("2024")).toBe(true)
    })
  })
})

describe("getValidLabel", () => {
  it("returns the value for valid labels", () => {
    expect(getValidLabel("heart attack")).toBe("heart attack")
    expect(getValidLabel("Los Angeles")).toBe("Los Angeles")
  })

  it("returns null for invalid labels", () => {
    expect(getValidLabel(undefined)).toBe(null)
    expect(getValidLabel("")).toBe(null)
    expect(getValidLabel("http://example.com")).toBe(null)
    expect(getValidLabel("Q12345")).toBe(null)
    expect(getValidLabel("genid-abc")).toBe(null)
  })
})

describe("WikidataSource", () => {
  let source: WikidataSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new WikidataSource()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Wikidata")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.WIKIDATA)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is always available (no API key needed)", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    const mockActor = {
      id: 123,
      tmdbId: 456,
      name: "John Smith",
      birthday: "1950-01-15",
      deathday: "2024-06-01",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    it("requires birthday for lookup", async () => {
      const actorWithoutBirthday = { ...mockActor, birthday: null }
      const result = await source.lookup(actorWithoutBirthday)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Missing birthday or deathday")
    })

    it("requires deathday for lookup", async () => {
      const actorWithoutDeathday = { ...mockActor, deathday: null }
      const result = await source.lookup(actorWithoutDeathday)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Missing birthday or deathday")
    })

    it("handles non-retryable HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Wikidata SPARQL request failed")
    })

    it("retries on 5xx then returns failure", async () => {
      vi.useFakeTimers()

      // Mock all attempts returning 500
      for (let i = 0; i <= 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        })
      }

      const resultPromise = source.lookup(mockActor)

      // Advance through retry delays (2s, 4s, 8s)
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10000)
      }

      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error).toContain("Wikidata SPARQL request failed")
      expect(mockFetch).toHaveBeenCalledTimes(4) // initial + 3 retries
    })

    it("handles network errors with retries", async () => {
      vi.useFakeTimers()

      // Mock all attempts failing
      for (let i = 0; i <= 3; i++) {
        mockFetch.mockRejectedValueOnce(new Error("Network error"))
      }

      const resultPromise = source.lookup(mockActor)

      // Advance through retry delays
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(10000)
      }

      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })

    it("returns failure when no matching person found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            bindings: [],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No matching person found in Wikidata")
    })

    it("returns success with parsed data on valid response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            bindings: [
              {
                personLabel: { value: "John Smith" },
                causeOfDeathLabel: { value: "heart attack" },
                mannerOfDeathLabel: { value: "natural causes" },
                placeOfDeathLabel: { value: "Los Angeles" },
                deathDate: { value: "2024-06-01" },
                article: { value: "https://en.wikipedia.org/wiki/John_Smith" },
              },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("filters out invalid labels from response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            bindings: [
              {
                personLabel: { value: "John Smith" },
                // Invalid: URL instead of label
                causeOfDeathLabel: {
                  value: "http://www.wikidata.org/.well-known/genid/abc123",
                },
                // Invalid: raw entity ID
                mannerOfDeathLabel: { value: "Q12345" },
                // Valid label
                placeOfDeathLabel: { value: "Los Angeles" },
                deathDate: { value: "2024-06-01" },
              },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      // Valid label should be included
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
      // Circumstances should only include the valid place
      expect(result.data?.circumstances).toBe("Died in Los Angeles.")
    })
  })
})
