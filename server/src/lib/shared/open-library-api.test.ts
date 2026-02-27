import { describe, it, expect, vi, beforeEach } from "vitest"

const MOCK_SUBJECT_RESULT = {
  name: "person:john_wayne",
  subject_count: 42,
  works: [
    {
      key: "/works/OL123W",
      title: "John Wayne: The Life and Legend",
      authors: [{ name: "Scott Eyman" }],
      has_fulltext: true,
      ia: ["johnwaynelilege0000eyma"],
      cover_id: 12345,
      first_publish_year: 2014,
    },
    {
      key: "/works/OL456W",
      title: "Duke: The Life and Image of John Wayne",
      authors: [{ name: "Ronald L. Davis" }],
      has_fulltext: false,
      first_publish_year: 1998,
    },
  ],
}

const MOCK_EMPTY_SUBJECT_RESULT = {
  name: "person:nonexistent_actor_xyz",
  subject_count: 0,
  works: [],
}

const MOCK_SEARCH_INSIDE_RESPONSE = {
  hits: {
    hits: [
      {
        fields: {
          page_num: 45,
        },
        highlight: {
          text: ["He <em>died</em> on June 11, 1979 from <em>stomach cancer</em>."],
        },
      },
      {
        fields: {
          page_num: 112,
        },
        highlight: {
          text: ["Wayne's <em>death</em> was mourned across <em>America</em>."],
        },
      },
    ],
    total: 2,
  },
}

const MOCK_SEARCH_INSIDE_EMPTY = {
  hits: {
    hits: [],
    total: 0,
  },
}

describe("searchOpenLibraryByPerson", () => {
  let searchOpenLibraryByPerson: typeof import("./open-library-api.js").searchOpenLibraryByPerson

  beforeEach(async () => {
    vi.restoreAllMocks()
    const mod = await import("./open-library-api.js")
    searchOpenLibraryByPerson = mod.searchOpenLibraryByPerson
  })

  it("returns works for a known person", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SUBJECT_RESULT), { status: 200 }))
    )

    const result = await searchOpenLibraryByPerson("John Wayne")

    expect(result.name).toBe("person:john_wayne")
    expect(result.subject_count).toBe(42)
    expect(result.works).toHaveLength(2)
    expect(result.works[0].title).toBe("John Wayne: The Life and Legend")
    expect(result.works[0].has_fulltext).toBe(true)
    expect(result.works[0].ia).toContain("johnwaynelilege0000eyma")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("/subjects/person:john_wayne.json")

    const opts = fetchCall[1] as RequestInit
    expect(opts.headers).toBeDefined()
    expect((opts.headers as Record<string, string>)["User-Agent"]).toContain("DeadOnFilm")
  })

  it("slugifies person name to lowercase with underscores", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_EMPTY_SUBJECT_RESULT), { status: 200 })
        )
    )

    await searchOpenLibraryByPerson("Audrey Hepburn")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("/subjects/person:audrey_hepburn.json")
  })

  it("respects limit parameter", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(MOCK_SUBJECT_RESULT), { status: 200 }))
    )

    await searchOpenLibraryByPerson("John Wayne", 5)

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("limit=5")
  })

  it("returns empty result on 404 (unknown person)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Not Found", { status: 404 }))
    )

    const result = await searchOpenLibraryByPerson("Nonexistent Actor XYZ")

    expect(result.name).toBe("")
    expect(result.subject_count).toBe(0)
    expect(result.works).toHaveLength(0)
  })

  it("throws on server error (500)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
    )

    await expect(searchOpenLibraryByPerson("John Wayne")).rejects.toThrow(/500/)
  })
})

describe("searchInsideBook", () => {
  let searchInsideBook: typeof import("./open-library-api.js").searchInsideBook

  beforeEach(async () => {
    vi.restoreAllMocks()
    const mod = await import("./open-library-api.js")
    searchInsideBook = mod.searchInsideBook
  })

  it("returns hits with page numbers and cleaned highlights", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(MOCK_SEARCH_INSIDE_RESPONSE), { status: 200 })
        )
    )

    const hits = await searchInsideBook("johnwaynelilege0000eyma", "death cancer")

    expect(hits).toHaveLength(2)
    expect(hits[0].pageNum).toBe(45)
    expect(hits[0].highlight).toBe("He died on June 11, 1979 from stomach cancer.")
    expect(hits[0].highlight).not.toContain("<em>")
    expect(hits[1].pageNum).toBe(112)
    expect(hits[1].highlight).not.toContain("<em>")
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

    const hits = await searchInsideBook("someidentifier", "nonexistent phrase")

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

    await searchInsideBook("mybook123", "death of actor")

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const url = fetchCall[0] as string
    expect(url).toContain("search/inside.json")
    expect(url).toContain("item_id=mybook123")
    expect(url).toContain("q=death+of+actor")
  })

  it("throws on server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Server Error", { status: 500 }))
    )

    await expect(searchInsideBook("mybook", "query")).rejects.toThrow(/500/)
  })
})
