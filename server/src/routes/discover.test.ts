import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Request, Response } from "express"
import { getDiscoverMovie, getForeverYoungMoviesHandler } from "./discover.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getForeverYoungMovies: vi.fn(),
  getForeverYoungMoviesPaginated: vi.fn(),
}))

describe("getDiscoverMovie", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockForeverYoungMovies = [
    {
      tmdb_id: 123,
      title: "Rebel Without a Cause",
      release_date: "1955-10-27",
      actor_name: "James Dean",
      years_lost: 52,
    },
    {
      tmdb_id: 456,
      title: "The Crow",
      release_date: "1994-05-13",
      actor_name: "Brandon Lee",
      years_lost: 48,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { type: "forever-young" },
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
    }
  })

  it("returns 400 when type is invalid", async () => {
    mockReq.params = { type: "invalid" }

    await getDiscoverMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid type. Use 'forever-young'" },
    })
  })

  it("returns a movie for forever-young type", async () => {
    vi.mocked(db.getForeverYoungMovies).mockResolvedValueOnce(mockForeverYoungMovies)

    await getDiscoverMovie(mockReq as Request, mockRes as Response)

    expect(db.getForeverYoungMovies).toHaveBeenCalledWith(100)
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(Number),
        title: expect.any(String),
        release_date: expect.any(String),
      })
    )
  })

  it("returns 404 when no movies are found", async () => {
    vi.mocked(db.getForeverYoungMovies).mockResolvedValueOnce([])

    await getDiscoverMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "No movie found" },
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getForeverYoungMovies).mockRejectedValueOnce(new Error("Database error"))

    await getDiscoverMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch movie" },
    })
  })

  it("returns one of the movies from the pool randomly", async () => {
    vi.mocked(db.getForeverYoungMovies).mockResolvedValueOnce(mockForeverYoungMovies)

    await getDiscoverMovie(mockReq as Request, mockRes as Response)

    // The returned movie should be one from the mock data
    const returnedMovie = jsonSpy.mock.calls[0][0]
    const validIds = mockForeverYoungMovies.map((m) => m.tmdb_id)
    expect(validIds).toContain(returnedMovie.id)
  })
})

describe("getForeverYoungMoviesHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  const originalEnv = process.env.DATABASE_URL

  const mockMovies = [
    {
      movie_tmdb_id: 100,
      movie_title: "Rebel Without a Cause",
      movie_release_year: 1955,
      movie_poster_path: "/poster1.jpg",
      actor_id: 1,
      actor_tmdb_id: 123,
      actor_name: "James Dean",
      actor_profile_path: "/profile1.jpg",
      years_lost: 45.5,
      cause_of_death: "Car accident",
      cause_of_death_details: "Fatal car crash",
    },
    {
      movie_tmdb_id: 200,
      movie_title: "The Crow",
      movie_release_year: 1994,
      movie_poster_path: "/poster2.jpg",
      actor_id: 2,
      actor_tmdb_id: 456,
      actor_name: "Brandon Lee",
      actor_profile_path: "/profile2.jpg",
      years_lost: 38.2,
      cause_of_death: "Accidental shooting",
      cause_of_death_details: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgres://test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      query: {},
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
    }
  })

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv
  })

  it("returns movies with pagination metadata", async () => {
    vi.mocked(db.getForeverYoungMoviesPaginated).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      movies: expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          id: 100,
          title: "Rebel Without a Cause",
          releaseYear: 1955,
          posterPath: "/poster1.jpg",
          actor: expect.objectContaining({
            id: 123,
            name: "James Dean",
            yearsLost: 45.5,
            causeOfDeath: "Car accident",
          }),
        }),
      ]),
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
      },
    })
  })

  it("parses page parameter correctly and calculates offset", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getForeverYoungMoviesPaginated).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    expect(db.getForeverYoungMoviesPaginated).toHaveBeenCalledWith({
      limit: 50,
      offset: 50, // page 2 = offset 50
      sort: "years_lost",
      dir: "desc",
    })

    // Rank should be based on global position
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        movies: expect.arrayContaining([
          expect.objectContaining({
            rank: 51, // First item on page 2
          }),
        ]),
      })
    )
  })

  it("returns empty results when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    expect(db.getForeverYoungMoviesPaginated).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      movies: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("enforces max 20 pages", async () => {
    vi.mocked(db.getForeverYoungMoviesPaginated).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 5000, // Would be 100 pages at 50 per page
    })

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          totalPages: 20, // Capped at 20
        }),
      })
    )
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getForeverYoungMoviesPaginated).mockRejectedValueOnce(new Error("Database error"))

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch forever young movies" },
    })
  })

  it("maps database records to API response format correctly", async () => {
    vi.mocked(db.getForeverYoungMoviesPaginated).mockResolvedValueOnce({
      movies: [mockMovies[0]],
      totalCount: 1,
    })

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    const response = jsonSpy.mock.calls[0][0]
    const movie = response.movies[0]

    expect(movie).toEqual({
      rank: 1,
      id: 100,
      title: "Rebel Without a Cause",
      releaseYear: 1955,
      posterPath: "/poster1.jpg",
      actor: {
        id: 123,
        name: "James Dean",
        profilePath: "/profile1.jpg",
        yearsLost: 45.5,
        causeOfDeath: "Car accident",
        causeOfDeathDetails: "Fatal car crash",
      },
    })
  })

  it("handles invalid page numbers by defaulting to page 1", async () => {
    mockReq.query = { page: "-5" }
    vi.mocked(db.getForeverYoungMoviesPaginated).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    expect(db.getForeverYoungMoviesPaginated).toHaveBeenCalledWith({
      limit: 50,
      offset: 0, // Should default to page 1
      sort: "years_lost",
      dir: "desc",
    })
  })

  it("handles non-numeric page parameter", async () => {
    mockReq.query = { page: "abc" }
    vi.mocked(db.getForeverYoungMoviesPaginated).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getForeverYoungMoviesHandler(mockReq as Request, mockRes as Response)

    expect(db.getForeverYoungMoviesPaginated).toHaveBeenCalledWith({
      limit: 50,
      offset: 0, // Should default to page 1
      sort: "years_lost",
      dir: "desc",
    })
  })
})
