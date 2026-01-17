import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NYTimesSource } from "./nytimes.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock the cache module
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

describe("NYTimesSource", () => {
  let source: NYTimesSource
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    process.env = {
      ...originalEnv,
      NYTIMES_API_KEY: "test-nyt-key",
    }
    source = new NYTimesSource()
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env = originalEnv
  })

  describe("isAvailable", () => {
    it("returns true when API key is configured", () => {
      expect(source.isAvailable()).toBe(true)
    })

    it("returns false when API key is missing", () => {
      delete process.env.NYTIMES_API_KEY
      source = new NYTimesSource()
      expect(source.isAvailable()).toBe(false)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("New York Times")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.NYTIMES)
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
          status: "OK",
          response: {
            docs: [
              {
                web_url: "https://www.nytimes.com/2024/06/01/obituaries/john-smith-dead.html",
                snippet: "John Smith, a celebrated actor, died on Saturday.",
                lead_paragraph:
                  "John Smith, who appeared in dozens of films, died of natural causes at his home in Los Angeles.",
                abstract: "Obituary for John Smith, actor",
                headline: { main: "John Smith, Beloved Actor, Dies at 74" },
                pub_date: "2024-06-01T12:00:00Z",
                document_type: "article",
                news_desk: "Obituaries",
                section_name: "Obituaries",
                type_of_material: "Obituary (Obit)",
                keywords: [],
              },
            ],
            meta: { hits: 1, offset: 0 },
          },
        }),
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toBeDefined()
      expect(result.source.url).toContain("nytimes.com")
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
      expect(result.error).toContain("Invalid NYT API key")
    })

    it("handles no results with fallback search", async () => {
      // First search returns no results
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
      // Fallback search also returns no results
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

      const resultPromise = source.lookup(mockActor)
      // Advance timers to skip rate limiting
      await vi.advanceTimersByTimeAsync(15000)
      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error).toContain("No obituary")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const resultPromise = source.lookup(mockActor)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })

    it("returns error when API key not configured", async () => {
      delete process.env.NYTIMES_API_KEY
      source = new NYTimesSource()

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not configured")
    })

    it("prioritizes obituary articles over regular articles", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          response: {
            docs: [
              {
                web_url: "https://www.nytimes.com/2024/06/01/arts/john-smith-dies.html",
                snippet: "News of death",
                lead_paragraph: "John Smith died yesterday",
                headline: { main: "John Smith Dies" },
                type_of_material: "News",
                news_desk: "Arts",
                keywords: [],
              },
              {
                web_url: "https://www.nytimes.com/2024/06/02/obituaries/john-smith-obit.html",
                snippet: "Detailed obituary",
                lead_paragraph: "John Smith, actor, died of cancer at 74.",
                headline: { main: "John Smith, Actor" },
                type_of_material: "Obituary (Obit)",
                news_desk: "Obituaries",
                keywords: [],
              },
            ],
            meta: { hits: 2, offset: 0 },
          },
        }),
      })

      const resultPromise = source.lookup(mockActor)
      await vi.advanceTimersByTimeAsync(1000)
      const result = await resultPromise

      expect(result.success).toBe(true)
      // Should prioritize the obituary
      expect(result.source.url).toContain("obituaries")
    })

    it("uses date filtering when death year is known", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          response: { docs: [], meta: { hits: 0, offset: 0 } },
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          response: { docs: [], meta: { hits: 0, offset: 0 } },
        }),
      })

      const resultPromise = source.lookup(mockActor)
      await vi.advanceTimersByTimeAsync(15000)
      await resultPromise

      // Check that the URL includes date filtering
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain("begin_date=20230101")
      expect(callUrl).toContain("end_date=20251231")
    })
  })
})
