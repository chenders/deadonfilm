import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

import { BBCNewsBiographySource } from "./bbc-news.js"
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
 * Build a BBC-like HTML page with article content.
 */
function buildBBCPage(content: string, title = "John Wayne - BBC"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="BBC">
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

describe("BBCNewsBiographySource", () => {
  let source: BBCNewsBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new BBCNewsBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("BBC News")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.BBC_NEWS_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has TIER_1_NEWS reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
    })

    it("has 0.95 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.95)
    })
  })

  describe("lookup", () => {
    it("succeeds when DuckDuckGo returns BBC URL and page has content", async () => {
      const encodedUrl = encodeURIComponent("https://www.bbc.com/news/entertainment-john-wayne")

      // DuckDuckGo search response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne Profile - BBC News",
              snippet: "Profile of the American actor...",
            },
          ]),
      })

      // BBC page response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildBBCPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("BBC News")
      expect(result.data!.sourceType).toBe(BiographySourceType.BBC_NEWS_BIO)
      expect(result.data!.publication).toBe("BBC")
      expect(result.data!.domain).toBe("bbc.com")
      expect(result.data!.contentType).toBe("profile")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("matches bbc.co.uk URLs in addition to bbc.com", async () => {
      const encodedUrl = encodeURIComponent("https://www.bbc.co.uk/programmes/john-wayne-profile")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne - BBC",
              snippet: "Profile of the actor",
            },
          ]),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => buildBBCPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("bbc.co.uk")
    })

    it("returns failure when no DuckDuckGo results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No BBC News results found")
    })

    it("returns failure when DuckDuckGo results have no BBC URLs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: "https://www.example.com/john-wayne",
              title: "John Wayne Fan Page",
              snippet: "Not on BBC",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No BBC News results found")
    })

    it("returns failure when BBC page fetch fails", async () => {
      const encodedUrl = encodeURIComponent("https://www.bbc.com/news/john-wayne")

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
      const encodedUrl = encodeURIComponent("https://www.bbc.com/news/john-wayne-brief")

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

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent("https://www.bbc.com/news/john-wayne-profile")

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
        text: async () => buildBBCPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("BBC")
      expect(result.source.domain).toBe("bbc.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.url).toContain("bbc.com")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
      expect(result.source.reliabilityScore).toBe(0.95)
    })

    it("handles page fetch network errors", async () => {
      const encodedUrl = encodeURIComponent("https://www.bbc.com/news/john-wayne")

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
      const encodedUrl = encodeURIComponent("https://www.bbc.com/news/john-wayne")

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
        text: async () => buildBBCPage(richBiographicalContent),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
