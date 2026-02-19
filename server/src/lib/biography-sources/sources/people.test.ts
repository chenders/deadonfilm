import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock searchDuckDuckGo to disable browser fallback in tests
vi.mock("../../shared/duckduckgo-search.js", async () => {
  const actual = await vi.importActual<typeof import("../../shared/duckduckgo-search.js")>(
    "../../shared/duckduckgo-search.js"
  )
  return {
    ...actual,
    searchDuckDuckGo: vi
      .fn()
      .mockImplementation((options: Record<string, unknown>) =>
        actual.searchDuckDuckGo({ ...options, useBrowserFallback: false })
      ),
  }
})

import { PeopleBiographySource } from "./people.js"
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
 * Build DuckDuckGo HTML with result blocks containing target domain URLs.
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
 * Build a People-like HTML page with article content.
 */
function buildPeoplePage(content: string, title = "John Wayne | People"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="People">
</head>
<body>
  <article>
    ${content}
  </article>
</body>
</html>`
}

const richBiographicalContent = `
<p>John Wayne was born Marion Robert Morrison on May 26, 1907, in Winterset, Iowa.
He grew up in California where his family moved when he was young. His childhood
was marked by a close relationship with his parents and early exposure to the outdoors.</p>

<p>Wayne attended Glendale High School, where he was a member of the football team.
He received a scholarship to attend the University of Southern California, where he
studied pre-law. His education was cut short when he lost his scholarship after a
bodysurfing injury.</p>

<p>His early life and personal struggles shaped his later career. Before fame, he worked
odd jobs and spent time on movie sets. He married three times and had seven children.
His family life was complex, balancing a demanding career with personal relationships.</p>
`

// ============================================================================
// Tests
// ============================================================================

describe("PeopleBiographySource", () => {
  let source: PeopleBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new PeopleBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("People")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.PEOPLE_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has MARGINAL_EDITORIAL reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.MARGINAL_EDITORIAL)
    })

    it("has 0.65 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.65)
    })
  })

  describe("lookup", () => {
    it("succeeds when DuckDuckGo returns People URL and page has content", async () => {
      const encodedUrl = encodeURIComponent("https://people.com/movies/john-wayne-personal-life")

      // DuckDuckGo search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne Personal Life | People",
              snippet: "Inside the personal life of John Wayne...",
            },
          ]),
      })

      // People page response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildPeoplePage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("People")
      expect(result.data!.sourceType).toBe(BiographySourceType.PEOPLE_BIO)
      expect(result.data!.publication).toBe("People")
      expect(result.data!.domain).toBe("people.com")
      expect(result.data!.contentType).toBe("profile")
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
      expect(result.error).toContain("No People results found")
    })

    it("returns failure when DuckDuckGo results have no people.com URLs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: "https://www.example.com/john-wayne",
              title: "John Wayne Fan Page",
              snippet: "Not on People",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No People results found")
    })

    it("returns failure when People page fetch fails", async () => {
      const encodedUrl = encodeURIComponent("https://people.com/movies/john-wayne")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Bio",
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
      const encodedUrl = encodeURIComponent("https://people.com/movies/john-wayne-brief")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Bio",
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

    it("detects DuckDuckGo CAPTCHA", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<html><body><div id="anomaly-modal"><p>Please verify</p></div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("CAPTCHA")
    })

    it("avoids gallery and video URLs", async () => {
      const galleryUrl = "https://people.com/gallery/john-wayne-photos"
      const profileUrl = "https://people.com/movies/john-wayne-personal-life"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: galleryUrl,
              title: "John Wayne Photos",
              snippet: "Gallery",
            },
            {
              url: profileUrl,
              title: "John Wayne Personal Life",
              snippet: "Profile",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildPeoplePage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(mockFetch.mock.calls[1][0]).toBe(profileUrl)
    })

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent("https://people.com/movies/john-wayne-profile")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Bio",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildPeoplePage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("People")
      expect(result.source.domain).toBe("people.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.url).toContain("people.com")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.MARGINAL_EDITORIAL)
      expect(result.source.reliabilityScore).toBe(0.65)
    })

    it("handles page fetch network errors", async () => {
      const encodedUrl = encodeURIComponent("https://people.com/movies/john-wayne")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Bio",
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
      const encodedUrl = encodeURIComponent("https://people.com/movies/john-wayne")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne",
              snippet: "Bio",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildPeoplePage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
