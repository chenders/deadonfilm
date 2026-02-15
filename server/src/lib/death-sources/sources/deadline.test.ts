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

// Mock archive fallback
const mockFetchFromArchive = vi.fn()
vi.mock("../archive-fallback.js", () => ({
  fetchFromArchive: (...args: unknown[]) => mockFetchFromArchive(...args),
}))

import { DeadlineSource } from "./deadline.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("DeadlineSource", () => {
  let source: DeadlineSource

  beforeEach(() => {
    source = new DeadlineSource()
    mockFetch.mockReset()
    mockFetchFromArchive.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Deadline")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.DEADLINE)
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
      name: "Lance Reddick",
      birthday: "1962-12-31",
      deathday: "2023-03-17",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 25.0,
    }

    it("returns early for living actors", async () => {
      const livingActor: ActorForEnrichment = {
        ...testActor,
        deathday: null,
      }

      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("returns early for deaths before 2006", async () => {
      const oldActor: ActorForEnrichment = {
        ...testActor,
        name: "Christopher Reeve",
        deathday: "2004-10-10",
      }

      const result = await source.lookup(oldActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Deadline was not founded until 2006")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("finds obituary and extracts death information", async () => {
      // Search returns Deadline URL
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/lance-reddick-dead-the-wire-john-wick-actor/">
            Lance Reddick Dead: 'The Wire' & 'John Wick' Actor Was 60
          </a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article with death info
      const articleHtml = `
        <html>
          <body>
            <article>
              <p>Lance Reddick, the imposing actor best known for his roles in "The Wire"
              and the "John Wick" franchise, died on March 17. He was 60.</p>
              <p>Reddick died of natural causes at his home in Los Angeles, according to
              his publicist.</p>
            </article>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.DEADLINE)
      expect(result.data?.circumstances).toContain("died")
    })

    it("returns error when no obituary found in search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Deadline obituary found")
    })

    it("throws SourceAccessBlockedError on 403 during search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 403 during article fetch", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/lance-reddick-dead/">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      // Archive fallback also fails
      mockFetchFromArchive.mockResolvedValueOnce({
        success: false,
        content: null,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("tries archive.org fallback when article returns 403", async () => {
      // Search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/lance-reddick-dead/">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      // Archive fallback returns content
      mockFetchFromArchive.mockResolvedValueOnce({
        success: true,
        content: `
          <html><body>
            <p>Lance Reddick died on March 17. He was 60.</p>
          </body></html>
        `,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(mockFetchFromArchive).toHaveBeenCalled()
      expect(result.data?.circumstances).toContain("died")
    })

    it("returns error when article has no death info", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/lance-reddick-interview/">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html>
          <body>
            <p>Lance Reddick discusses his role in the upcoming John Wick sequel.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No death information")
    })

    it("extracts location of death", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/actor-dies/">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html>
          <body>
            <p>Reddick died in Los Angeles from natural causes.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("extracts notable factors", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/actor-dies/">Obituary</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html>
          <body>
            <p>Reddick died suddenly and unexpectedly at his home.
            His death came as a tragedy to the industry. An autopsy
            was requested by the family.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.notableFactors).toContain("sudden")
      expect(result.data?.notableFactors).toContain("unexpected")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })

    it("returns error when search fails with non-403 status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Search failed: HTTP 500")
    })

    it("returns error when article fetch fails with non-403 status", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/lance-reddick-dead/">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Article returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Could not fetch Deadline article")
    })

    it("prefers death-related URLs over other article types", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/lance-reddick-interview/">Interview</a>
          <a href="https://deadline.com/2023/03/lance-reddick-dead-dies/">Death News</a>
          <a href="https://deadline.com/2023/03/lance-reddick-review/">Review</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html><body><p>Reddick died on March 17.</p></body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      await source.lookup(testActor)

      // Should fetch the death URL, not the interview
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("dead"),
        expect.any(Object)
      )
    })

    it("identifies actor references with 'the star'", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://deadline.com/2023/03/actor-dies/">Article</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const articleHtml = `
        <html>
          <body>
            <p>Lance Reddick, the star of The Wire, died peacefully at home surrounded by family.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("died peacefully")
    })
  })
})
