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

import { SmithsonianBiographySource } from "./smithsonian.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 789,
  tmdb_id: 15152,
  imdb_person_id: "nm0000079",
  name: "Neil Armstrong",
  birthday: "1930-08-05",
  deathday: "2012-08-25",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Wapakoneta, Ohio, USA",
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

function buildSmithsonianPage(
  content: string,
  title = "Neil Armstrong | Smithsonian Magazine"
): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="Smithsonian Magazine">
</head>
<body>
  <article>
    ${content}
  </article>
</body>
</html>`
}

const richBiographicalContent = `
<p>Neil Armstrong was born on August 5, 1930, in Wapakoneta, Ohio. He grew up
in a modest family, the eldest of three children. His childhood fascination with
flight began at age two when his father took him to watch air races.</p>

<p>Armstrong attended Purdue University on a scholarship from the U.S. Navy,
studying aeronautical engineering. His education was interrupted by service in
the Korean War, where he flew 78 combat missions.</p>

<p>His personal life was deeply private. He married Janet Shearon in 1956, and
together they had three children. The death of their daughter Karen from a brain
tumor in 1962 was a devastating loss. After his historic moon landing, Armstrong
retreated from public life, preferring to teach at the University of Cincinnati.</p>
`

// ============================================================================
// Tests
// ============================================================================

describe("SmithsonianBiographySource", () => {
  let source: SmithsonianBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new SmithsonianBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Smithsonian Magazine")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.SMITHSONIAN_BIO)
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
    it("succeeds when web search returns Smithsonian URL and page has content", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.smithsonianmag.com/history/neil-armstrong-biography-1234567"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Neil Armstrong | Smithsonian Magazine",
              snippet: "Profile of the American astronaut...",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildSmithsonianPage(richBiographicalContent),
        title: "Neil Armstrong | Smithsonian Magazine",
        url: "https://www.smithsonianmag.com/history/neil-armstrong-biography-1234567",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("Smithsonian Magazine")
      expect(result.data!.sourceType).toBe(BiographySourceType.SMITHSONIAN_BIO)
      expect(result.data!.publication).toBe("Smithsonian Magazine")
      expect(result.data!.domain).toBe("smithsonianmag.com")
      expect(result.data!.contentType).toBe("profile")
      expect(result.data!.text).toContain("Wapakoneta, Ohio")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no web search results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No Smithsonian Magazine results found")
    })

    it("returns failure when page fetch fails", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.smithsonianmag.com/history/neil-armstrong-1234567"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Neil Armstrong",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: "",
        title: "",
        url: "https://www.smithsonianmag.com/history/neil-armstrong-1234567",
        fetchMethod: "direct",
        error: "HTTP 403",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 403")
    })

    it("returns failure when cleaned content is too short", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.smithsonianmag.com/history/neil-armstrong-1234567"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Neil Armstrong",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: `<html><body><p>Short text.</p></body></html>`,
        title: "Neil Armstrong",
        url: "https://www.smithsonianmag.com/history/neil-armstrong-1234567",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("prefers /history/ URLs over general paths", async () => {
      const historyUrl = encodeURIComponent(
        "https://www.smithsonianmag.com/history/neil-armstrong-biography-1234567"
      )
      const scienceUrl = encodeURIComponent(
        "https://www.smithsonianmag.com/science-nature/moon-rocks-1234567"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${scienceUrl}&rut=abc`,
              title: "Moon Rocks Analysis",
              snippet: "An article about moon rocks",
            },
            {
              url: `//duckduckgo.com/l/?uddg=${historyUrl}&rut=def`,
              title: "Neil Armstrong: The Man Behind the Moon Landing",
              snippet: "Biography of the astronaut",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildSmithsonianPage(richBiographicalContent),
        title: "Neil Armstrong | Smithsonian Magazine",
        url: "https://www.smithsonianmag.com/history/neil-armstrong-biography-1234567",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("/history/")
    })

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.smithsonianmag.com/history/neil-armstrong-1234567"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Neil Armstrong",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildSmithsonianPage(richBiographicalContent),
        title: "Neil Armstrong | Smithsonian Magazine",
        url: "https://www.smithsonianmag.com/history/neil-armstrong-1234567",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("Smithsonian Magazine")
      expect(result.source.domain).toBe("smithsonianmag.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.url).toContain("smithsonianmag.com")
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
