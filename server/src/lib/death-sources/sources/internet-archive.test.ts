import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock cache module before importing source
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock logger to avoid file operations during tests
vi.mock("../logger.js", () => ({
  getEnrichmentLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

// Mock AI helpers module
const mockAiSelectLinks = vi.fn()
vi.mock("../ai-helpers.js", () => ({
  aiSelectLinks: (...args: unknown[]) => mockAiSelectLinks(...args),
}))

import { InternetArchiveSource } from "./internet-archive.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("InternetArchiveSource", () => {
  let source: InternetArchiveSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new InternetArchiveSource()
    mockFetch.mockReset()
    mockAiSelectLinks.mockReset()
    // Clear ANTHROPIC_API_KEY by default (tests can set it when testing AI path)
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Internet Archive")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.INTERNET_ARCHIVE)
    })

    it("is marked as free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is available by default", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Bela Lugosi",
      birthday: "1882-10-20",
      deathday: "1956-08-16",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 22.0,
    }

    it("returns error when actor is not deceased", async () => {
      const livingActor = { ...testActor, deathday: null }
      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
    })

    it("returns error when search fails with HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Search failed")
    })

    it("returns error when no results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 0,
            start: 0,
            docs: [],
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No items found for this actor in Internet Archive")
    })

    it("extracts death info from archive document", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0, QTime: 100 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "bela-lugosi-biography-1960",
                title: "Bela Lugosi: The Man Behind the Cape",
                description:
                  "A biography of Bela Lugosi, covering his life and death in Hollywood. Lugosi died of a heart attack in Los Angeles in 1956.",
                creator: "Robert Cremer",
                date: "1960",
                year: 1960,
                mediatype: "texts",
                collection: ["americana"],
                subject: ["Bela Lugosi", "Hollywood", "actors", "death", "biography"],
                downloads: 500,
              },
            ],
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.INTERNET_ARCHIVE)
      expect(result.data?.circumstances).toBeTruthy()
    })

    it("extracts notable factors from document", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "test-doc",
                title: "Bela Lugosi",
                description:
                  "Bela Lugosi died of a heart attack. This biography covers his Hollywood career and sudden death.",
                mediatype: "texts",
                downloads: 100,
              },
            ],
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("heart condition")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })

    it("returns error when no relevant death record found in results", async () => {
      // Results exist but don't contain actor name or death keywords
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "random-doc",
                title: "Unrelated Document",
                description: "This document has nothing to do with the actor",
                mediatype: "texts",
                downloads: 50,
              },
            ],
          },
        }),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("No relevant death record found in search results")
    })

    it("handles single-word names without false positives", async () => {
      const singleNameActor: ActorForEnrichment = {
        id: 999,
        tmdbId: 888,
        name: "Prince",
        birthday: "1958-06-07",
        deathday: "2016-04-21",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 50.0,
      }

      // Document contains "Prince" in title but no death keywords
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "random-prince-doc",
                title: "The Little Prince Book",
                description: "A classic children's story",
                mediatype: "texts",
                downloads: 1000,
              },
            ],
          },
        }),
      })

      const result = await source.lookup(singleNameActor)

      // Should fail because document doesn't have death keywords
      expect(result.success).toBe(false)
      expect(result.error).toBe("No relevant death record found in search results")
    })
  })

  describe("AI-powered evaluation", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Bela Lugosi",
      birthday: "1882-10-20",
      deathday: "1956-08-16",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 22.0,
    }

    it("uses AI evaluation when ANTHROPIC_API_KEY is available", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 2,
            start: 0,
            docs: [
              {
                identifier: "doc-1",
                title: "Random document",
                description: "Not about Bela Lugosi",
                mediatype: "texts",
                downloads: 100,
              },
              {
                identifier: "lugosi-obit",
                title: "Bela Lugosi Obituary",
                description: "Bela Lugosi died in Hollywood after a heart attack.",
                mediatype: "texts",
                downloads: 200,
              },
            ],
          },
        }),
      })

      // AI selects the second doc as most relevant
      mockAiSelectLinks.mockResolvedValueOnce({
        data: [
          {
            url: "https://archive.org/details/lugosi-obit",
            score: 0.85,
            reason: "Obituary with death details",
          },
        ],
        costUsd: 0.001,
        model: "claude-sonnet-4-20250514",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
      })

      const result = await source.lookup(testActor)

      expect(mockAiSelectLinks).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("Bela Lugosi Obituary")
    })

    it("falls back to keyword matching when AI returns no results above threshold", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "lugosi-bio",
                title: "Bela Lugosi Biography",
                description: "Bela Lugosi died of heart failure in 1956.",
                mediatype: "texts",
                downloads: 300,
              },
            ],
          },
        }),
      })

      // AI returns results below threshold
      mockAiSelectLinks.mockResolvedValueOnce({
        data: [
          {
            url: "https://archive.org/details/lugosi-bio",
            score: 0.3, // Below MIN_AI_RELEVANCE_SCORE (0.5)
            reason: "Low relevance",
          },
        ],
        costUsd: 0.001,
        model: "claude-sonnet-4-20250514",
        inputTokens: 100,
        outputTokens: 50,
        latencyMs: 500,
      })

      const result = await source.lookup(testActor)

      expect(mockAiSelectLinks).toHaveBeenCalled()
      // AI said no relevant results, so should fail
      expect(result.success).toBe(false)
      expect(result.error).toBe("No relevant death record found in search results")
    })

    it("falls back to keyword matching when AI throws an error", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "lugosi-bio",
                title: "Bela Lugosi Biography",
                description: "Bela Lugosi died of heart failure in 1956.",
                mediatype: "texts",
                downloads: 300,
              },
            ],
          },
        }),
      })

      // AI throws an error
      mockAiSelectLinks.mockRejectedValueOnce(new Error("AI service unavailable"))

      const result = await source.lookup(testActor)

      expect(mockAiSelectLinks).toHaveBeenCalled()
      // Should fall back to keyword matching and succeed
      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("Bela Lugosi Biography")
    })

    it("uses keyword matching when ANTHROPIC_API_KEY is not set", async () => {
      // Ensure API key is not set
      delete process.env.ANTHROPIC_API_KEY

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          responseHeader: { status: 0 },
          response: {
            numFound: 1,
            start: 0,
            docs: [
              {
                identifier: "lugosi-bio",
                title: "Bela Lugosi Biography",
                description: "Bela Lugosi died of heart failure in 1956.",
                mediatype: "texts",
                downloads: 300,
              },
            ],
          },
        }),
      })

      const result = await source.lookup(testActor)

      // AI should not be called
      expect(mockAiSelectLinks).not.toHaveBeenCalled()
      // Keyword matching should succeed
      expect(result.success).toBe(true)
    })
  })
})
