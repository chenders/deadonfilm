import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { LegacyBiographySource } from "./legacy.js"
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
 * Build DuckDuckGo HTML with result blocks containing legacy.com URLs.
 */
function buildDuckDuckGoHtml(urls: Array<{ url: string; title: string; snippet: string }>): string {
  const results = urls
    .map(
      ({ url, title, snippet }) => `
      <div class="result results_links results_links_deep web-result">
        <a class="result__a" href="${url}">${title}</a>
        <a class="result__url" href="${url}">${url}</a>
        <a class="result__snippet">${snippet}</a>
      </div></div>`
    )
    .join("")

  return `<html><body>${results}</body></html>`
}

/**
 * Build a Legacy.com-like obituary page with article content.
 */
function buildLegacyPage(content: string, title = "John Wayne Obituary"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="Legacy.com">
</head>
<body>
  <article>
    ${content}
  </article>
</body>
</html>`
}

const richBiographicalContent = `
<p>John Wayne, born Marion Robert Morrison on May 26, 1907, in Winterset, Iowa, passed
away on June 11, 1979. He grew up in California where his family moved when he was young.
His childhood was marked by a close relationship with his parents.</p>

<p>Wayne attended Glendale High School, where he excelled on the football team and earned
a scholarship to the University of Southern California. His education was cut short when
he lost his scholarship after a bodysurfing injury.</p>

<p>Before fame, he worked odd jobs on movie sets. He married three times and had seven
children. His family will remember his dedication to personal values and his love
of the outdoors.</p>

<p>He is survived by his children, grandchildren, and many devoted fans worldwide.</p>
`

// ============================================================================
// Tests
// ============================================================================

describe("LegacyBiographySource", () => {
  let source: LegacyBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new LegacyBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Legacy.com")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.LEGACY_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has MARGINAL_MIXED reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.MARGINAL_MIXED)
    })

    it("has correct reliability score", () => {
      expect(source.reliabilityScore).toBe(0.6)
    })
  })

  describe("lookup", () => {
    it("succeeds when DuckDuckGo returns Legacy.com URL and page has content", async () => {
      const encodedUrl = encodeURIComponent("https://www.legacy.com/us/obituaries/john-wayne-12345")

      // DuckDuckGo search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne Obituary",
              snippet: "Born in Winterset, Iowa...",
            },
          ]),
      })

      // Legacy.com page response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildLegacyPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Legacy.com")
      expect(result.data!.sourceType).toBe(BiographySourceType.LEGACY_BIO)
      expect(result.data!.publication).toBe("Legacy.com")
      expect(result.data!.domain).toBe("legacy.com")
      expect(result.data!.contentType).toBe("obituary")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no DuckDuckGo results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Legacy.com results found")
    })

    it("returns failure when DuckDuckGo results have no legacy.com URLs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: "https://www.example.com/john-wayne",
              title: "John Wayne Fan Page",
              snippet: "Not on Legacy.com",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Legacy.com results found")
    })

    it("returns failure when Legacy.com page fetch fails", async () => {
      const encodedUrl = encodeURIComponent("https://www.legacy.com/us/obituaries/john-wayne-12345")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne Obituary",
              snippet: "Obituary",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 403")
    })

    it("returns failure when cleaned content is too short", async () => {
      const encodedUrl = encodeURIComponent("https://www.legacy.com/us/obituaries/john-wayne-12345")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Obit",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><p>Short text.</p></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("detects DuckDuckGo CAPTCHA (anomaly-modal)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<html><body><div id="anomaly-modal"><p>Please verify</p></div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("CAPTCHA")
    })

    it("detects DuckDuckGo CAPTCHA (bots message)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><p>bots use DuckDuckGo too</p></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("CAPTCHA")
    })

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent("https://www.legacy.com/us/obituaries/john-wayne-12345")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne Obituary",
              snippet: "Obit",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildLegacyPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("Legacy.com")
      expect(result.source.domain).toBe("legacy.com")
      expect(result.source.contentType).toBe("obituary")
      expect(result.source.url).toContain("legacy.com")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.MARGINAL_MIXED)
      expect(result.source.reliabilityScore).toBe(0.6)
    })

    it("prefers /obituaries/ paths over other URLs", async () => {
      const obituaryUrl = "https://www.legacy.com/us/obituaries/john-wayne-12345"
      const otherUrl = "https://www.legacy.com/us/guestbooks/john-wayne-12345"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: otherUrl,
              title: "John Wayne Guestbook",
              snippet: "Guest messages",
            },
            {
              url: obituaryUrl,
              title: "John Wayne Obituary",
              snippet: "Full obituary",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildLegacyPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Should have fetched the /obituaries/ URL
      expect(mockFetch.mock.calls[1][0]).toBe(obituaryUrl)
    })

    it("handles page fetch network errors", async () => {
      const encodedUrl = encodeURIComponent("https://www.legacy.com/us/obituaries/john-wayne-12345")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Obit",
            },
          ]),
      })

      mockFetch.mockRejectedValueOnce(new Error("Connection reset"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Connection reset")
    })

    it("handles DuckDuckGo search HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("DuckDuckGo search failed")
    })

    it("calculates biographical confidence from content", async () => {
      const encodedUrl = encodeURIComponent("https://www.legacy.com/us/obituaries/john-wayne-12345")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Obit",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildLegacyPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Content contains: "born" (not "born in"), "grew up" (required), "parents" (required),
      // "childhood" (required), "school" (required), "scholarship" (bonus),
      // "family" (required), "married" (required), "children" (bonus), "personal" (required)
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
