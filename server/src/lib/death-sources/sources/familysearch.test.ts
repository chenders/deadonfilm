import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FamilySearchSource } from "./familysearch.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("FamilySearchSource", () => {
  let source: FamilySearchSource
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      FAMILYSEARCH_API_KEY: "test-familysearch-key",
    }
    source = new FamilySearchSource()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("isAvailable", () => {
    it("returns true when API key is configured", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when API key is missing", () => {
      delete process.env.FAMILYSEARCH_API_KEY
      source = new FamilySearchSource()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("FamilySearch")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.FAMILYSEARCH)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
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

    it("returns results on successful search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            {
              id: "KWQJ-ABC",
              content: {
                gedcomx: {
                  persons: [
                    {
                      id: "KWQJ-ABC",
                      display: {
                        name: "John Smith",
                        birthDate: "15 January 1950",
                        birthPlace: "New York, New York, United States",
                        deathDate: "1 June 2024",
                        deathPlace: "Los Angeles, California, United States",
                        lifespan: "1950-2024",
                      },
                      facts: [
                        {
                          type: "http://gedcomx.org/Death",
                          date: { original: "1 June 2024" },
                          place: { original: "Los Angeles, California" },
                        },
                        {
                          type: "http://gedcomx.org/Burial",
                          place: { original: "Forest Lawn Memorial Park" },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("Died")
      expect(result.data?.locationOfDeath).toContain("Los Angeles")
      expect(result.source.url).toContain("familysearch.org")
    })

    it("handles rate limit error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("rate limit")
    })

    it("handles invalid API key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid FamilySearch API key")
    })

    it("handles no matches found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [],
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No matching person found")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })

    it("returns error when API key not configured", async () => {
      delete process.env.FAMILYSEARCH_API_KEY
      source = new FamilySearchSource()

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not configured")
    })

    it("filters out entries without death information", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            {
              id: "LIVING-123",
              content: {
                gedcomx: {
                  persons: [
                    {
                      id: "LIVING-123",
                      display: {
                        name: "John Smith",
                        birthDate: "1950",
                        // No death date - still living
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No matching deceased person")
    })

    it("scores matches by name and date accuracy", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            {
              id: "WRONG-123",
              content: {
                gedcomx: {
                  persons: [
                    {
                      id: "WRONG-123",
                      display: {
                        name: "Johnny Smithson",
                        birthDate: "1960",
                        deathDate: "2020",
                      },
                    },
                  ],
                },
              },
            },
            {
              id: "RIGHT-456",
              content: {
                gedcomx: {
                  persons: [
                    {
                      id: "RIGHT-456",
                      display: {
                        name: "John Smith",
                        birthDate: "1950",
                        deathDate: "2024",
                        deathPlace: "Los Angeles",
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // Should pick the better match
      expect(result.source.url).toContain("RIGHT-456")
    })

    it("extracts burial information as additional context", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            {
              id: "KWQJ-ABC",
              content: {
                gedcomx: {
                  persons: [
                    {
                      id: "KWQJ-ABC",
                      display: {
                        name: "John Smith",
                        deathDate: "2024",
                      },
                      facts: [
                        {
                          type: "http://gedcomx.org/Death",
                          date: { original: "2024" },
                        },
                        {
                          type: "http://gedcomx.org/Burial",
                          place: { original: "Hollywood Forever Cemetery" },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.additionalContext).toContain("Hollywood Forever Cemetery")
    })

    it("increases confidence when death year matches", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            {
              id: "MATCH-123",
              content: {
                gedcomx: {
                  persons: [
                    {
                      id: "MATCH-123",
                      display: {
                        name: "John Smith",
                        deathDate: "2024", // Matches mockActor.deathday year
                        deathPlace: "Los Angeles",
                      },
                    },
                  ],
                },
              },
            },
          ],
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.source.confidence).toBeGreaterThanOrEqual(0.6) // Base + death year match
    })
  })
})
