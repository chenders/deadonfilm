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

import { IBDBSource } from "./ibdb.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("IBDBSource", () => {
  let source: IBDBSource

  beforeEach(() => {
    source = new IBDBSource()
    mockFetch.mockReset()
    mockFetchFromArchive.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("IBDB (Broadway)")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.IBDB)
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
      name: "Angela Lansbury",
      birthday: "1925-10-16",
      deathday: "2022-10-11",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 15.5,
    }

    it("finds actor via DuckDuckGo search and extracts data", async () => {
      // DuckDuckGo search returns IBDB URL
      const searchHtml = `
        <html><body>
          <a href="https://www.ibdb.com/broadway-cast-staff/angela-lansbury-12345">Angela Lansbury</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Person page
      const personHtml = `
        <html>
          <head><title>Angela Lansbury</title></head>
          <body>
            <p>(1925 - 2022)</p>
            <a href="/broadway-production/mame-12345">Mame</a>
            <a href="/broadway-production/sweeney-todd-67890">Sweeney Todd</a>
            <span>Tony Award Winner</span>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => personHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.IBDB)
      expect(result.data?.notableFactors).toContain("broadway")
    })

    it("throws SourceAccessBlockedError on 403 from DuckDuckGo search", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 403 from person page when archive fails", async () => {
      // DuckDuckGo search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.ibdb.com/broadway-cast-staff/angela-lansbury-12345">Angela Lansbury</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Person page returns 403
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

    it("falls back to archive.org when person page returns 403", async () => {
      // DuckDuckGo search succeeds
      const searchHtml = `
        <html><body>
          <a href="https://www.ibdb.com/broadway-cast-staff/angela-lansbury-12345">Angela Lansbury</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Person page returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      // Archive fallback returns content
      mockFetchFromArchive.mockResolvedValueOnce({
        success: true,
        content: `
          <html>
            <head><title>Angela Lansbury</title></head>
            <body>
              <p>(1925 - 2022)</p>
              <a href="/broadway-production/mame-12345">Mame</a>
            </body>
          </html>
        `,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(mockFetchFromArchive).toHaveBeenCalled()
      expect(result.data?.notableFactors).toContain("broadway")
    })

    it("returns error when search returns HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("HTTP 500")
    })

    it("returns error when actor not found in search results", async () => {
      const searchHtml = `
        <html><body>
          <p>No relevant results</p>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("returns error when no search results at all", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results found</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("extracts birth and death dates from person page", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.ibdb.com/broadway-cast-staff/test-actor-12345">Test Actor</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const personHtml = `
        <html>
          <head><title>Test Actor</title></head>
          <body>
            <p>Born: January 15, 1950</p>
            <p>Died: March 20, 2020</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => personHtml,
      })

      const actor: ActorForEnrichment = {
        id: 1,
        tmdbId: 2,
        name: "Test Actor",
        birthday: "1950-01-15",
        deathday: "2020-03-20",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 5,
      }

      const result = await source.lookup(actor)

      expect(result.success).toBe(true)
      // Higher confidence when dates found
      expect(result.source.confidence).toBeGreaterThan(0.4)
    })

    it("extracts Broadway credits as notable roles", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.ibdb.com/broadway-cast-staff/angela-lansbury-12345">Angela Lansbury</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const personHtml = `
        <html>
          <head><title>Angela Lansbury</title></head>
          <body>
            <a href="/broadway-production/mame-12345">Mame</a>
            <a href="/broadway-production/sweeney-todd-67890">Sweeney Todd</a>
            <a href="/broadway-production/gypsy-11111">Gypsy</a>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => personHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.additionalContext).toContain("Broadway credits")
    })

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network timeout")
    })

    it("handles person page parse failures gracefully", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.ibdb.com/broadway-cast-staff/angela-lansbury-12345">Angela Lansbury</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      // Person page returns error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("parse")
    })
  })

  describe("data returned", () => {
    it("does not include circumstances (IBDB does not have this)", async () => {
      const searchHtml = `
        <html><body>
          <a href="https://www.ibdb.com/broadway-cast-staff/test-actor-12345">Test Actor</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      })

      const personHtml = `
        <html>
          <head><title>Test Actor</title></head>
          <body>(1950-2020)</body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => personHtml,
      })

      const actor: ActorForEnrichment = {
        id: 1,
        tmdbId: 2,
        name: "Test Actor",
        birthday: "1950-01-01",
        deathday: "2020-01-01",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 5,
      }

      const result = await source.lookup(actor)

      expect(result.success).toBe(true)
      // IBDB doesn't provide death circumstances
      expect(result.data?.circumstances).toBeNull()
      // But does provide theater context
      expect(result.data?.notableFactors).toContain("broadway")
      expect(result.data?.notableFactors).toContain("theater")
    })
  })
})
