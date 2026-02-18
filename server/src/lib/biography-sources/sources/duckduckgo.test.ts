import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock external dependencies before imports
vi.mock("../../death-sources/cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../death-sources/link-follower.js", () => ({
  fetchPages: vi.fn().mockResolvedValue([]),
  extractDomain: (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "")
    } catch {
      return ""
    }
  },
}))

vi.mock("../../death-sources/html-utils.js", () => ({
  decodeHtmlEntities: (text: string) => {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
  },
}))

vi.mock("../content-cleaner.js", () => ({
  mechanicalPreClean: vi.fn().mockReturnValue({
    text: "",
    metadata: { title: null, publication: null, author: null, publishDate: null },
  }),
  aiExtractBiographicalContent: vi.fn().mockResolvedValue({
    extractedText: null,
    articleTitle: null,
    publication: null,
    author: null,
    publishDate: null,
    relevance: "none",
    contentType: "other",
    url: "",
    domain: "",
    originalBytes: 0,
    cleanedBytes: 0,
    costUsd: 0,
  }),
  shouldPassToSynthesis: vi.fn().mockReturnValue(true),
}))

import { DuckDuckGoBiographySearch } from "./duckduckgo.js"
import { BiographySourceType } from "../types.js"

describe("DuckDuckGoBiographySearch", () => {
  let source: DuckDuckGoBiographySearch
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    source = new DuckDuckGoBiographySearch()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("isAvailable", () => {
    it("returns true always (no API key needed)", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("DuckDuckGo (Bio)")
    })

    it("has correct type", () => {
      expect(source.type).toBe(BiographySourceType.DUCKDUCKGO_BIO)
    })

    it("is free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })
  })

  describe("lookup", () => {
    const mockActor = {
      id: 123,
      tmdb_id: 456,
      imdb_person_id: "nm0000001",
      name: "Jane Doe",
      birthday: "1945-03-20",
      deathday: "2023-11-15",
      wikipedia_url: null,
      biography_raw_tmdb: null,
      biography: null,
      place_of_birth: null,
    }

    it("returns results on successful HTML response", async () => {
      const mockHtml = `
        <html>
        <body>
          <div class="result results_links results_links_deep web-result">
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbiography.com%2Fjane-doe&amp;rut=abc">Jane Doe Biography</a>
            <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbiography.com%2Fjane-doe&amp;rut=abc">biography.com</a>
            <a class="result__snippet">Jane Doe grew up in a small town and attended local school</a>
          </div></div>
          <div class="result results_links results_links_deep web-result">
            <a class="result__a" href="https://example.com/interview">Jane Doe Interview</a>
            <a class="result__url" href="https://example.com/interview">example.com</a>
            <a class="result__snippet">The actress shared stories about her childhood</a>
          </div></div>
        </body>
        </html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      })

      const result = await source.lookup(mockActor)

      // Verify fetch was called with DuckDuckGo HTML URL
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain("html.duckduckgo.com")
      expect(callUrl).toContain("Jane%20Doe")
    })

    it("detects CAPTCHA with anomaly-modal", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
          <body>
            <div id="anomaly-modal">
              <p>Please verify you are human</p>
            </div>
          </body>
          </html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("CAPTCHA")
    })

    it("detects CAPTCHA with bots message", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
          <body>
            <p>bots use DuckDuckGo too</p>
          </body>
          </html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("CAPTCHA")
    })

    it("cleans DuckDuckGo redirect URLs", async () => {
      const encodedUrl = encodeURIComponent("https://biography.com/jane-doe")
      const mockHtml = `
        <html>
        <body>
          <div class="result results_links web-result">
            <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodedUrl}&amp;rut=abc123">Jane Doe</a>
            <a class="result__url" href="//duckduckgo.com/l/?uddg=${encodedUrl}&amp;rut=abc123">biography.com</a>
            <a class="result__snippet">Early life and childhood biography</a>
          </div></div>
        </body>
        </html>
      `

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockHtml,
      })

      const result = await source.lookup(mockActor)

      // The redirect URL should be cleaned to the actual URL
      expect(mockFetch.mock.calls[0][0]).toContain("html.duckduckgo.com")
    })

    it("handles HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("HTTP 503")
    })

    it("handles empty HTML (no results)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => `
          <html>
          <body>
            <div class="no-results">No results found</div>
          </body>
          </html>
        `,
      })

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network timeout"))

      const result = await source.lookup(mockActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("Network timeout")
    })
  })
})
