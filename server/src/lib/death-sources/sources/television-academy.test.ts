import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { TelevisionAcademySource } from "./television-academy.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("TelevisionAcademySource", () => {
  let source: TelevisionAcademySource

  beforeEach(() => {
    source = new TelevisionAcademySource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Television Academy In Memoriam")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.TELEVISION_ACADEMY)
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
      name: "Betty White",
      birthday: "1922-01-17",
      deathday: "2021-12-31",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 20.5,
    }

    it("finds actor via direct bio URL", async () => {
      // First HEAD request to check direct URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      // Bio page fetch
      const bioPageHtml = `
        <html>
          <head><title>Betty White | Television Academy</title></head>
          <body>
            <div class="bio">
              <p>Born: January 17, 1922</p>
              <p>Died: December 31, 2021</p>
              <p>Betty White was a beloved actress and comedian.</p>
            </div>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => bioPageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.TELEVISION_ACADEMY)
    })

    it("falls back to in memoriam search when direct URL fails", async () => {
      // First HEAD request returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      // In memoriam page with actor link
      const inMemoriamHtml = `
        <html><body>
          <a href="/bios/betty-white">Betty White</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => inMemoriamHtml,
      })

      // Bio page fetch
      const bioPageHtml = `
        <html>
          <head><title>Betty White</title></head>
          <body>
            <p>Betty White was an iconic actress known for The Golden Girls.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => bioPageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
    })

    it("returns error when actor not found", async () => {
      // Direct URL returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      // In memoriam page with no matching links
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>No results</body></html>",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("not found")
    })

    it("throws SourceAccessBlockedError on 403", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("extracts birth and death dates from bio page", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      const bioPageHtml = `
        <html>
          <head><title>Betty White</title></head>
          <body>
            <p>Born: January 17, 1922</p>
            <p>Died: December 31, 2021</p>
            <div class="bio">
              <p>Betty White was an Emmy Award-winning actress and comedian
              known for her roles in The Mary Tyler Moore Show and The Golden Girls.</p>
            </div>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => bioPageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.confidence).toBeGreaterThan(0.4)
    })

    it("extracts external obituary links", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      const bioPageHtml = `
        <html>
          <head><title>Betty White</title></head>
          <body>
            <p>Born: January 17, 1922</p>
            <p>Died: December 31, 2021</p>
            <a href="https://www.hollywoodreporter.com/news/betty-white-obituary">Hollywood Reporter Obituary</a>
            <a href="https://variety.com/2021/tv/news/betty-white-dead-obituary">Variety Obituary</a>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => bioPageHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.additionalContext).toContain("obituaries")
    })

    it("handles network errors gracefully", async () => {
      // First fetch (HEAD to direct bio URL) fails
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"))
      // Second fetch (in memoriam page fallback) also fails
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      // The error comes from the "actor not found" path since both fetches failed
      expect(result.error).toContain("not found")
    })

    it("handles bio page parse errors gracefully", async () => {
      // Direct URL success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      // Bio page fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("parse")
    })
  })

  describe("name to slug conversion", () => {
    it("handles simple names", async () => {
      const actor: ActorForEnrichment = {
        id: 1,
        tmdbId: 2,
        name: "John Smith",
        birthday: "1950-01-01",
        deathday: "2020-01-01",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 5,
      }

      // Check that it tries the expected URL format
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body></body></html>",
      })

      await source.lookup(actor)

      // First call should be HEAD to /bios/john-smith
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/bios/john-smith"),
        expect.any(Object)
      )
    })

    it("handles names with apostrophes", async () => {
      const actor: ActorForEnrichment = {
        id: 1,
        tmdbId: 2,
        name: "Sinéad O'Connor",
        birthday: "1966-12-08",
        deathday: "2023-07-26",
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 5,
      }

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body></body></html>",
      })

      await source.lookup(actor)

      // Should handle apostrophe in name
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  describe("bio link matching", () => {
    it("matches bio links by name similarity", async () => {
      const actor: ActorForEnrichment = {
        id: 1,
        tmdbId: 2,
        name: "Michael J. Fox",
        birthday: "1961-06-09",
        deathday: null,
        causeOfDeath: null,
        causeOfDeathDetails: null,
        popularity: 10,
      }

      // Direct URL fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      // In memoriam page with similar link
      const inMemoriamHtml = `
        <html><body>
          <a href="/bios/michael-fox">Michael Fox</a>
          <a href="/bios/jane-doe">Jane Doe</a>
        </body></html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => inMemoriamHtml,
      })

      // Bio page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => "<html><body>Bio content</body></html>",
      })

      await source.lookup(actor)

      // Should find the michael-fox link based on last name
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })
})
