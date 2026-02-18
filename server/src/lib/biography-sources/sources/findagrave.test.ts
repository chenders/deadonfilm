import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { FindAGraveBiographySource } from "./findagrave.js"
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

/**
 * Build Find a Grave search results page.
 */
function buildSearchResults(memorials: Array<{ id: number; name: string }>): string {
  const results = memorials
    .map(
      ({ id, name }) =>
        `<a href="/memorial/${id}/${name.toLowerCase().replace(/\s+/g, "-")}" class="memorial-item">${name}</a>`
    )
    .join("")

  return `<html><body><div class="search-results">${results}</div></body></html>`
}

/**
 * Build a Find a Grave memorial page with bio content.
 */
function buildMemorialPage(bioContent: string, title = "John Wayne Memorial"): string {
  return `<html>
<head><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  <div id="bio">${bioContent}</div>
</body>
</html>`
}

const richBiographicalContent = `
<p>John Wayne, born Marion Robert Morrison on May 26, 1907, in Winterset, Iowa.
He grew up in Glendale, California where his parents moved the family when he was young.
His childhood was spent exploring the outdoors and playing sports.</p>

<p>Wayne attended Glendale High School where he excelled in football. He won a
scholarship to the University of Southern California. Before fame, he worked as a
prop boy at Fox Studios. He married three times and had seven children.</p>

<p>His personal life was as colorful as his screen persona. He was deeply devoted
to his family and known for his generosity to friends and strangers alike.</p>
`

// ============================================================================
// Tests
// ============================================================================

describe("FindAGraveBiographySource", () => {
  let source: FindAGraveBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new FindAGraveBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Find a Grave")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.FINDAGRAVE_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has UNRELIABLE_UGC reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.UNRELIABLE_UGC)
    })

    it("has 0.35 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.35)
    })
  })

  describe("lookup", () => {
    it("succeeds when memorial found with bio content", async () => {
      // Search results page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildSearchResults([{ id: 12345, name: "John Wayne" }]),
      })

      // Memorial page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildMemorialPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Find a Grave")
      expect(result.data!.sourceType).toBe(BiographySourceType.FINDAGRAVE_BIO)
      expect(result.data!.publication).toBe("Find a Grave")
      expect(result.data!.domain).toBe("findagrave.com")
      expect(result.data!.contentType).toBe("obituary")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("rejects single-name actors", async () => {
      const singleNameActor: ActorForBiography = {
        ...testActor,
        name: "Cher",
      }

      const result = await source.lookup(singleNameActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("single name")
    })

    it("returns failure when no matching memorial found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildSearchResults([{ id: 99999, name: "Jane Smith" }]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No matching memorial found")
    })

    it("matches memorial URL by first AND last name", async () => {
      // Memorial with different name ordering in URL
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<html><body><a href="/memorial/12345/wayne-john-m">Wayne, John M.</a></body></html>`,
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildMemorialPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // The URL contains both "john" and "wayne" so it should match
      expect(mockFetch.mock.calls[1][0]).toContain("/memorial/12345/")
    })

    it("returns failure when search HTTP fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 500")
    })

    it("returns failure when memorial page HTTP fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildSearchResults([{ id: 12345, name: "John Wayne" }]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 403")
    })

    it("returns failure when no bio section found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildSearchResults([{ id: 12345, name: "John Wayne" }]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><h1>John Wayne</h1><p>No bio section here</p></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No bio section found")
    })

    it("returns failure when bio content is too short", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildSearchResults([{ id: 12345, name: "John Wayne" }]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildMemorialPage("<p>Born 1907.</p>"),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Connection refused")
    })

    it("returns no results when search page has no memorial links", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div>No results found</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No matching memorial found")
    })

    it("sets correct source metadata on success", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildSearchResults([{ id: 12345, name: "John Wayne" }]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildMemorialPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("Find a Grave")
      expect(result.source.domain).toBe("findagrave.com")
      expect(result.source.contentType).toBe("obituary")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.UNRELIABLE_UGC)
      expect(result.source.reliabilityScore).toBe(0.35)
    })
  })
})
