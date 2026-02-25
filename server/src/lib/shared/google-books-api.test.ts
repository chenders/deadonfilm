import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const MOCK_VOLUME: object = {
  id: "abc123",
  volumeInfo: {
    title: "Hollywood Babylon",
    authors: ["Kenneth Anger"],
    publisher: "Dell Publishing",
    publishedDate: "1975",
    description: "A classic expose of Hollywood scandals and tragedies.",
    categories: ["Performing Arts"],
    pageCount: 384,
    language: "en",
  },
  searchInfo: {
    textSnippet: "The death of <b>Rudolph Valentino</b> shocked the world...",
  },
  accessInfo: {
    viewability: "PARTIAL",
    publicDomain: false,
    epub: { isAvailable: false },
    pdf: { isAvailable: false },
  },
}

const MOCK_SEARCH_RESPONSE = {
  totalItems: 1,
  items: [MOCK_VOLUME],
}

const MOCK_EMPTY_SEARCH_RESPONSE = {
  totalItems: 0,
  items: [],
}

const MOCK_VOLUME_NO_SNIPPET: object = {
  id: "def456",
  volumeInfo: {
    title: "Obscure Film History",
    authors: ["Unknown Author"],
    publishedDate: "2020",
  },
  accessInfo: {
    viewability: "NO_PAGES",
    publicDomain: false,
  },
}

const MOCK_VOLUME_NO_DESC_NO_SNIPPET: object = {
  id: "ghi789",
  volumeInfo: {
    title: "Completely Empty",
  },
  accessInfo: {
    viewability: "NO_PAGES",
    publicDomain: false,
  },
}

describe("searchGoogleBooks", () => {
  let searchGoogleBooks: typeof import("./google-books-api.js").searchGoogleBooks

  beforeEach(async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-api-key")
    vi.restoreAllMocks()
    const mod = await import("./google-books-api.js")
    searchGoogleBooks = mod.searchGoogleBooks
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns search results for a valid query", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }))
    )

    const result = await searchGoogleBooks("Hollywood Babylon")

    expect(result.totalItems).toBe(1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe("abc123")
    expect(result.items[0].volumeInfo.title).toBe("Hollywood Babylon")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = new URL(fetchCall[0] as string)
    expect(url.searchParams.get("q")).toBe("Hollywood Babylon")
    expect(url.searchParams.get("key")).toBe("test-api-key")
    expect(url.searchParams.get("maxResults")).toBe("10")
  })

  it("respects maxResults parameter", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }))
    )

    await searchGoogleBooks("test", 5)

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = new URL(fetchCall[0] as string)
    expect(url.searchParams.get("maxResults")).toBe("5")
  })

  it("returns empty items array when no results found", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_EMPTY_SEARCH_RESPONSE), { status: 200 })
        )
    )

    const result = await searchGoogleBooks("nonexistent book xyz")

    expect(result.totalItems).toBe(0)
    expect(result.items).toHaveLength(0)
  })

  it("throws on API rate limit (429)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 429, message: "Rate Limit Exceeded" } }), {
          status: 429,
        })
      )
    )

    await expect(searchGoogleBooks("test")).rejects.toThrow(/429/)
  })

  it("throws when GOOGLE_BOOKS_API_KEY is not set", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "")

    await expect(searchGoogleBooks("test")).rejects.toThrow(/GOOGLE_BOOKS_API_KEY/)
  })

  it("handles response with no items field gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ totalItems: 0 }), { status: 200 }))
    )

    const result = await searchGoogleBooks("obscure query")

    expect(result.totalItems).toBe(0)
    expect(result.items).toHaveLength(0)
  })
})

describe("getGoogleBooksVolume", () => {
  let getGoogleBooksVolume: typeof import("./google-books-api.js").getGoogleBooksVolume

  beforeEach(async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "test-api-key")
    vi.restoreAllMocks()
    const mod = await import("./google-books-api.js")
    getGoogleBooksVolume = mod.getGoogleBooksVolume
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns a volume by ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(MOCK_VOLUME), { status: 200 }))
    )

    const volume = await getGoogleBooksVolume("abc123")

    expect(volume.id).toBe("abc123")
    expect(volume.volumeInfo.title).toBe("Hollywood Babylon")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    expect(fetchCall[0]).toContain("/volumes/abc123")
  })

  it("throws on 404 for nonexistent volume", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
    )

    await expect(getGoogleBooksVolume("nonexistent")).rejects.toThrow(/404/)
  })

  it("throws when GOOGLE_BOOKS_API_KEY is not set", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "")

    await expect(getGoogleBooksVolume("abc123")).rejects.toThrow(/GOOGLE_BOOKS_API_KEY/)
  })
})

describe("extractVolumeText", () => {
  let extractVolumeText: typeof import("./google-books-api.js").extractVolumeText

  beforeEach(async () => {
    const mod = await import("./google-books-api.js")
    extractVolumeText = mod.extractVolumeText
  })

  it("combines textSnippet and description", () => {
    const volume = MOCK_VOLUME as import("./google-books-api.js").GoogleBooksVolume

    const text = extractVolumeText(volume)

    expect(text).toContain("Rudolph Valentino")
    expect(text).toContain("Hollywood scandals")
  })

  it("returns description only when no textSnippet", () => {
    const volume = {
      ...MOCK_VOLUME_NO_SNIPPET,
      volumeInfo: {
        ...(MOCK_VOLUME_NO_SNIPPET as { volumeInfo: object }).volumeInfo,
        description: "A detailed description here.",
      },
    } as import("./google-books-api.js").GoogleBooksVolume

    const text = extractVolumeText(volume)

    expect(text).toBe("A detailed description here.")
  })

  it("returns null when neither textSnippet nor description exist", () => {
    const volume =
      MOCK_VOLUME_NO_DESC_NO_SNIPPET as import("./google-books-api.js").GoogleBooksVolume

    const text = extractVolumeText(volume)

    expect(text).toBeNull()
  })

  it("strips HTML tags from textSnippet", () => {
    const volume = MOCK_VOLUME as import("./google-books-api.js").GoogleBooksVolume

    const text = extractVolumeText(volume)

    expect(text).not.toContain("<b>")
    expect(text).not.toContain("</b>")
  })
})

describe("formatVolumeAttribution", () => {
  let formatVolumeAttribution: typeof import("./google-books-api.js").formatVolumeAttribution

  beforeEach(async () => {
    const mod = await import("./google-books-api.js")
    formatVolumeAttribution = mod.formatVolumeAttribution
  })

  it("formats title, author, and year", () => {
    const volume = MOCK_VOLUME as import("./google-books-api.js").GoogleBooksVolume

    const attribution = formatVolumeAttribution(volume)

    expect(attribution).toBe("Hollywood Babylon by Kenneth Anger (1975)")
  })

  it("formats title only when no author or date", () => {
    const volume =
      MOCK_VOLUME_NO_DESC_NO_SNIPPET as import("./google-books-api.js").GoogleBooksVolume

    const attribution = formatVolumeAttribution(volume)

    expect(attribution).toBe("Completely Empty")
  })

  it("formats title and author when no date", () => {
    const volume = {
      id: "test",
      volumeInfo: { title: "Test Book", authors: ["Author One"] },
      accessInfo: { viewability: "NO_PAGES" as const, publicDomain: false },
    } as import("./google-books-api.js").GoogleBooksVolume

    const attribution = formatVolumeAttribution(volume)

    expect(attribution).toBe("Test Book by Author One")
  })

  it("joins multiple authors", () => {
    const volume = {
      id: "test",
      volumeInfo: { title: "Collab Book", authors: ["Alice", "Bob"], publishedDate: "2020-01-01" },
      accessInfo: { viewability: "NO_PAGES" as const, publicDomain: false },
    } as import("./google-books-api.js").GoogleBooksVolume

    const attribution = formatVolumeAttribution(volume)

    expect(attribution).toBe("Collab Book by Alice, Bob (2020)")
  })
})
