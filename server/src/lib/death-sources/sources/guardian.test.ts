import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { GuardianSource } from "./guardian.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("GuardianSource", () => {
  let source: GuardianSource
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      GUARDIAN_API_KEY: "test-guardian-key",
    }
    source = new GuardianSource()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("isAvailable", () => {
    it("returns true when API key is configured", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when API key is missing", () => {
      delete process.env.GUARDIAN_API_KEY
      source = new GuardianSource()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("The Guardian")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.GUARDIAN)
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

    it("returns results on successful obituary search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            status: "ok",
            total: 1,
            results: [
              {
                id: "tone/obituaries/2024/jun/01/john-smith-obituary",
                type: "article",
                sectionId: "tone/obituaries",
                sectionName: "Obituaries",
                webPublicationDate: "2024-06-01T12:00:00Z",
                webTitle: "John Smith obituary",
                webUrl: "https://www.theguardian.com/tone/obituaries/2024/jun/01/john-smith",
                apiUrl: "https://content.guardianapis.com/...",
                fields: {
                  bodyText: "John Smith, who has died aged 74, was a legendary actor.",
                  standfirst: "Actor known for his memorable roles",
                  trailText: "John Smith died peacefully at his home in Los Angeles",
                },
              },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBeDefined()
      expect(result.source.url).toContain("theguardian.com")
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

    it("handles no results", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            status: "ok",
            total: 0,
            results: [],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No articles found")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })

    it("returns error when API key not configured", async () => {
      delete process.env.GUARDIAN_API_KEY
      source = new GuardianSource()

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not configured")
    })

    it("prioritizes obituary section articles", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            status: "ok",
            total: 2,
            results: [
              {
                id: "film/2024/jun/01/john-smith-dies",
                type: "article",
                sectionId: "film",
                sectionName: "Film",
                webPublicationDate: "2024-06-01T12:00:00Z",
                webTitle: "John Smith dies at 74",
                webUrl: "https://www.theguardian.com/film/2024/jun/01/john-smith-dies",
                fields: { bodyText: "News article about death" },
              },
              {
                id: "tone/obituaries/2024/jun/02/john-smith-obituary",
                type: "article",
                sectionId: "tone/obituaries",
                sectionName: "Obituaries",
                webPublicationDate: "2024-06-02T12:00:00Z",
                webTitle: "John Smith obituary",
                webUrl: "https://www.theguardian.com/tone/obituaries/john-smith",
                fields: { bodyText: "Detailed obituary with death circumstances" },
              },
            ],
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      // Should pick the obituary section article
      expect(result.source.url).toContain("obituaries")
    })
  })
})
