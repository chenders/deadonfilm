import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
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

import { AllMusicBiographySource } from "./allmusic.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 456,
  tmdb_id: 65731,
  imdb_person_id: "nm0001352",
  name: "Johnny Cash",
  birthday: "1932-02-26",
  deathday: "2003-09-12",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Kingsland, Arkansas, USA",
}

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

function buildAllMusicPage(content: string, title = "Johnny Cash | AllMusic"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="AllMusic">
</head>
<body>
  <article>
    ${content}
  </article>
</body>
</html>`
}

const richBiographicalContent = `
<p>Johnny Cash was born J.R. Cash on February 26, 1932, in Kingsland, Arkansas.
He grew up in a poor farming family during the Great Depression. His childhood
was shaped by the hardships of rural poverty and the loss of his brother Jack
in a sawmill accident.</p>

<p>Cash served in the United States Air Force, stationed in Germany, where he
formed his first band. His education at a radio training school helped him
develop skills that would later serve his career.</p>

<p>His personal life was marked by struggles with addiction and a tumultuous first
marriage. He married June Carter in 1968, a partnership that brought stability
and creative inspiration. He was deeply influenced by his Christian faith and
his connections to the working class and prisoners.</p>
`

// ============================================================================
// Tests
// ============================================================================

describe("AllMusicBiographySource", () => {
  let source: AllMusicBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new AllMusicBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("AllMusic")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.ALLMUSIC_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("has TRADE_PRESS reliability", () => {
      expect(source.reliabilityTier).toBe(ReliabilityTier.TRADE_PRESS)
    })

    it("has 0.9 reliability score", () => {
      expect(source.reliabilityScore).toBe(0.9)
    })
  })

  describe("lookup", () => {
    it("succeeds when web search returns AllMusic URL and page has content", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.allmusic.com/artist/johnny-cash-mn0000093703/biography"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Johnny Cash | Biography & History | AllMusic",
              snippet: "Biography of the American musician...",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildAllMusicPage(richBiographicalContent),
        title: "Johnny Cash | AllMusic",
        url: "https://www.allmusic.com/artist/johnny-cash-mn0000093703/biography",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("AllMusic")
      expect(result.data!.sourceType).toBe(BiographySourceType.ALLMUSIC_BIO)
      expect(result.data!.publication).toBe("AllMusic")
      expect(result.data!.domain).toBe("allmusic.com")
      expect(result.data!.contentType).toBe("profile")
      expect(result.data!.text).toContain("Kingsland, Arkansas")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no web search results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No AllMusic results found")
    })

    it("returns failure when page fetch fails", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.allmusic.com/artist/johnny-cash-mn0000093703"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Johnny Cash",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: "",
        title: "",
        url: "https://www.allmusic.com/artist/johnny-cash-mn0000093703",
        fetchMethod: "direct",
        error: "HTTP 403",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 403")
    })

    it("returns failure when cleaned content is too short", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.allmusic.com/artist/johnny-cash-mn0000093703"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Johnny Cash",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: `<html><body><p>Short text.</p></body></html>`,
        title: "Johnny Cash",
        url: "https://www.allmusic.com/artist/johnny-cash-mn0000093703",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("prefers /artist/ URLs over general paths", async () => {
      const artistUrl = encodeURIComponent(
        "https://www.allmusic.com/artist/johnny-cash-mn0000093703/biography"
      )
      const albumUrl = encodeURIComponent(
        "https://www.allmusic.com/album/at-folsom-prison-mw0000189837"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${albumUrl}&rut=abc`,
              title: "At Folsom Prison",
              snippet: "Album review",
            },
            {
              url: `//duckduckgo.com/l/?uddg=${artistUrl}&rut=def`,
              title: "Johnny Cash | Biography",
              snippet: "Artist biography",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildAllMusicPage(richBiographicalContent),
        title: "Johnny Cash | AllMusic",
        url: "https://www.allmusic.com/artist/johnny-cash-mn0000093703/biography",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("/artist/")
    })

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.allmusic.com/artist/johnny-cash-mn0000093703"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Johnny Cash",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildAllMusicPage(richBiographicalContent),
        title: "Johnny Cash | AllMusic",
        url: "https://www.allmusic.com/artist/johnny-cash-mn0000093703",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("AllMusic")
      expect(result.source.domain).toBe("allmusic.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.url).toContain("allmusic.com")
      expect(result.source.reliabilityTier).toBe(ReliabilityTier.TRADE_PRESS)
      expect(result.source.reliabilityScore).toBe(0.9)
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
  })
})
