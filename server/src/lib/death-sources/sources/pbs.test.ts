import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../logger.js", () => ({
  getEnrichmentLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

vi.mock("../archive-fallback.js", () => ({
  fetchFromArchive: vi.fn().mockResolvedValue({
    success: false,
    content: "",
    error: "Not available",
  }),
}))

vi.mock("./news-utils.js", async () => {
  const actual = await vi.importActual<typeof import("./news-utils.js")>("./news-utils.js")
  return {
    ...actual,
    searchWeb: vi
      .fn()
      .mockImplementation(
        async (query: string, options?: { userAgent?: string; signal?: AbortSignal }) => {
          const response = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            { headers: { "User-Agent": options?.userAgent || "test" }, signal: options?.signal }
          )
          if (!response.ok)
            return { html: "", engine: "duckduckgo" as const, error: `HTTP ${response.status}` }
          const html = await response.text()
          return { html, engine: "duckduckgo" as const }
        }
      ),
  }
})

import { PBSSource } from "./pbs.js"
import { fetchFromArchive } from "../archive-fallback.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("PBSSource", () => {
  let source: PBSSource

  beforeEach(() => {
    source = new PBSSource()
    ;(source as unknown as { minDelayMs: number }).minDelayMs = 0
    mockFetch.mockReset()
    vi.mocked(fetchFromArchive).mockReset()
    vi.mocked(fetchFromArchive).mockResolvedValue({
      success: false,
      url: "",
      archiveUrl: null,
      title: "",
      content: "",
      contentLength: 0,
      timestamp: null,
      error: "Not available",
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("PBS")
    })
    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.PBS)
    })
    it("is free", () => {
      expect(source.isFree).toBe(true)
    })
    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })
    it("is always available", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    const mockActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "John Smith",
      birthday: "1950-01-15",
      deathday: "2024-06-01",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 10.5,
    }

    it("returns early for living actors", async () => {
      const result = await source.lookup({ ...mockActor, deathday: null })
      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
    })

    it("finds obituary and extracts death information", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><body><a href="https://www.pbs.org/newshour/john-smith-obituary-2024">Obituary</a></body></html>`,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><body><p>John Smith died on June 1, 2024 at his home in Los Angeles after a battle with cancer.</p></body></html>`,
      })
      const result = await source.lookup(mockActor)
      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.PBS)
      expect(result.data?.circumstances).toContain("died")
    })

    it("returns error when no obituary found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })
      const result = await source.lookup(mockActor)
      expect(result.success).toBe(false)
      expect(result.error).toContain("No PBS obituary found")
    })

    it("tries archive.org fallback on 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><body><a href="https://www.pbs.org/newshour/john-smith/">Article</a></body></html>`,
      })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 403 })
      await expect(source.lookup(mockActor)).rejects.toThrow(SourceAccessBlockedError)
      expect(fetchFromArchive).toHaveBeenCalled()
    })

    it("returns error when article has no death info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><body><a href="https://www.pbs.org/newshour/john-smith/">Article</a></body></html>`,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body><p>John Smith discusses his career.</p></body></html>",
      })
      const result = await source.lookup(mockActor)
      expect(result.success).toBe(false)
      expect(result.error).toContain("No death information")
    })

    it("returns error when article fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          `<html><body><a href="https://www.pbs.org/newshour/john-smith/">Article</a></body></html>`,
      })
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 })
      const result = await source.lookup(mockActor)
      expect(result.success).toBe(false)
      expect(result.error).toBe("Could not fetch PBS article")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))
      const result = await source.lookup(mockActor)
      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
    })
  })
})
