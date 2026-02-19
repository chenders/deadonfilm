import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  searchDuckDuckGo,
  isDuckDuckGoCaptcha,
  extractUrlsFromDuckDuckGoHtml,
  cleanDuckDuckGoUrl,
} from "./duckduckgo-search.js"

// Sample DDG HTML with search results
const VALID_DDG_HTML = `
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.britannica.com%2Fbiography%2FJohn-Wayne&amp;rut=abc123">
      www.britannica.com/biography/John-Wayne
    </a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.britannica.com%2Fbiography%2FJohn-Wayne&amp;rut=abc123">
      John Wayne | Biography, Movies, &amp; Facts
    </a>
    <a class="result__snippet">John Wayne was an American motion-picture actor who became a symbol of rugged masculinity.</a>
  </div>
</div>
<div class="result results_links results_links_deep web-result">
  <div class="links_main links_deep result__body">
    <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FJohn_Wayne&amp;rut=def456">
      en.wikipedia.org/wiki/John_Wayne
    </a>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FJohn_Wayne&amp;rut=def456">
      John Wayne - Wikipedia
    </a>
  </div>
</div>
`

const CAPTCHA_HTML = `
<html>
<body>
  <div id="anomaly-modal">
    <p>bots use DuckDuckGo too</p>
    <p>Please verify you are human</p>
  </div>
</body>
</html>
`

const EMPTY_DDG_HTML = `
<html>
<body>
  <div class="no-results">No results found</div>
</body>
</html>
`

describe("isDuckDuckGoCaptcha", () => {
  it("detects anomaly-modal", () => {
    expect(isDuckDuckGoCaptcha(CAPTCHA_HTML)).toBe(true)
  })

  it("detects 'bots use DuckDuckGo too' text", () => {
    const html = "<div>bots use DuckDuckGo too</div>"
    expect(isDuckDuckGoCaptcha(html)).toBe(true)
  })

  it("returns false for valid search results", () => {
    expect(isDuckDuckGoCaptcha(VALID_DDG_HTML)).toBe(false)
  })

  it("returns false for empty results page", () => {
    expect(isDuckDuckGoCaptcha(EMPTY_DDG_HTML)).toBe(false)
  })
})

describe("cleanDuckDuckGoUrl", () => {
  it("decodes DDG redirect URL", () => {
    const ddgUrl =
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.britannica.com%2Fbiography%2FJohn-Wayne&rut=abc123"
    expect(cleanDuckDuckGoUrl(ddgUrl)).toBe("https://www.britannica.com/biography/John-Wayne")
  })

  it("handles protocol-relative URLs", () => {
    expect(cleanDuckDuckGoUrl("//example.com/page")).toBe("https://example.com/page")
  })

  it("passes through normal URLs unchanged", () => {
    expect(cleanDuckDuckGoUrl("https://example.com/page")).toBe("https://example.com/page")
  })

  it("handles HTML entity encoding in redirect URLs", () => {
    const ddgUrl =
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage%3Fq%3Dtest&amp;rut=abc"
    const result = cleanDuckDuckGoUrl(ddgUrl)
    expect(result).toBe("https://example.com/page?q=test")
  })
})

describe("extractUrlsFromDuckDuckGoHtml", () => {
  it("extracts URLs from valid DDG HTML", () => {
    const urls = extractUrlsFromDuckDuckGoHtml(VALID_DDG_HTML)
    expect(urls).toHaveLength(2)
    expect(urls[0]).toBe("https://www.britannica.com/biography/John-Wayne")
    expect(urls[1]).toBe("https://en.wikipedia.org/wiki/John_Wayne")
  })

  it("filters by domain when domainFilter is provided", () => {
    const urls = extractUrlsFromDuckDuckGoHtml(VALID_DDG_HTML, "britannica.com")
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe("https://www.britannica.com/biography/John-Wayne")
  })

  it("supports additionalDomainFilters", () => {
    const urls = extractUrlsFromDuckDuckGoHtml(VALID_DDG_HTML, "britannica.com", ["wikipedia.org"])
    expect(urls).toHaveLength(2)
  })

  it("returns empty array for empty HTML", () => {
    expect(extractUrlsFromDuckDuckGoHtml("")).toHaveLength(0)
  })

  it("returns empty array for CAPTCHA HTML", () => {
    expect(extractUrlsFromDuckDuckGoHtml(CAPTCHA_HTML)).toHaveLength(0)
  })

  it("falls back to result__a when result__url not found", () => {
    const htmlWithOnlyLinks = `
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage&rut=123">Title</a>
    `
    const urls = extractUrlsFromDuckDuckGoHtml(htmlWithOnlyLinks)
    expect(urls).toHaveLength(1)
    expect(urls[0]).toBe("https://example.com/page")
  })
})

describe("searchDuckDuckGo", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("returns URLs from successful fetch-based search", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_DDG_HTML, { status: 200 })
    )

    const result = await searchDuckDuckGo({
      query: 'site:britannica.com "John Wayne" biography',
      domainFilter: "britannica.com",
      useBrowserFallback: false,
    })

    expect(result.engine).toBe("duckduckgo-fetch")
    expect(result.urls).toHaveLength(1)
    expect(result.urls[0]).toContain("britannica.com")
    expect(result.costUsd).toBe(0)
  })

  it("returns all URLs when no domain filter", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_DDG_HTML, { status: 200 })
    )

    const result = await searchDuckDuckGo({
      query: '"John Wayne" biography',
      useBrowserFallback: false,
    })

    expect(result.urls).toHaveLength(2)
  })

  it("returns error when CAPTCHA detected and browser fallback disabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(CAPTCHA_HTML, { status: 200 }))

    const result = await searchDuckDuckGo({
      query: "test",
      useBrowserFallback: false,
    })

    expect(result.urls).toHaveLength(0)
    expect(result.error).toContain("browser fallback is disabled")
  })

  it("returns error when fetch fails and browser fallback disabled", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"))

    const result = await searchDuckDuckGo({
      query: "test",
      useBrowserFallback: false,
    })

    expect(result.urls).toHaveLength(0)
    expect(result.error).toContain("browser fallback is disabled")
  })

  it("handles non-OK HTTP response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 429 }))

    const result = await searchDuckDuckGo({
      query: "test",
      useBrowserFallback: false,
    })

    expect(result.urls).toHaveLength(0)
  })

  it("tracks zero cost for fetch-based searches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_DDG_HTML, { status: 200 })
    )

    const result = await searchDuckDuckGo({
      query: "test",
      useBrowserFallback: false,
    })

    expect(result.costUsd).toBe(0)
  })
})

describe("searchDuckDuckGo - browser fallback", () => {
  let mockPage: {
    goto: ReturnType<typeof vi.fn>
    waitForSelector: ReturnType<typeof vi.fn>
    waitForLoadState: ReturnType<typeof vi.fn>
    content: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }
  let mockContext: { close: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.restoreAllMocks()

    mockPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      waitForLoadState: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue(VALID_DDG_HTML),
      close: vi.fn().mockResolvedValue(undefined),
    }
    mockContext = { close: vi.fn().mockResolvedValue(undefined) }

    // Mock the dynamic imports used by browserDuckDuckGoSearch
    vi.doMock("../death-sources/browser-fetch.js", () => ({
      getBrowserPage: vi.fn().mockResolvedValue({ page: mockPage, context: mockContext }),
    }))
    vi.doMock("../death-sources/browser-auth/index.js", () => ({
      detectCaptcha: vi.fn().mockResolvedValue({ detected: false }),
      solveCaptcha: vi.fn(),
      getBrowserAuthConfig: vi.fn().mockReturnValue({ captchaSolver: null }),
    }))

    // Make fetch fail so browser fallback is triggered
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(CAPTCHA_HTML, { status: 200 }))
  })

  it("falls back to browser when fetch gets CAPTCHA", async () => {
    // Re-import to pick up mocked modules
    const { searchDuckDuckGo: search } = await import("./duckduckgo-search.js")

    const result = await search({
      query: 'site:britannica.com "John Wayne"',
      domainFilter: "britannica.com",
      useBrowserFallback: true,
    })

    expect(result.engine).toBe("duckduckgo-browser")
    expect(result.urls).toHaveLength(1)
    expect(result.urls[0]).toContain("britannica.com")
    expect(mockPage.goto).toHaveBeenCalled()
    expect(mockPage.close).toHaveBeenCalled()
    expect(mockContext.close).toHaveBeenCalled()
  })

  it("returns error when browser also gets CAPTCHA", async () => {
    mockPage.content.mockResolvedValue(CAPTCHA_HTML)

    const { searchDuckDuckGo: search } = await import("./duckduckgo-search.js")

    const result = await search({
      query: "test",
      useBrowserFallback: true,
    })

    expect(result.urls).toHaveLength(0)
    expect(result.error).toContain("CAPTCHA")
  })

  it("cleans up page and context even on error", async () => {
    mockPage.goto.mockRejectedValue(new Error("Navigation failed"))

    const { searchDuckDuckGo: search } = await import("./duckduckgo-search.js")

    const result = await search({
      query: "test",
      useBrowserFallback: true,
    })

    expect(result.urls).toHaveLength(0)
    expect(mockPage.close).toHaveBeenCalled()
    expect(mockContext.close).toHaveBeenCalled()
  })
})
