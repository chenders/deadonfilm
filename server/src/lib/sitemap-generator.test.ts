import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  escapeXml,
  getPageCounts,
  generateSitemapIndex,
  generateStaticSitemap,
  generateMoviesSitemap,
  generateActorsSitemap,
  generateShowsSitemap,
  generateAllSitemaps,
  URLS_PER_SITEMAP,
} from "./sitemap-generator.js"
import * as db from "./db.js"

// Mock the db module
vi.mock("./db.js", () => ({
  getPool: vi.fn(),
}))

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("foo & bar")).toBe("foo &amp; bar")
  })

  it("escapes less than", () => {
    expect(escapeXml("a < b")).toBe("a &lt; b")
  })

  it("escapes greater than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b")
  })

  it("escapes double quotes", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;")
  })

  it("escapes single quotes", () => {
    expect(escapeXml("it's")).toBe("it&apos;s")
  })

  it("escapes multiple special characters", () => {
    expect(escapeXml('<a href="test">foo & bar</a>')).toBe(
      "&lt;a href=&quot;test&quot;&gt;foo &amp; bar&lt;/a&gt;"
    )
  })

  it("returns unchanged string with no special characters", () => {
    expect(escapeXml("plain text")).toBe("plain text")
  })
})

describe("getPageCounts", () => {
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("returns correct page counts for small datasets", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "100" }] }) // movies
      .mockResolvedValueOnce({ rows: [{ count: "50" }] }) // actors
      .mockResolvedValueOnce({ rows: [{ count: "25" }] }) // shows

    const counts = await getPageCounts()

    expect(counts).toEqual({ movies: 1, actors: 1, shows: 1 })
  })

  it("returns correct page counts for large datasets", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "75000" }] }) // movies: 2 pages
      .mockResolvedValueOnce({ rows: [{ count: "150000" }] }) // actors: 3 pages
      .mockResolvedValueOnce({ rows: [{ count: "50001" }] }) // shows: 2 pages

    const counts = await getPageCounts()

    expect(counts).toEqual({ movies: 2, actors: 3, shows: 2 })
  })

  it("handles exactly 50000 entries (1 page)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "50000" }] })
      .mockResolvedValueOnce({ rows: [{ count: "50000" }] })
      .mockResolvedValueOnce({ rows: [{ count: "50000" }] })

    const counts = await getPageCounts()

    expect(counts).toEqual({ movies: 1, actors: 1, shows: 1 })
  })

  it("handles zero entries", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] })

    const counts = await getPageCounts()

    expect(counts).toEqual({ movies: 0, actors: 0, shows: 0 })
  })
})

describe("generateSitemapIndex", () => {
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("generates valid XML with single page for each content type", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "100" }] })
      .mockResolvedValueOnce({ rows: [{ count: "50" }] })
      .mockResolvedValueOnce({ rows: [{ count: "10" }] })

    const xml = await generateSitemapIndex()

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain("<sitemapindex")
    expect(xml).toContain("sitemap-static.xml")
    expect(xml).toContain("sitemap-movies.xml")
    expect(xml).toContain("sitemap-actors.xml")
    expect(xml).toContain("sitemap-shows.xml")
    expect(xml).not.toContain("sitemap-death-details.xml")
    expect(xml).not.toContain("sitemap-movies-1.xml")
  })

  it("generates paginated sitemaps when content exceeds 50k", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "75000" }] }) // 2 pages
      .mockResolvedValueOnce({ rows: [{ count: "150000" }] }) // 3 pages
      .mockResolvedValueOnce({ rows: [{ count: "25000" }] }) // 1 page

    const xml = await generateSitemapIndex()

    expect(xml).toContain("sitemap-movies-1.xml")
    expect(xml).toContain("sitemap-movies-2.xml")
    expect(xml).not.toContain("sitemap-movies-3.xml")

    expect(xml).toContain("sitemap-actors-1.xml")
    expect(xml).toContain("sitemap-actors-2.xml")
    expect(xml).toContain("sitemap-actors-3.xml")
    expect(xml).not.toContain("sitemap-actors-4.xml")

    expect(xml).toContain("sitemap-shows.xml")
    expect(xml).not.toContain("sitemap-shows-1.xml")
  })
})

describe("generateStaticSitemap", () => {
  it("generates valid XML with all static pages", async () => {
    const xml = await generateStaticSitemap()

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain("<urlset")
    expect(xml).toContain("https://deadonfilm.com/")
    expect(xml).not.toContain("https://deadonfilm.com/cursed-movies")
    expect(xml).not.toContain("https://deadonfilm.com/cursed-actors")
    expect(xml).not.toContain("https://deadonfilm.com/death-watch")
    expect(xml).toContain("https://deadonfilm.com/covid-deaths")
    expect(xml).toContain("https://deadonfilm.com/unnatural-deaths")
    expect(xml).toContain("https://deadonfilm.com/forever-young")
    expect(xml).toContain("https://deadonfilm.com/in-detail")
    expect(xml).toContain("https://deadonfilm.com/deaths")
    expect(xml).toContain("https://deadonfilm.com/movies/genres")
    // Authority/trust pages
    expect(xml).toContain("https://deadonfilm.com/about")
    expect(xml).toContain("https://deadonfilm.com/faq")
    expect(xml).toContain("https://deadonfilm.com/methodology")
    expect(xml).toContain("https://deadonfilm.com/data-sources")
  })

  it("includes priority and changefreq for each page", async () => {
    const xml = await generateStaticSitemap()

    expect(xml).toContain("<priority>1.0</priority>") // Homepage
    expect(xml).toContain("<priority>0.7</priority>") // In Detail, causes of death
    expect(xml).toContain("<changefreq>daily</changefreq>")
    expect(xml).toContain("<changefreq>weekly</changefreq>")
    expect(xml).toContain("<changefreq>monthly</changefreq>") // Authority pages
  })

  it("includes lastmod with today's date", async () => {
    const today = new Date().toISOString().split("T")[0]
    const xml = await generateStaticSitemap()

    expect(xml).toContain(`<lastmod>${today}</lastmod>`)
  })
})

describe("generateMoviesSitemap", () => {
  let mockQuery: ReturnType<typeof vi.fn>

  const mockMovies = [
    {
      tmdb_id: 12345,
      title: "Test Movie",
      release_year: 2020,
      updated_at: new Date("2024-01-15"),
    },
    {
      tmdb_id: 67890,
      title: "Another Movie",
      release_year: 1995,
      updated_at: new Date("2024-01-10"),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("generates valid XML for page 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: mockMovies })

    const result = await generateMoviesSitemap(1)

    expect(result.notFound).toBe(false)
    expect(result.isEmpty).toBe(false)
    expect(result.xml).toContain("<urlset")
    expect(result.xml).toContain("/movie/test-movie-2020-12345")
    expect(result.xml).toContain("/movie/another-movie-1995-67890")
    expect(result.xml).toContain("<lastmod>2024-01-15</lastmod>")
    expect(result.xml).toContain("<priority>0.6</priority>")
    expect(result.xml).toContain("<changefreq>monthly</changefreq>")
  })

  it("uses correct offset for page 2", async () => {
    mockQuery.mockResolvedValueOnce({ rows: mockMovies })

    await generateMoviesSitemap(2)

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [URLS_PER_SITEMAP, URLS_PER_SITEMAP])
  })

  it("returns notFound for empty results on page > 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await generateMoviesSitemap(2)

    expect(result.notFound).toBe(true)
    expect(result.xml).toBe("")
  })

  it("returns empty urlset for page 1 with no results", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await generateMoviesSitemap(1)

    expect(result.notFound).toBe(false)
    expect(result.isEmpty).toBe(true)
    expect(result.xml).toContain("<urlset")
    expect(result.xml).toContain("</urlset>")
  })

  it("returns empty result for invalid page number", async () => {
    const result = await generateMoviesSitemap(0)

    expect(result.xml).toBe("")
    expect(result.notFound).toBe(false)
    expect(result.isEmpty).toBe(false)
  })

  it("returns empty result for NaN page", async () => {
    const result = await generateMoviesSitemap(NaN)

    expect(result.xml).toBe("")
  })

  it("escapes XML special characters in slugs", async () => {
    const moviesWithSpecialChars = [
      {
        tmdb_id: 11111,
        title: "Movie & Friends <Test>",
        release_year: 2020,
        updated_at: new Date("2024-01-15"),
      },
    ]
    mockQuery.mockResolvedValueOnce({ rows: moviesWithSpecialChars })

    const result = await generateMoviesSitemap(1)

    expect(result.xml).not.toContain("&<>")
  })
})

describe("generateActorsSitemap", () => {
  let mockQuery: ReturnType<typeof vi.fn>

  const mockActors = [
    {
      id: 1,
      tmdb_id: 12345,
      name: "John Doe",
      updated_at: new Date("2024-01-15"),
    },
    {
      id: 2,
      tmdb_id: 67890,
      name: "Jane Smith",
      updated_at: new Date("2024-01-10"),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("generates valid XML for page 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: mockActors })

    const result = await generateActorsSitemap(1)

    expect(result.notFound).toBe(false)
    expect(result.xml).toContain("<urlset")
    expect(result.xml).toContain("/actor/john-doe-1")
    expect(result.xml).toContain("/actor/jane-smith-2")
    expect(result.xml).toContain("<priority>0.5</priority>")
  })

  it("returns notFound for empty results on page > 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await generateActorsSitemap(2)

    expect(result.notFound).toBe(true)
  })

  it("returns empty result for invalid page number", async () => {
    const result = await generateActorsSitemap(-1)

    expect(result.xml).toBe("")
  })
})

describe("generateShowsSitemap", () => {
  let mockQuery: ReturnType<typeof vi.fn>

  const mockShows = [
    {
      tmdb_id: 12345,
      name: "Test Show",
      first_air_year: 2015,
      updated_at: new Date("2024-01-15"),
    },
    {
      tmdb_id: 67890,
      name: "Another Show",
      first_air_year: null,
      updated_at: new Date("2024-01-10"),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("generates valid XML for page 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: mockShows })

    const result = await generateShowsSitemap(1)

    expect(result.notFound).toBe(false)
    expect(result.xml).toContain("<urlset")
    expect(result.xml).toContain("/show/test-show-2015-12345")
    expect(result.xml).toContain("/show/another-show-unknown-67890")
    expect(result.xml).toContain("<priority>0.6</priority>")
  })

  it("handles null first_air_year", async () => {
    const showsWithNullYear = [
      {
        tmdb_id: 11111,
        name: "Unknown Year Show",
        first_air_year: null,
        updated_at: new Date("2024-01-15"),
      },
    ]
    mockQuery.mockResolvedValueOnce({ rows: showsWithNullYear })

    const result = await generateShowsSitemap(1)

    expect(result.xml).toContain("/show/unknown-year-show-unknown-11111")
  })

  it("returns notFound for empty results on page > 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    const result = await generateShowsSitemap(100)

    expect(result.notFound).toBe(true)
  })
})

describe("generateAllSitemaps", () => {
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("generates all sitemaps with single pages", async () => {
    // Page counts query
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "100" }] }) // movies
      .mockResolvedValueOnce({ rows: [{ count: "50" }] }) // actors
      .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // shows
    // Additional queries for page counts in generateSitemapIndex
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "100" }] })
      .mockResolvedValueOnce({ rows: [{ count: "50" }] })
      .mockResolvedValueOnce({ rows: [{ count: "10" }] })
    // Content queries
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ tmdb_id: 1, title: "Movie", release_year: 2020, updated_at: new Date() }],
      })
      .mockResolvedValueOnce({
        rows: [{ tmdb_id: 2, name: "Actor", updated_at: new Date() }],
      })
      .mockResolvedValueOnce({
        rows: [{ tmdb_id: 3, name: "Show", first_air_year: 2015, updated_at: new Date() }],
      })

    const result = await generateAllSitemaps()

    expect(result.files.has("sitemap.xml")).toBe(true)
    expect(result.files.has("sitemap-static.xml")).toBe(true)
    expect(result.files.has("sitemap-movies.xml")).toBe(true)
    expect(result.files.has("sitemap-actors.xml")).toBe(true)
    expect(result.files.has("sitemap-shows.xml")).toBe(true)
    expect(result.files.has("sitemap-death-details.xml")).toBe(false)
    expect(result.pageCounts).toEqual({ movies: 1, actors: 1, shows: 1 })
  })

  it("generates paginated sitemaps when content exceeds 50k", async () => {
    // Page counts query
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "75000" }] }) // movies: 2 pages
      .mockResolvedValueOnce({ rows: [{ count: "50" }] }) // actors
      .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // shows
    // Additional queries for generateSitemapIndex
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "75000" }] })
      .mockResolvedValueOnce({ rows: [{ count: "50" }] })
      .mockResolvedValueOnce({ rows: [{ count: "10" }] })
    // Content queries for movies (2 pages)
    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 1, title: "Movie 1", release_year: 2020, updated_at: new Date() }],
    })
    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 2, title: "Movie 2", release_year: 2021, updated_at: new Date() }],
    })
    // Content queries for actors and shows
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ tmdb_id: 3, name: "Actor", updated_at: new Date() }],
      })
      .mockResolvedValueOnce({
        rows: [{ tmdb_id: 4, name: "Show", first_air_year: 2015, updated_at: new Date() }],
      })

    const result = await generateAllSitemaps()

    expect(result.files.has("sitemap-movies-1.xml")).toBe(true)
    expect(result.files.has("sitemap-movies-2.xml")).toBe(true)
    expect(result.files.has("sitemap-movies.xml")).toBe(false)
    expect(result.files.has("sitemap-actors.xml")).toBe(true)
    expect(result.files.has("sitemap-shows.xml")).toBe(true)
    expect(result.files.has("sitemap-death-details.xml")).toBe(false)
    expect(result.pageCounts.movies).toBe(2)
  })
})
