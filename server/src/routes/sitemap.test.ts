import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import {
  getSitemapIndex,
  getStaticSitemap,
  getMoviesSitemap,
  getActorsSitemap,
  getShowsSitemap,
} from "./sitemap.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getPool: vi.fn(),
}))

describe("getSitemapIndex", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let sendSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    sendSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn()

    mockReq = {}
    mockRes = {
      send: sendSpy as Response["send"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }

    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("returns sitemap index with single page for each content type", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "100" }] }) // movies
      .mockResolvedValueOnce({ rows: [{ count: "50" }] }) // actors
      .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // shows

    await getSitemapIndex(mockReq as Request, mockRes as Response)

    expect(setSpy).toHaveBeenCalledWith("Content-Type", "application/xml")
    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=3600")
    expect(sendSpy).toHaveBeenCalled()

    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain("<sitemapindex")
    expect(xml).toContain("sitemap-static.xml")
    expect(xml).toContain("sitemap-movies.xml")
    expect(xml).toContain("sitemap-actors.xml")
    expect(xml).toContain("sitemap-shows.xml")
    expect(xml).not.toContain("sitemap-death-details.xml")
    // Should NOT have numbered suffixes for single pages
    expect(xml).not.toContain("sitemap-movies-1.xml")
  })

  it("returns sitemap index with pagination when content exceeds 50k", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "75000" }] }) // movies: 2 pages
      .mockResolvedValueOnce({ rows: [{ count: "150000" }] }) // actors: 3 pages
      .mockResolvedValueOnce({ rows: [{ count: "25000" }] }) // shows: 1 page

    await getSitemapIndex(mockReq as Request, mockRes as Response)

    const xml = sendSpy.mock.calls[0][0] as string
    // Movies should have 2 pages
    expect(xml).toContain("sitemap-movies-1.xml")
    expect(xml).toContain("sitemap-movies-2.xml")
    expect(xml).not.toContain("sitemap-movies-3.xml")

    // Actors should have 3 pages
    expect(xml).toContain("sitemap-actors-1.xml")
    expect(xml).toContain("sitemap-actors-2.xml")
    expect(xml).toContain("sitemap-actors-3.xml")
    expect(xml).not.toContain("sitemap-actors-4.xml")

    // Shows should have single page (no suffix)
    expect(xml).toContain("sitemap-shows.xml")
    expect(xml).not.toContain("sitemap-shows-1.xml")
  })

  it("handles zero entries for a content type", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // movies: 0
      .mockResolvedValueOnce({ rows: [{ count: "100" }] }) // actors
      .mockResolvedValueOnce({ rows: [{ count: "50" }] }) // shows

    await getSitemapIndex(mockReq as Request, mockRes as Response)

    const xml = sendSpy.mock.calls[0][0] as string
    // Static should always be present
    expect(xml).toContain("sitemap-static.xml")
    // Movies with 0 count should still have entry (pageCount = 0, which is <= 1)
    expect(xml).toContain("sitemap-movies.xml")
  })

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Database error"))

    await getSitemapIndex(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith("Error generating sitemap index")
  })
})

describe("getStaticSitemap", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let sendSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    sendSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn()

    mockReq = {}
    mockRes = {
      send: sendSpy as Response["send"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }
  })

  it("returns valid XML with all static pages", async () => {
    await getStaticSitemap(mockReq as Request, mockRes as Response)

    expect(setSpy).toHaveBeenCalledWith("Content-Type", "application/xml")
    expect(sendSpy).toHaveBeenCalled()

    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain("<urlset")
    expect(xml).toContain("https://deadonfilm.com/")
    expect(xml).not.toContain("https://deadonfilm.com/cursed-movies")
    expect(xml).not.toContain("https://deadonfilm.com/cursed-actors")
    expect(xml).toContain("https://deadonfilm.com/covid-deaths")
    expect(xml).toContain("https://deadonfilm.com/death-watch")
    expect(xml).toContain("<priority>1.0</priority>") // Homepage priority
    expect(xml).toContain("<changefreq>daily</changefreq>")
    expect(xml).toContain("<changefreq>weekly</changefreq>")
  })

  it("includes lastmod with today's date", async () => {
    const today = new Date().toISOString().split("T")[0]

    await getStaticSitemap(mockReq as Request, mockRes as Response)

    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain(`<lastmod>${today}</lastmod>`)
  })
})

describe("getMoviesSitemap", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let sendSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>
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

    sendSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn()

    mockReq = {
      params: {},
    }
    mockRes = {
      send: sendSpy as Response["send"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }

    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("returns movies sitemap for page 1 (default)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: mockMovies })

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [50000, 0])
    expect(setSpy).toHaveBeenCalledWith("Content-Type", "application/xml")
    expect(sendSpy).toHaveBeenCalled()

    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain("<urlset")
    expect(xml).toContain("/movie/test-movie-2020-12345")
    expect(xml).toContain("/movie/another-movie-1995-67890")
    expect(xml).toContain("<lastmod>2024-01-15</lastmod>")
    expect(xml).toContain("<priority>0.6</priority>")
    expect(xml).toContain("<changefreq>monthly</changefreq>")
  })

  it("returns movies sitemap for specific page", async () => {
    mockReq.params = { page: "2" }
    mockQuery.mockResolvedValueOnce({ rows: mockMovies })

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    // Page 2 should have offset of 50000
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [50000, 50000])
  })

  it("returns 400 for invalid page number (0)", async () => {
    mockReq.params = { page: "0" }

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith("Invalid page number")
  })

  it("returns 400 for negative page number", async () => {
    mockReq.params = { page: "-1" }

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith("Invalid page number")
  })

  it("returns 400 for non-numeric page", async () => {
    mockReq.params = { page: "abc" }

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(sendSpy).toHaveBeenCalledWith("Invalid page number")
  })

  it("returns 404 for empty results on page > 1", async () => {
    mockReq.params = { page: "999" }
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(sendSpy).toHaveBeenCalledWith("Sitemap page not found")
  })

  it("returns empty urlset for page 1 with no results", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    // Should NOT return 404 for page 1, just empty urlset
    expect(statusSpy).not.toHaveBeenCalled()
    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain("<urlset")
    expect(xml).toContain("</urlset>")
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

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    const xml = sendSpy.mock.calls[0][0] as string
    // The slug itself won't have special chars (they're replaced), but the escapeXml is called
    expect(xml).not.toContain("&<>")
  })

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Database error"))

    await getMoviesSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith("Error generating movies sitemap")
  })
})

describe("getActorsSitemap", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let sendSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>
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

    sendSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn()

    mockReq = {
      params: {},
    }
    mockRes = {
      send: sendSpy as Response["send"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }

    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("returns actors sitemap for page 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: mockActors })

    await getActorsSitemap(mockReq as Request, mockRes as Response)

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [50000, 0])
    expect(setSpy).toHaveBeenCalledWith("Content-Type", "application/xml")

    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain("<urlset")
    expect(xml).toContain("/actor/john-doe-1")
    expect(xml).toContain("/actor/jane-smith-2")
    expect(xml).toContain("<priority>0.5</priority>") // Actor priority is 0.5
  })

  it("returns 400 for invalid page number", async () => {
    mockReq.params = { page: "0" }

    await getActorsSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
  })

  it("returns 404 for empty results on page > 1", async () => {
    mockReq.params = { page: "2" }
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getActorsSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
  })

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Database error"))

    await getActorsSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith("Error generating actors sitemap")
  })
})

describe("getShowsSitemap", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let sendSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>
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

    sendSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn()

    mockReq = {
      params: {},
    }
    mockRes = {
      send: sendSpy as Response["send"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }

    mockQuery = vi.fn()
    vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as never)
  })

  it("returns shows sitemap for page 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: mockShows })

    await getShowsSitemap(mockReq as Request, mockRes as Response)

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [50000, 0])
    expect(setSpy).toHaveBeenCalledWith("Content-Type", "application/xml")

    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain("<urlset")
    expect(xml).toContain("/show/test-show-2015-12345")
    expect(xml).toContain("/show/another-show-unknown-67890") // null year becomes "unknown"
    expect(xml).toContain("<priority>0.6</priority>")
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

    await getShowsSitemap(mockReq as Request, mockRes as Response)

    const xml = sendSpy.mock.calls[0][0] as string
    expect(xml).toContain("/show/unknown-year-show-unknown-11111")
  })

  it("returns 400 for invalid page number", async () => {
    mockReq.params = { page: "-5" }

    await getShowsSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
  })

  it("returns 404 for empty results on page > 1", async () => {
    mockReq.params = { page: "100" }
    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getShowsSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
  })

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Database error"))

    await getShowsSitemap(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(sendSpy).toHaveBeenCalledWith("Error generating shows sitemap")
  })
})
