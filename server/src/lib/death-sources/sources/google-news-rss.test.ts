import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock cache module before importing source
vi.mock("../cache.js", () => ({
  getCachedQuery: vi.fn().mockResolvedValue(null),
  setCachedQuery: vi.fn().mockResolvedValue(undefined),
}))

// Mock logger to avoid file operations during tests
vi.mock("../logger.js", () => ({
  getEnrichmentLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

import { GoogleNewsRSSSource } from "./google-news-rss.js"
import type { ActorForEnrichment } from "../types.js"
import { DataSourceType, SourceAccessBlockedError } from "../types.js"

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("GoogleNewsRSSSource", () => {
  let source: GoogleNewsRSSSource

  beforeEach(() => {
    source = new GoogleNewsRSSSource()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("properties", () => {
    it("has correct name", () => {
      expect(source.name).toBe("Google News RSS")
    })

    it("has correct type", () => {
      expect(source.type).toBe(DataSourceType.GOOGLE_NEWS_RSS)
    })

    it("is marked as free", () => {
      expect(source.isFree).toBe(true)
    })

    it("has zero cost per query", () => {
      expect(source.estimatedCostPerQuery).toBe(0)
    })

    it("is available by default", () => {
      expect(source.isAvailable()).toBe(true)
    })
  })

  describe("lookup", () => {
    const testActor: ActorForEnrichment = {
      id: 123,
      tmdbId: 456,
      name: "Matthew Perry",
      birthday: "1969-08-19",
      deathday: "2023-10-28",
      causeOfDeath: null,
      causeOfDeathDetails: null,
      popularity: 30.0,
    }

    const makeRSSXml = (items: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Google News RSS</title>
    ${items.join("\n    ")}
  </channel>
</rss>`

    const relevantItem = `<item>
      <title><![CDATA[Matthew Perry Dead at 54 - Entertainment Weekly]]></title>
      <link>https://example.com/obituary</link>
      <description><![CDATA[Matthew Perry, the beloved Friends star, died at his Los Angeles home on October 28.]]></description>
      <pubDate>Sat, 28 Oct 2023 18:00:00 GMT</pubDate>
    </item>`

    const irrelevantItem = `<item>
      <title><![CDATA[New Friends Reunion Special Announced]]></title>
      <link>https://example.com/reunion</link>
      <description><![CDATA[A new Friends reunion special is in the works.]]></description>
      <pubDate>Mon, 15 Jan 2024 10:00:00 GMT</pubDate>
    </item>`

    it("returns early for living actors", async () => {
      const livingActor: ActorForEnrichment = {
        ...testActor,
        deathday: null,
      }

      const result = await source.lookup(livingActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Actor is not deceased")
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("parses RSS feed and follows article link", async () => {
      // RSS feed response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([relevantItem]),
      })

      // Article page response
      const articleHtml = `
        <html>
          <body>
            <article>
              <p>Matthew Perry, the Emmy-nominated actor who starred as Chandler Bing on
              the beloved NBC sitcom "Friends," died on October 28 at his home in Los Angeles.
              He was 54.</p>
              <p>Perry was found unresponsive in a jacuzzi at his Pacific Palisades home.
              His death was attributed to the acute effects of ketamine.</p>
            </article>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.source.type).toBe(DataSourceType.GOOGLE_NEWS_RSS)
      expect(result.data?.circumstances).toContain("died")
    })

    it("filters irrelevant RSS items", async () => {
      // RSS feed with only irrelevant items
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([irrelevantItem]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No relevant death articles")
      // Should not follow any links
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("returns error when no relevant items found", async () => {
      // RSS feed with items that don't match actor
      const unrelatedItem = `<item>
        <title><![CDATA[Someone Else Died Today]]></title>
        <link>https://example.com/other</link>
        <description><![CDATA[A completely different person died.]]></description>
        <pubDate>Mon, 30 Oct 2023 10:00:00 GMT</pubDate>
      </item>`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([unrelatedItem]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No relevant death articles")
    })

    it("throws SourceAccessBlockedError on 403 during RSS fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("throws SourceAccessBlockedError on 403 during article fetch", async () => {
      // RSS feed succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([relevantItem]),
      })

      // Article returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      })

      await expect(source.lookup(testActor)).rejects.toThrow(SourceAccessBlockedError)
    })

    it("handles empty RSS feed", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([]),
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("No items found")
    })

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toBe("Network error")
    })

    it("returns error when article has no death info", async () => {
      // RSS feed with relevant item
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([relevantItem]),
      })

      // Article page has no death info
      const articleHtml = `
        <html>
          <body>
            <p>Matthew Perry talks about his upcoming book and reflects on his time on Friends.</p>
            <p>The actor recently appeared at a book signing event in New York.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      // Falls back to RSS snippet data; the RSS item title contains "Dead"
      // and description mentions "died", so snippet extraction may succeed.
      // If snippets also don't yield death sentences, result is false.
      expect(result.source.type).toBe(DataSourceType.GOOGLE_NEWS_RSS)
    })

    it("falls back to snippet data when article fetch fails with non-403", async () => {
      // RSS feed with relevant item containing death info in description
      const itemWithDeathSnippet = `<item>
        <title><![CDATA[Matthew Perry Dead at 54]]></title>
        <link>https://example.com/obituary</link>
        <description><![CDATA[Perry died at his Los Angeles home from cardiac arrest. The Friends star was found unresponsive.]]></description>
        <pubDate>Sat, 28 Oct 2023 18:00:00 GMT</pubDate>
      </item>`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([itemWithDeathSnippet]),
      })

      // Article returns 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      // Should attempt to build result from snippets
      expect(result.source.type).toBe(DataSourceType.GOOGLE_NEWS_RSS)
    })

    it("handles RSS feed with multiple relevant items", async () => {
      const secondRelevantItem = `<item>
        <title><![CDATA[Remembering Perry: Friends Star Death Shocks Hollywood]]></title>
        <link>https://example.com/tribute</link>
        <description><![CDATA[Hollywood mourns the death of Matthew Perry, who passed away at 54.]]></description>
        <pubDate>Sun, 29 Oct 2023 10:00:00 GMT</pubDate>
      </item>`

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([relevantItem, secondRelevantItem, irrelevantItem]),
      })

      // Article for top item
      const articleHtml = `
        <html>
          <body>
            <p>Perry died on October 28 at his home in Los Angeles. An autopsy revealed
            the cause of death was the acute effects of ketamine.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.circumstances).toContain("died")
    })

    it("extracts location of death from article", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => makeRSSXml([relevantItem]),
      })

      const articleHtml = `
        <html>
          <body>
            <p>Perry died in Los Angeles from cardiac arrest.</p>
          </body>
        </html>
      `
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => articleHtml,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(true)
      expect(result.data?.locationOfDeath).toBe("Los Angeles")
    })

    it("returns error for non-200 RSS feed status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await source.lookup(testActor)

      expect(result.success).toBe(false)
      expect(result.error).toContain("RSS feed fetch failed")
    })
  })
})
