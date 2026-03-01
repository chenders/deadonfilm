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

import { TCMBiographySource } from "./tcm.js"
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

function buildTCMPage(content: string, title = "John Wayne | TCM"): string {
  return `<html>
<head>
  <title>${title}</title>
  <meta property="og:site_name" content="Turner Classic Movies">
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

describe("TCMBiographySource", () => {
  let source: TCMBiographySource

  beforeEach(() => {
    vi.clearAllMocks()
    source = new TCMBiographySource()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("TCM")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.TCM_BIO)
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
    it("succeeds when web search returns TCM URL and page has content", async () => {
      const encodedUrl = encodeURIComponent("https://www.tcm.com/tcmdb/person/2157/john-wayne")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${encodedUrl}&rut=abc`,
              title: "John Wayne | TCM",
              snippet: "Biography of the American actor...",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildTCMPage(richBiographicalContent),
        title: "John Wayne | TCM",
        url: "https://www.tcm.com/tcmdb/person/2157/john-wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data).not.toBeNull()
      expect(result.data!.sourceName).toBe("TCM")
      expect(result.data!.sourceType).toBe(BiographySourceType.TCM_BIO)
      expect(result.data!.publication).toBe("TCM")
      expect(result.data!.domain).toBe("tcm.com")
      expect(result.data!.contentType).toBe("profile")
      expect(result.data!.text).toContain("Winterset, Iowa")
      expect(result.data!.confidence).toBeGreaterThan(0)
    })

    it("returns failure when no web search results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `<html><body><div class="no-results">No results</div></body></html>`,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No TCM results found")
    })

    it("returns failure when page fetch fails", async () => {
      const encodedUrl = encodeURIComponent("https://www.tcm.com/tcmdb/person/2157/john-wayne")

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
        url: "https://www.tcm.com/tcmdb/person/2157/john-wayne",
        fetchMethod: "direct",
        error: "HTTP 401",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 401")
    })

    it("returns failure when cleaned content is too short", async () => {
      const encodedUrl = encodeURIComponent("https://www.tcm.com/tcmdb/person/2157/john-wayne")

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
        url: "https://www.tcm.com/tcmdb/person/2157/john-wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("content too short")
    })

    it("prefers /tcmdb/person/ URLs over general paths", async () => {
      const dbUrl = encodeURIComponent("https://www.tcm.com/tcmdb/person/2157/john-wayne")
      const articleUrl = encodeURIComponent("https://www.tcm.com/articles/john-wayne-tribute")

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          buildDuckDuckGoHtml([
            {
              url: `//duckduckgo.com/l/?uddg=${articleUrl}&rut=abc`,
              title: "John Wayne Tribute",
              snippet: "An article about Wayne",
            },
            {
              url: `//duckduckgo.com/l/?uddg=${dbUrl}&rut=def`,
              title: "John Wayne | TCM Database",
              snippet: "TCM database biography",
            },
          ]),
      })

      mockFetchPage.mockResolvedValueOnce({
        content: buildTCMPage(richBiographicalContent),
        title: "John Wayne | TCM",
        url: "https://www.tcm.com/tcmdb/person/2157/john-wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.url).toContain("/tcmdb/person/")
    })

    it("sets correct source metadata on success", async () => {
      const encodedUrl = encodeURIComponent("https://www.tcm.com/tcmdb/person/2157/john-wayne")

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
        content: buildTCMPage(richBiographicalContent),
        title: "John Wayne | TCM",
        url: "https://www.tcm.com/tcmdb/person/2157/john-wayne",
        fetchMethod: "direct",
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.publication).toBe("TCM")
      expect(result.source.domain).toBe("tcm.com")
      expect(result.source.contentType).toBe("profile")
      expect(result.source.url).toContain("tcm.com")
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
