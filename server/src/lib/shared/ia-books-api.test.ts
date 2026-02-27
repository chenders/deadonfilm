import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_SEARCH_RESPONSE = {
  response: {
    numFound: 2,
    docs: [
      {
        identifier: "johnwaynelilege0000eyma",
        title: "John Wayne: The Life and Legend",
        creator: "Scott Eyman",
        date: "2014",
        mediatype: "texts",
        publicdate: "2014-04-22T00:00:00Z",
      },
      {
        identifier: "dukejohnwayne0000davi",
        title: "Duke: The Life and Image of John Wayne",
        creator: "Ronald L. Davis",
        date: "1998",
        mediatype: "texts",
        publicdate: "1998-06-15T00:00:00Z",
      },
    ],
  },
}

const MOCK_EMPTY_SEARCH_RESPONSE = {
  response: {
    numFound: 0,
    docs: [],
  },
}

const MOCK_OCR_TEXT = `Page 45 of the book.
John Wayne died on June 11, 1979, at UCLA Medical Center
in Los Angeles, from stomach cancer. He was 72 years old.
His death was mourned across the nation.`

const MOCK_SEARCH_INSIDE_RESPONSE = {
  matches: [
    {
      text: {
        content: "died on June 11, 1979 from stomach cancer",
      },
      par: [{ page: 45 }],
    },
    {
      text: {
        content: "death was mourned across America",
      },
      par: [{ page: 112 }],
    },
  ],
}

const MOCK_SEARCH_INSIDE_EMPTY = {
  matches: [],
}

describe("searchIABooks", () => {
  let searchIABooks: typeof import("./ia-books-api.js").searchIABooks

  beforeEach(async () => {
    vi.restoreAllMocks()
    const mod = await import("./ia-books-api.js")
    searchIABooks = mod.searchIABooks
  })

  it("returns book results for a known person", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SEARCH_RESPONSE), { status: 200 }))
    )

    const results = await searchIABooks("John Wayne")

    expect(results).toHaveLength(2)
    expect(results[0].identifier).toBe("johnwaynelilege0000eyma")
    expect(results[0].title).toBe("John Wayne: The Life and Legend")
    expect(results[0].creator).toBe("Scott Eyman")
    expect(results[0].mediatype).toBe("texts")
    expect(results[1].identifier).toBe("dukejohnwayne0000davi")
  })

  it("constructs correct advanced search query", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_EMPTY_SEARCH_RESPONSE), { status: 200 })
        )
    )

    await searchIABooks("John Wayne", 10)

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("advancedsearch.php")
    expect(url).toContain("output=json")
    expect(url).toContain("rows=10")
    expect(url).toContain("sort%5B%5D=downloads+desc")
    // Should contain the person name in the query
    expect(url).toContain("John+Wayne")
    expect(url).toContain("mediatype%3Atexts")
  })

  it("returns empty array when no results found", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_EMPTY_SEARCH_RESPONSE), { status: 200 })
        )
    )

    const results = await searchIABooks("Nonexistent Actor XYZ")

    expect(results).toHaveLength(0)
  })

  it("uses default maxResults of 20", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_EMPTY_SEARCH_RESPONSE), { status: 200 })
        )
    )

    await searchIABooks("John Wayne")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("rows=20")
  })

  it("throws on server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
    )

    await expect(searchIABooks("John Wayne")).rejects.toThrow(/500/)
  })
})

describe("getPageOCR", () => {
  let getPageOCR: typeof import("./ia-books-api.js").getPageOCR

  beforeEach(async () => {
    vi.restoreAllMocks()
    const mod = await import("./ia-books-api.js")
    getPageOCR = mod.getPageOCR
  })

  it("returns OCR text for a valid page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response(MOCK_OCR_TEXT, { status: 200 }))
    )

    const text = await getPageOCR("johnwaynelilege0000eyma", 45)

    expect(text).toContain("John Wayne died on June 11, 1979")
    expect(text).toContain("stomach cancer")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("johnwaynelilege0000eyma")
    expect(url).toContain("45")
  })

  it("returns null on 404 (page not found)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
    )

    const text = await getPageOCR("someidentifier", 999)

    expect(text).toBeNull()
  })

  it("throws on server error (not 404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
    )

    await expect(getPageOCR("someidentifier", 1)).rejects.toThrow(/500/)
  })
})

describe("searchInsideIA", () => {
  let searchInsideIA: typeof import("./ia-books-api.js").searchInsideIA

  beforeEach(async () => {
    vi.restoreAllMocks()
    const mod = await import("./ia-books-api.js")
    searchInsideIA = mod.searchInsideIA
  })

  it("returns hits with text and page numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_SEARCH_INSIDE_RESPONSE), { status: 200 })
        )
    )

    const hits = await searchInsideIA("johnwaynelilege0000eyma", "death cancer")

    expect(hits).toHaveLength(2)
    expect(hits[0].text).toBe("died on June 11, 1979 from stomach cancer")
    expect(hits[0].pageNum).toBe(45)
    expect(hits[1].text).toBe("death was mourned across America")
    expect(hits[1].pageNum).toBe(112)
  })

  it("returns empty array when no matches found", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_SEARCH_INSIDE_EMPTY), { status: 200 })
        )
    )

    const hits = await searchInsideIA("someidentifier", "nonexistent phrase")

    expect(hits).toHaveLength(0)
  })

  it("constructs correct search URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_SEARCH_INSIDE_EMPTY), { status: 200 })
        )
    )

    await searchInsideIA("mybook123", "death of actor")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("api.archivelab.org/books/mybook123/searchinside")
    expect(url).toContain("q=death+of+actor")
  })

  it("throws on server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
    )

    await expect(searchInsideIA("mybook", "query")).rejects.toThrow(/500/)
  })
})
