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

import { BiographyComSource } from "./biography-com.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 456,
  tmdb_id: 3084,
  imdb_person_id: "nm0000035",
  name: "Marlon Brando",
  birthday: "1924-04-03",
  deathday: "2004-07-01",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Omaha, Nebraska, USA",
}

/**
 * Build DuckDuckGo HTML with result blocks.
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
 * Build a Biography.com-like HTML page.
 */
function buildBiographyComPage(content: string, title = "Marlon Brando"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="Biography">
</head>
<body>
  <article>
    ${content}
  </article>
</body>
</html>`
}

const richBiographicalContent = `
<p>Marlon Brando was born on April 3, 1924, in Omaha, Nebraska. He grew up in a
troubled household. His parents, Marlon Brando Sr. and Dorothy Pennebaker Brando, had a
tumultuous marriage marked by mutual alcoholism.</p>

<p>As a child, Brando was expelled from several schools for bad behavior. His education
was unconventional, and he eventually attended the Shattuck Military Academy in
Faribault, Minnesota. His early life was shaped by family dysfunction and a restless
spirit.</p>

<p>Before fame, Brando studied acting at the New School for Social Research in New York
under Stella Adler. He married three times and had numerous children. His personal
struggles with weight, relationships, and loss were well documented throughout his
career.</p>
`

// ============================================================================
// Tests
// ============================================================================

describe("BiographyComSource", () => {
  let source: BiographyComSource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new BiographyComSource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Biography.com")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.BIOGRAPHY_COM)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has SECONDARY_COMPILATION reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
    })

    it("has 0.85 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.85)
    })
  })

  describe("lookup", () => {
    it("succeeds when web search returns Biography.com URL and page has content", async () => {
      const encodedUrl = encodeURIComponent("https://www.biography.com/actors/marlon-brando")

      // Web search response (DDG fetch internally)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=xyz`,
              title: "Marlon Brando - Actor, Film Actor",
              snippet: "Born in Omaha, Nebraska...",
            },
          ]),
      })

      // Page fetch via fetchPageWithFallbacks mock
      mockFetchPage.mockResolvedValueOnce({
        content: buildBiographyComPage(richBiographicalContent),
        title: "Marlon Brando",
        url: "https://www.biography.com/actors/marlon-brando",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Biography.com")
      expect(result.data!.sourceType).toBe(BiographySourceType.BIOGRAPHY_COM)
      expect(result.data!.publication).toBe("Biography.com")
      expect(result.data!.domain).toBe("biography.com")
      expect(result.data!.contentType).toBe("biography")
      expect(result.data!.text).toContain("Omaha, Nebraska")
      expect(result.data!.text).toContain("Stella Adler")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no web search results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Biography.com results found")
    })

    it("returns failure when web search results have no biography.com URLs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: "https://www.imdb.com/name/nm0000008/",
              title: "Marlon Brando - IMDb",
              snippet: "Actor filmography",
            },
          ]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Biography.com results found")
    })

    it("returns failure when Biography.com page fetch fails", async () => {
      const encodedUrl = encodeURIComponent("https://www.biography.com/actors/marlon-brando")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=xyz`,
              title: "Marlon Brando",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: "",
        title: "",
        url: "https://www.biography.com/actors/marlon-brando",
        fetchMethod: "direct",
        error: "HTTP 404",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 404")
    })

    it("returns failure when cleaned content is too short", async () => {
      const encodedUrl = encodeURIComponent("https://www.biography.com/actors/marlon-brando")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=xyz`,
              title: "Marlon Brando",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: `<html><body><p>Brief text.</p></body></html>`,
        title: "Marlon Brando",
        url: "https://www.biography.com/actors/marlon-brando",
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
      const encodedUrl = encodeURIComponent("https://www.biography.com/actors/marlon-brando")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=xyz`,
              title: "Marlon Brando",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildBiographyComPage(richBiographicalContent),
        title: "Marlon Brando",
        url: "https://www.biography.com/actors/marlon-brando",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("Biography.com")
      expect(result.source.domain).toBe("biography.com")
      expect(result.source.contentType).toBe("biography")
      expect(result.source.url).toContain("biography.com")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.SECONDARY_COMPILATION)
      expect(result.source.reliabilityScore).toBe(0.85)
    })

    it("cleans DuckDuckGo redirect URLs correctly", async () => {
      const targetUrl = "https://www.biography.com/actors/marlon-brando"
      const encodedUrl = encodeURIComponent(targetUrl)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=xyz123`,
              title: "Marlon Brando",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildBiographyComPage(richBiographicalContent),
        title: "Marlon Brando",
        url: targetUrl,
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // fetchPageWithFallbacks should be called with the cleaned Biography.com URL
      expect(mockFetchPage.mock.calls[0][0]).toBe(targetUrl)
    })

    it("avoids list and category pages when multiple URLs available", async () => {
      const profileUrl = "https://www.biography.com/actors/marlon-brando"
      const listUrl = "https://www.biography.com/lists/best-actors"

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: listUrl,
              title: "Best Actors",
              snippet: "Top actors list",
            },
            {
              url: profileUrl,
              title: "Marlon Brando",
              snippet: "Full profile",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildBiographyComPage(richBiographicalContent),
        title: "Marlon Brando",
        url: profileUrl,
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Should have fetched the profile URL, not the list URL
      expect(mockFetchPage.mock.calls[0][0]).toBe(profileUrl)
    })

    it("handles page fetch errors", async () => {
      const encodedUrl = encodeURIComponent("https://www.biography.com/actors/marlon-brando")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=xyz`,
              title: "Marlon Brando",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: "",
        title: "",
        url: "https://www.biography.com/actors/marlon-brando",
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
        status: 429,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("search failed")
    })

    it("calculates biographical confidence from content", async () => {
      const encodedUrl = encodeURIComponent("https://www.biography.com/actors/marlon-brando")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=xyz`,
              title: "Marlon Brando",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildBiographyComPage(richBiographicalContent),
        title: "Marlon Brando",
        url: "https://www.biography.com/actors/marlon-brando",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      // Content contains: "born" (not in list, but "born in" pattern not exact),
      // "grew up" (required), "parents" (required), "education" (required),
      // "school" (required), "early life" (required), "family" (required),
      // "married" (required), "personal" (required), "children" (bonus),
      // "struggled/struggles" is not exact match, but "poverty" is not present
      expect(result.data!.confidence).toBeGreaterThan(0)
      expect(result.source.confidence).toBeGreaterThan(0)
    })
  })
})
