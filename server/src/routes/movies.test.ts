import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getGenreCategoriesHandler, getMoviesByGenreHandler } from "./movies.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getGenreCategories: vi.fn(),
  getMoviesByGenre: vi.fn(),
  getGenreFromSlug: vi.fn(),
}))

describe("getGenreCategoriesHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockGenres = [
    { genre: "Action", slug: "action", count: 150 },
    { genre: "Drama", slug: "drama", count: 200 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {}
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }
  })

  it("returns genre categories from database", async () => {
    vi.mocked(db.getGenreCategories).mockResolvedValueOnce(mockGenres)

    await getGenreCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(db.getGenreCategories).toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ genres: mockGenres })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getGenreCategories).mockRejectedValueOnce(new Error("Database error"))

    await getGenreCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to load genre categories" },
    })
  })

  it("handles empty result from database", async () => {
    vi.mocked(db.getGenreCategories).mockResolvedValueOnce([])

    await getGenreCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({ genres: [] })
  })
})

describe("getMoviesByGenreHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockMovies = [
    {
      tmdb_id: 1,
      title: "Movie One",
      release_year: 2020,
      poster_path: "/poster1.jpg",
      deceased_count: 5,
      cast_count: 20,
      expected_deaths: 3.5,
      mortality_surprise_score: 0.43,
    },
    {
      tmdb_id: 2,
      title: "Movie Two",
      release_year: 2015,
      poster_path: null,
      deceased_count: 10,
      cast_count: 30,
      expected_deaths: 8.0,
      mortality_surprise_score: 0.25,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { genre: "action" },
      query: {},
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }
  })

  it("returns movies for a valid genre", async () => {
    vi.mocked(db.getGenreFromSlug).mockResolvedValueOnce("Action")
    vi.mocked(db.getMoviesByGenre).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 2,
    })

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(db.getGenreFromSlug).toHaveBeenCalledWith("action")
    expect(db.getMoviesByGenre).toHaveBeenCalledWith("Action", { limit: 50, offset: 0 })
    expect(jsonSpy).toHaveBeenCalledWith({
      genre: "Action",
      slug: "action",
      movies: [
        {
          id: 1,
          title: "Movie One",
          releaseYear: 2020,
          posterPath: "/poster1.jpg",
          deceasedCount: 5,
          castCount: 20,
          expectedDeaths: 3.5,
          mortalitySurpriseScore: 0.43,
        },
        {
          id: 2,
          title: "Movie Two",
          releaseYear: 2015,
          posterPath: null,
          deceasedCount: 10,
          castCount: 30,
          expectedDeaths: 8.0,
          mortalitySurpriseScore: 0.25,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 2,
        totalPages: 1,
      },
    })
  })

  it("returns 400 when genre parameter is missing", async () => {
    mockReq.params = {}

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Genre parameter is required" },
    })
  })

  it("returns 404 when genre is not found", async () => {
    vi.mocked(db.getGenreFromSlug).mockResolvedValueOnce(null)

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Genre not found" },
    })
  })

  it("handles pagination with page parameter", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getGenreFromSlug).mockResolvedValueOnce("Action")
    vi.mocked(db.getMoviesByGenre).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(db.getMoviesByGenre).toHaveBeenCalledWith("Action", { limit: 50, offset: 50 })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          page: 2,
          totalPages: 2,
        }),
      })
    )
  })

  it("enforces minimum page of 1", async () => {
    mockReq.query = { page: "0" }
    vi.mocked(db.getGenreFromSlug).mockResolvedValueOnce("Action")
    vi.mocked(db.getMoviesByGenre).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 2,
    })

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(db.getMoviesByGenre).toHaveBeenCalledWith("Action", { limit: 50, offset: 0 })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getGenreFromSlug).mockRejectedValueOnce(new Error("Database error"))

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to load movies for this genre" },
    })
  })

  it("handles empty result from database", async () => {
    vi.mocked(db.getGenreFromSlug).mockResolvedValueOnce("Action")
    vi.mocked(db.getMoviesByGenre).mockResolvedValueOnce({
      movies: [],
      totalCount: 0,
    })

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      genre: "Action",
      slug: "action",
      movies: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("handles invalid page gracefully", async () => {
    mockReq.query = { page: "invalid" }
    vi.mocked(db.getGenreFromSlug).mockResolvedValueOnce("Action")
    vi.mocked(db.getMoviesByGenre).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 2,
    })

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    // NaN from parseInt defaults to 1
    expect(db.getMoviesByGenre).toHaveBeenCalledWith("Action", { limit: 50, offset: 0 })
  })

  it("calculates totalPages correctly", async () => {
    vi.mocked(db.getGenreFromSlug).mockResolvedValueOnce("Action")
    vi.mocked(db.getMoviesByGenre).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 125,
    })

    await getMoviesByGenreHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          totalPages: 3, // Math.ceil(125 / 50) = 3
        }),
      })
    )
  })
})
