import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("../logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import {
  extractWikipediaTitle,
  fetchWikipediaIntro,
  batchFetchWikipediaIntros,
} from "./wikipedia-fetcher.js"

const fetchMock = vi.fn()
vi.stubGlobal("fetch", fetchMock)

beforeEach(() => {
  vi.clearAllMocks()
})

function makeWikipediaApiResponse(html: string) {
  return {
    ok: true,
    json: async () => ({
      parse: { text: { "*": html } },
    }),
  }
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  }
}

function makeApiErrorResponse(info: string) {
  return {
    ok: true,
    json: async () => ({
      error: { info },
    }),
  }
}

describe("extractWikipediaTitle", () => {
  it("extracts title from a standard Wikipedia URL", () => {
    const result = extractWikipediaTitle("https://en.wikipedia.org/wiki/John_Wayne")
    expect(result).toBe("John_Wayne")
  })

  it("decodes percent-encoded characters in the URL", () => {
    const result = extractWikipediaTitle("https://en.wikipedia.org/wiki/Beyonc%C3%A9")
    expect(result).toBe("Beyoncé")
  })

  it("returns null for a URL without /wiki/ path", () => {
    const result = extractWikipediaTitle("https://en.wikipedia.org/w/index.php?title=John_Wayne")
    expect(result).toBeNull()
  })

  it("returns null for an invalid URL string", () => {
    const result = extractWikipediaTitle("not-a-url")
    expect(result).toBeNull()
  })

  it("returns null for an empty string", () => {
    const result = extractWikipediaTitle("")
    expect(result).toBeNull()
  })

  it("extracts title from non-English Wikipedia URL", () => {
    const result = extractWikipediaTitle("https://de.wikipedia.org/wiki/Albert_Einstein")
    expect(result).toBe("Albert_Einstein")
  })
})

describe("fetchWikipediaIntro", () => {
  it("returns cleaned text on successful fetch", async () => {
    const htmlContent =
      "<p>John Wayne (born Marion Robert Morrison; May 26, 1907 – June 11, 1979) was an American actor who became a popular icon through his leading roles.</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/John_Wayne")

    expect(result).toBe(
      "John Wayne (born Marion Robert Morrison; May 26, 1907 – June 11, 1979) was an American actor who became a popular icon through his leading roles."
    )
    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("en.wikipedia.org")
    expect(calledUrl).toContain("page=John_Wayne")
  })

  it("strips citation markers from the text", async () => {
    const htmlContent =
      "<p>John Wayne was an American actor.[1] He appeared in over 170 films.[2] He is widely regarded as an icon.[3]</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/John_Wayne")

    expect(result).not.toContain("[1]")
    expect(result).not.toContain("[2]")
    expect(result).not.toContain("[3]")
  })

  it("returns null when content is shorter than 50 characters", async () => {
    const shortContent = "<p>Short bio.</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(shortContent))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/Obscure_Person")

    expect(result).toBeNull()
  })

  it("returns null when the API returns a non-OK status", async () => {
    fetchMock.mockResolvedValueOnce(makeErrorResponse(404))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/Nonexistent_Article")

    expect(result).toBeNull()
  })

  it("returns null when the API returns an error object", async () => {
    fetchMock.mockResolvedValueOnce(makeApiErrorResponse("The page you specified doesn't exist."))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/Missing_Page")

    expect(result).toBeNull()
  })

  it("returns null when fetch throws a network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network timeout"))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/John_Wayne")

    expect(result).toBeNull()
  })

  it("truncates text to 4000 characters", async () => {
    const longParagraph = "A".repeat(5000)
    const htmlContent = `<p>${longParagraph}</p>`
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/Long_Article")

    expect(result).not.toBeNull()
    expect(result!.length).toBe(4000)
  })

  it("returns null when the URL has no /wiki/ path", async () => {
    const result = await fetchWikipediaIntro(
      "https://en.wikipedia.org/w/index.php?title=John_Wayne"
    )

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses the correct language subdomain for non-English URLs", async () => {
    const htmlContent =
      "<p>Albert Einstein war ein deutscher Physiker mit Schweizer und US-amerikanischer Staatsbürgerschaft, weltweit bekannt für seine Relativitätstheorie.</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    await fetchWikipediaIntro("https://de.wikipedia.org/wiki/Albert_Einstein")

    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("de.wikipedia.org")
  })

  it("falls back to English for an invalid language subdomain (SSRF protection)", async () => {
    const htmlContent =
      "<p>This is a test article with enough content to pass the minimum length check for the Wikipedia fetcher module test.</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    // Subdomain "x1y2" contains digits, failing the /^[a-z]{2,10}(-[a-z]{2,10})?$/ regex
    await fetchWikipediaIntro("https://x1y2.wikipedia.org/wiki/Some_Article")

    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = fetchMock.mock.calls[0][0] as string
    // Should fall back to English since "x1y2" doesn't match the allowed pattern
    expect(calledUrl).toContain("en.wikipedia.org")
    expect(calledUrl).not.toContain("x1y2")
  })

  it("falls back to English when subdomain is 'www'", async () => {
    const htmlContent =
      "<p>This is a test article with enough content to pass the minimum length check for the Wikipedia fetcher module test.</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    await fetchWikipediaIntro("https://www.wikipedia.org/wiki/Some_Article")

    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain("en.wikipedia.org")
  })

  it("always constructs API URL against wikipedia.org regardless of input hostname", async () => {
    const htmlContent =
      "<p>This is a test article with enough content to pass the minimum length check for the Wikipedia fetcher module test.</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    // Even with a malicious hostname, the API URL is built as {lang}.wikipedia.org
    await fetchWikipediaIntro("https://evil.attacker.com/wiki/Some_Article")

    expect(fetchMock).toHaveBeenCalledOnce()
    const calledUrl = fetchMock.mock.calls[0][0] as string
    // "evil" passes the regex but the URL is still *.wikipedia.org, not attacker.com
    expect(calledUrl).toMatch(/^https:\/\/[a-z]+\.wikipedia\.org\//)
    expect(calledUrl).not.toContain("attacker.com")
  })

  it("returns null when the API response has no text content", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ parse: { text: {} } }),
    })

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/Empty_Article")

    expect(result).toBeNull()
  })

  it("removes HTML tags including script and style elements", async () => {
    const htmlContent =
      '<p>John Wayne was an American actor.</p><script>alert("xss")</script><style>.hidden{display:none}</style><p> He starred in many westerns and war films throughout his long career in Hollywood.</p>'
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(htmlContent))

    const result = await fetchWikipediaIntro("https://en.wikipedia.org/wiki/John_Wayne")

    expect(result).not.toBeNull()
    expect(result).not.toContain("<script>")
    expect(result).not.toContain("<style>")
    expect(result).not.toContain("<p>")
    expect(result).not.toContain("alert")
    expect(result).not.toContain("display:none")
  })
})

describe("batchFetchWikipediaIntros", () => {
  it("returns a Map of successful results", async () => {
    const actor1Html =
      "<p>John Wayne (born Marion Robert Morrison; May 26, 1907 – June 11, 1979) was an American actor who became a popular icon.</p>"
    const actor2Html =
      "<p>Humphrey Bogart (December 25, 1899 – January 14, 1957) was an American film and stage actor known for many memorable roles.</p>"

    fetchMock
      .mockResolvedValueOnce(makeWikipediaApiResponse(actor1Html))
      .mockResolvedValueOnce(makeWikipediaApiResponse(actor2Html))

    const actors = [
      { id: 1, wikipediaUrl: "https://en.wikipedia.org/wiki/John_Wayne" },
      { id: 2, wikipediaUrl: "https://en.wikipedia.org/wiki/Humphrey_Bogart" },
    ]

    const results = await batchFetchWikipediaIntros(actors, 10, 0)

    expect(results).toBeInstanceOf(Map)
    expect(results.size).toBe(2)
    expect(results.get(1)).toContain("John Wayne")
    expect(results.get(2)).toContain("Humphrey Bogart")
  })

  it("handles individual failures gracefully while other actors succeed", async () => {
    const actor1Html =
      "<p>John Wayne (born Marion Robert Morrison; May 26, 1907 – June 11, 1979) was an American actor who became a popular icon.</p>"

    fetchMock
      .mockResolvedValueOnce(makeWikipediaApiResponse(actor1Html))
      .mockRejectedValueOnce(new Error("Network error"))

    const actors = [
      { id: 1, wikipediaUrl: "https://en.wikipedia.org/wiki/John_Wayne" },
      { id: 2, wikipediaUrl: "https://en.wikipedia.org/wiki/Failing_Actor" },
    ]

    const results = await batchFetchWikipediaIntros(actors, 10, 0)

    expect(results.size).toBe(1)
    expect(results.get(1)).toContain("John Wayne")
    expect(results.has(2)).toBe(false)
  })

  it("returns an empty Map for empty input", async () => {
    const results = await batchFetchWikipediaIntros([], 10, 0)

    expect(results).toBeInstanceOf(Map)
    expect(results.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("excludes actors whose intro is null (too short)", async () => {
    const shortContent = "<p>Short.</p>"
    fetchMock.mockResolvedValueOnce(makeWikipediaApiResponse(shortContent))

    const actors = [{ id: 1, wikipediaUrl: "https://en.wikipedia.org/wiki/Obscure_Person" }]

    const results = await batchFetchWikipediaIntros(actors, 10, 0)

    expect(results.size).toBe(0)
  })

  it("processes actors in chunks", async () => {
    const html =
      "<p>This is a sufficiently long biography for a test actor to pass the minimum content length threshold in the fetcher.</p>"

    // 3 actors with chunkSize of 2 means 2 chunks
    fetchMock
      .mockResolvedValueOnce(makeWikipediaApiResponse(html))
      .mockResolvedValueOnce(makeWikipediaApiResponse(html))
      .mockResolvedValueOnce(makeWikipediaApiResponse(html))

    const actors = [
      { id: 1, wikipediaUrl: "https://en.wikipedia.org/wiki/Actor_One" },
      { id: 2, wikipediaUrl: "https://en.wikipedia.org/wiki/Actor_Two" },
      { id: 3, wikipediaUrl: "https://en.wikipedia.org/wiki/Actor_Three" },
    ]

    const results = await batchFetchWikipediaIntros(actors, 2, 0)

    expect(results.size).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
