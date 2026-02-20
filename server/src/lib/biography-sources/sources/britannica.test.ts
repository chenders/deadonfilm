import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally (used by DDG search internally)
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock cache (must be before source import)
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock webSearch to use DDG-only search with browser fallback disabled in tests
vi.mock("../../shared/duckduckgo-search.js", async () => {
  const actual = await vi.importActual<typeof import("../../shared/duckduckgo-search.js")>(
    "../../shared/duckduckgo-search.js"
  )
  return {
    ...actual,
    webSearch: vi
      .fn()
      .mockImplementation(
        (options: import("../../shared/duckduckgo-search.js").DuckDuckGoSearchOptions) =>
          actual.searchDuckDuckGo({ ...options, useBrowserFallback: false })
      ),
  }
})

// Mock fetchPageWithFallbacks for controlled page fetch responses
const mockFetchPage = vi.fn()
vi.mock("../../shared/fetch-page-with-fallbacks.js", () => ({
  fetchPageWithFallbacks: (...args: unknown[]) => mockFetchPage(...args),
}))

import { BritannicaBiographySource } from "./britannica.js"
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
 * Build DuckDuckGo HTML with result blocks containing britannica.com URLs.
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
 * Build a Britannica-like HTML page with article content.
 */
function buildBritannicaPage(content: string, title = "John Wayne | Biography"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="Encyclopaedia Britannica">
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

describe("BritannicaBiographySource", () => {
  let source: BritannicaBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new BritannicaBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Britannica")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.BRITANNICA)
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
    it("succeeds when web search returns Britannica URL and page has content", async () => {
      const encodedUrl = encodeURIComponent("https://www.britannica.com/biography/John-Wayne")

      // Web search response (DDG fetch internally)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne | Biography & Films",
              snippet: "American actor born in Iowa...",
            },
          ]),
      })

      // Page fetch via fetchPageWithFallbacks mock
      mockFetchPage.mockResolvedValueOnce({
        content: buildBritannicaPage(richBiographicalContent),
        title: "John Wayne | Biography",
        url: "https://www.britannica.com/biography/John-Wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Britannica")
      expect(result.data!.sourceType).toBe(BiographySourceType.BRITANNICA)
      expect(result.data!.publication).toBe("Encyclopaedia Britannica")
      expect(result.data!.domain).toBe("britannica.com")
      expect(result.data!.contentType).toBe("biography")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.text).toContain("scholarship")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no web search results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Britannica results found")
    })

    it("returns failure when web search results have no britannica.com URLs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: "https://www.example.com/john-wayne",
              title: "John Wayne Fan Page",
              snippet: "Not on Britannica",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Britannica results found")
    })

    it("returns failure when Britannica page fetch fails", async () => {
      const encodedUrl = encodeURIComponent("https://www.britannica.com/biography/John-Wayne")

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

      mockFetchPage.mockResolvedValueOnce({
        content: "",
        title: "",
        url: "https://www.britannica.com/biography/John-Wayne",
        fetchMethod: "direct",
        error: "HTTP 403",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 403")
    })

    it("returns failure when cleaned content is too short", async () => {
      const encodedUrl = encodeURIComponent("https://www.britannica.com/biography/John-Wayne")

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

      mockFetchPage.mockResolvedValueOnce({
        content: `<html><body><p>Short text.</p></body></html>`,
        title: "John Wayne",
        url: "https://www.britannica.com/biography/John-Wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("detects web search CAPTCHA (anomaly-modal)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          `<html><body><div id="anomaly-modal"><p>Please verify</p></div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("CAPTCHA")
    })

    it("detects web search CAPTCHA (bots message)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><p>bots use DuckDuckGo too</p></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("CAPTCHA")
    })

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent("https://www.britannica.com/biography/John-Wayne")

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

      mockFetchPage.mockResolvedValueOnce({
        content: buildBritannicaPage(richBiographicalContent),
        title: "John Wayne | Biography",
        url: "https://www.britannica.com/biography/John-Wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("Encyclopaedia Britannica")
      expect(result.source.domain).toBe("britannica.com")
      expect(result.source.contentType).toBe("biography")
      expect(result.source.url).toContain("britannica.com")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.TIER_1_NEWS)
      expect(result.source.reliabilityScore).toBe(0.95)
    })

    it("cleans DuckDuckGo redirect URLs correctly", async () => {
      const targetUrl = "https://www.britannica.com/biography/John-Wayne"
      const encodedUrl = encodeURIComponent(targetUrl)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc123`,
              title: "John Wayne",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildBritannicaPage(richBiographicalContent),
        title: "John Wayne | Biography",
        url: targetUrl,
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // fetchPageWithFallbacks should be called with the cleaned Britannica URL
      expect(mockFetchPage.mock.calls[0][0]).toBe(targetUrl)
    })

    it("prefers /biography/ paths over other URLs", async () => {
      const biographyUrl = "https://www.britannica.com/biography/John-Wayne"
      const otherUrl = "https://www.britannica.com/topic/John-Wayne-filmography"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: otherUrl,
              title: "John Wayne Filmography",
              snippet: "Films list",
            },
            {
              url: biographyUrl,
              title: "John Wayne Biography",
              snippet: "Full biography",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildBritannicaPage(richBiographicalContent),
        title: "John Wayne | Biography",
        url: biographyUrl,
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Should have fetched the /biography/ URL
      expect(mockFetchPage.mock.calls[0][0]).toBe(biographyUrl)
    })

    it("handles page fetch errors", async () => {
      const encodedUrl = encodeURIComponent("https://www.britannica.com/biography/John-Wayne")

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

      mockFetchPage.mockResolvedValueOnce({
        content: "",
        title: "",
        url: "https://www.britannica.com/biography/John-Wayne",
        fetchMethod: "direct",
        error: "All fetch methods failed (direct + archive.org + archive.is)",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("page fetch failed")
    })

    it("handles web search HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("search failed")
    })

    it("calculates biographical confidence from content", async () => {
      const encodedUrl = encodeURIComponent("https://www.britannica.com/biography/John-Wayne")

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

      mockFetchPage.mockResolvedValueOnce({
        content: buildBritannicaPage(richBiographicalContent),
        title: "John Wayne | Biography",
        url: "https://www.britannica.com/biography/John-Wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Content contains: "born in" (required), "grew up" (required), "parents" (required),
      // "scholarship" (bonus), "education" (required), "school" (required),
      // "family" (required), "married" (required), "children" (bonus), "personal" (required)
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
