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

import { HistoryComBiographySource } from "./history-com.js"
import { BiographySourceType } from "../types.js"
import { ReliabilityTier } from "../../death-sources/types.js"
import type { ActorForBiography } from "../types.js"

// ============================================================================
// Test Fixtures
// ============================================================================

const testActor: ActorForBiography = {
  id: 101,
  tmdb_id: 33241,
  imdb_person_id: "nm0001401",
  name: "Abraham Lincoln",
  birthday: "1809-02-12",
  deathday: "1865-04-15",
  wikipedia_url: null,
  biography_raw_tmdb: null,
  biography: null,
  place_of_birth: "Hodgenville, Kentucky, USA",
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

function buildHistoryComPage(content: string, title = "Abraham Lincoln | History.com"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="HISTORY">
</head>
<body>
  <article>
    ${content}
  </article>
</body>
</html>`
}

const richBiographicalContent = `
<p>Abraham Lincoln was born on February 12, 1809, in a one-room log cabin in
Hodgenville, Kentucky. He grew up in a poor frontier family, and his mother
Nancy Hanks Lincoln died when he was just nine years old.</p>

<p>Lincoln was largely self-educated, reading voraciously by firelight. He worked
as a rail-splitter, shopkeeper, and postmaster before studying law on his own
and passing the bar in 1836.</p>

<p>His personal life was marked by deep bouts of melancholy. He married Mary Todd
in 1842, and together they had four sons, though only one survived to adulthood.
The death of his son Willie in 1862, during his presidency, devastated both
Abraham and Mary. His family life was complex, shaped by loss and the immense
pressures of leading the nation through civil war.</p>
`

// ============================================================================
// Tests
// ============================================================================

describe("HistoryComBiographySource", () => {
  let source: HistoryComBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new HistoryComBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("History.com")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.HISTORY_COM_BIO)
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
    it("succeeds when web search returns History.com URL and page has content", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.history.com/topics/us-presidents/abraham-lincoln"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Abraham Lincoln | History.com",
              snippet: "Biography of the 16th president...",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildHistoryComPage(richBiographicalContent),
        title: "Abraham Lincoln | History.com",
        url: "https://www.history.com/topics/us-presidents/abraham-lincoln",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("History.com")
      expect(result.data!.sourceType).toBe(BiographySourceType.HISTORY_COM_BIO)
      expect(result.data!.publication).toBe("History.com")
      expect(result.data!.domain).toBe("history.com")
      expect(result.data!.contentType).toBe("profile")
      expect(result.data!.text).toContain("Hodgenville, Kentucky")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no web search results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No History.com results found")
    })

    it("returns failure when page fetch fails", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.history.com/topics/us-presidents/abraham-lincoln"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Abraham Lincoln",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: "",
        title: "",
        url: "https://www.history.com/topics/us-presidents/abraham-lincoln",
        fetchMethod: "direct",
        error: "HTTP 403",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 403")
    })

    it("returns failure when cleaned content is too short", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.history.com/topics/us-presidents/abraham-lincoln"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Abraham Lincoln",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: `<html><body><p>Short text.</p></body></html>`,
        title: "Abraham Lincoln",
        url: "https://www.history.com/topics/us-presidents/abraham-lincoln",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("prefers /topics/ URLs over general paths", async () => {
      const topicsUrl = encodeURIComponent(
        "https://www.history.com/topics/us-presidents/abraham-lincoln"
      )
      const newsUrl = encodeURIComponent("https://www.history.com/news/lincoln-assassination-facts")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${newsUrl}&rut=abc`,
              title: "Lincoln Assassination Facts",
              snippet: "News about the assassination",
            },
            {
              url: `//duckduckgo.com/l/?uddg=${topicsUrl}&rut=def`,
              title: "Abraham Lincoln | HISTORY",
              snippet: "Biography of the president",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildHistoryComPage(richBiographicalContent),
        title: "Abraham Lincoln | History.com",
        url: "https://www.history.com/topics/us-presidents/abraham-lincoln",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("/topics/")
    })

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent(
        "https://www.history.com/topics/us-presidents/abraham-lincoln"
      )

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "Abraham Lincoln",
              snippet: "Bio",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildHistoryComPage(richBiographicalContent),
        title: "Abraham Lincoln | History.com",
        url: "https://www.history.com/topics/us-presidents/abraham-lincoln",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("History.com")
      expect(result.source.domain).toBe("history.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.url).toContain("history.com")
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
