import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { searchMovies } from "./search.js"

// Mock the dependencies
vi.mock("../lib/tmdb.js", () => ({
  searchMovies: vi.fn(),
  searchTVShows: vi.fn(),
}))

vi.mock("../lib/newrelic.js", () => ({
  recordCustomEvent: vi.fn(),
  addCustomAttributes: vi.fn(),
}))

import { searchMovies as tmdbSearch } from "../lib/tmdb.js"
import newrelic from "newrelic"

describe("searchMovies route", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }
  })

  it("returns empty results for empty query", async () => {
    mockReq = { query: { q: "" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
  })

  it("returns empty results for short query", async () => {
    mockReq = { query: { q: "a" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
  })

  it("returns empty results for missing query", async () => {
    mockReq = { query: {} }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      results: [],
      page: 1,
      total_pages: 0,
      total_results: 0,
    })
  })

  it("preserves TMDB order for movies with same relevance score", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: "First Movie",
          popularity: 10,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
        {
          id: 2,
          title: "Second Movie",
          popularity: 100,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
        {
          id: 3,
          title: "Third Movie",
          popularity: 50,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
      ],
      total_pages: 1,
      total_results: 3,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: "movie" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    // All have same relevance (title contains "movie"), so TMDB order is preserved
    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results[0].id).toBe(1)
    expect(calledWith.results[1].id).toBe(2)
    expect(calledWith.results[2].id).toBe(3)
  })

  it("limits results to 10", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: Array.from({ length: 20 }, (_, i) => ({
        id: i,
        title: `Movie ${i}`,
        popularity: 20 - i,
        release_date: "2020-01-01",
        poster_path: null,
        overview: "",
        genre_ids: [],
        original_language: "en",
      })),
      total_pages: 1,
      total_results: 20,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: "test" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results.length).toBe(10)
  })

  it("returns only necessary fields plus media_type", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 123,
          title: "Test Movie",
          release_date: "2020-05-15",
          poster_path: "/abc123.jpg",
          overview: "A great movie",
          popularity: 50,
          genre_ids: [28, 12],
          extra_field: "should not appear",
        },
      ],
      total_pages: 1,
      total_results: 1,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse as any)
    mockReq = { query: { q: "test" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results[0]).toEqual({
      id: 123,
      title: "Test Movie",
      release_date: "2020-05-15",
      poster_path: "/abc123.jpg",
      overview: "A great movie",
      media_type: "movie",
    })
    expect(calledWith.results[0]).not.toHaveProperty("popularity")
    expect(calledWith.results[0]).not.toHaveProperty("genre_ids")
    expect(calledWith.results[0]).not.toHaveProperty("extra_field")
  })

  it("handles TMDB API errors", async () => {
    vi.mocked(tmdbSearch).mockRejectedValue(new Error("API error"))
    mockReq = { query: { q: "test" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to search" },
    })
  })

  it("handles movies with null popularity", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: "No Pop",
          popularity: null,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
        },
        {
          id: 2,
          title: "Has Pop",
          popularity: 50,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
        },
      ],
      total_pages: 1,
      total_results: 2,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse as any)
    mockReq = { query: { q: "test" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    // Should not throw and return results
    expect(jsonSpy).toHaveBeenCalled()
    const calledWith = jsonSpy.mock.calls[0][0]
    expect(calledWith.results.length).toBe(2)
  })

  it("prioritizes exact title matches over popularity", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: "The Matrix Reloaded",
          popularity: 200,
          release_date: "2003-05-15",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
        {
          id: 2,
          title: "The Matrix",
          popularity: 50,
          release_date: "1999-03-31",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
      ],
      total_pages: 1,
      total_results: 2,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: "the matrix" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    const calledWith = jsonSpy.mock.calls[0][0]
    // Exact match "The Matrix" should come first despite lower popularity
    expect(calledWith.results[0].id).toBe(2)
    expect(calledWith.results[1].id).toBe(1)
  })

  it("boosts movies from matching year when query is a year", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: "1984",
          popularity: 30,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
        {
          id: 2,
          title: "Nineteen Eighty-Four",
          popularity: 40,
          release_date: "1984-10-10",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
        {
          id: 3,
          title: "1984",
          popularity: 25,
          release_date: "1984-10-10",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
      ],
      total_pages: 1,
      total_results: 3,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: "1984" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    const calledWith = jsonSpy.mock.calls[0][0]
    // "1984" (1984) gets exact match (100) + year bonus (75) = highest score
    expect(calledWith.results[0].id).toBe(3)
    // "1984" (2020) gets exact match (100) but no year bonus
    expect(calledWith.results[1].id).toBe(1)
    // "Nineteen Eighty-Four" (1984) only gets year bonus (75), no title match
    expect(calledWith.results[2].id).toBe(2)
  })

  it("prioritizes title-starts-with matches", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: "A Dirty Work Story",
          popularity: 100,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
        {
          id: 2,
          title: "Dirty Work",
          popularity: 20,
          release_date: "1998-06-12",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
      ],
      total_pages: 1,
      total_results: 2,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: "dirty work" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    const calledWith = jsonSpy.mock.calls[0][0]
    // Exact match "Dirty Work" should beat "A Dirty Work Story"
    expect(calledWith.results[0].id).toBe(2)
    expect(calledWith.results[1].id).toBe(1)
  })

  it("records Search custom event with correct attributes", async () => {
    const mockTmdbResponse = {
      page: 1,
      results: [
        {
          id: 1,
          title: "Test Movie",
          popularity: 50,
          release_date: "2020-01-01",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
        {
          id: 2,
          title: "Another Movie",
          popularity: 30,
          release_date: "2019-01-01",
          poster_path: null,
          overview: "",
          genre_ids: [],
          original_language: "en",
        },
      ],
      total_pages: 1,
      total_results: 2,
    }

    vi.mocked(tmdbSearch).mockResolvedValue(mockTmdbResponse)
    mockReq = { query: { q: "test movie" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "Search",
      expect.objectContaining({
        query: "test movie",
        type: "movie",
        resultCount: 2,
        responseTimeMs: expect.any(Number),
      })
    )
  })

  it("does not record Search event for empty query", async () => {
    mockReq = { query: { q: "" } }

    await searchMovies(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).not.toHaveBeenCalled()
  })
})
