import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Request, Response } from "express"
import {
  getCursedMovies,
  getCursedMoviesFilters,
  getDiscoverMovie,
  getForeverYoungMoviesHandler,
} from "./discover.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getHighMortalityMovies: vi.fn(),
  getMaxValidMinDeaths: vi.fn(),
  getForeverYoungMovies: vi.fn(),
  getForeverYoungMoviesPaginated: vi.fn(),
}))

vi.mock("../lib/newrelic.js", () => ({
  recordCustomEvent: vi.fn(),
}))

import { recordCustomEvent } from "../lib/newrelic.js"

describe("getCursedMovies", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockMovies = [
    {
      tmdb_id: 1,
      title: "Cursed Movie 1",
      release_date: "1980-01-01",
      release_year: 1980,
      poster_path: "/poster1.jpg",
      genres: ["Drama"],
      original_language: "en",
      production_countries: ["US"],
      popularity: 10.5,
      vote_average: 7.5,
      deceased_count: 15,
      cast_count: 20,
      living_count: 5,
      expected_deaths: 5,
      mortality_surprise_score: 2.0,
    },
    {
      tmdb_id: 2,
      title: "Cursed Movie 2",
      release_date: "1990-01-01",
      release_year: 1990,
      poster_path: "/poster2.jpg",
      genres: ["Horror"],
      original_language: "en",
      production_countries: ["US"],
      popularity: 8.2,
      vote_average: 6.8,
      deceased_count: 10,
      cast_count: 15,
      living_count: 5,
      expected_deaths: 4,
      mortality_surprise_score: 1.5,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

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

  it("returns movies with pagination metadata", async () => {
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      movies: expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          id: 1,
          title: "Cursed Movie 1",
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

  it("parses page parameter correctly", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 50, // page 2 = offset 50
      })
    )
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

  it("parses fromDecade filter correctly", async () => {
    mockReq.query = { from: "1980" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 50,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        fromYear: 1980,
      })
    )
  })

  it("parses toDecade filter and converts to end of decade", async () => {
    mockReq.query = { to: "1990" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 50,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        toYear: 1999, // 1990 + 9
      })
    )
  })

  it("parses minDeaths filter correctly", async () => {
    mockReq.query = { minDeaths: "10" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 30,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        minDeadActors: 10,
      })
    )
  })

  it("defaults minDeaths to 3", async () => {
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        minDeadActors: 3,
      })
    )
  })

  it("defaults includeObscure to false (hides obscure movies)", async () => {
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        includeObscure: false,
      })
    )
  })

  it("parses includeObscure=true correctly", async () => {
    mockReq.query = { includeObscure: "true" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        includeObscure: true,
      })
    )
  })

  it("treats includeObscure=false as false", async () => {
    mockReq.query = { includeObscure: "false" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        includeObscure: false,
      })
    )
  })

  it("limits to 100 movies per page", async () => {
    mockReq.query = { limit: "200" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 100,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100, // Capped at 100
      })
    )
  })

  it("enforces max 20 pages", async () => {
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 5000, // Would be 100 pages at 50 per page
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          totalPages: 20, // Capped at 20
        }),
      })
    )
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getHighMortalityMovies).mockRejectedValueOnce(new Error("Database error"))

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch cursed movies" },
    })
  })

  it("handles all filters together", async () => {
    mockReq.query = {
      page: "2",
      from: "1970",
      to: "1990",
      minDeaths: "5",
      limit: "25",
    }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 75,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(db.getHighMortalityMovies).toHaveBeenCalledWith({
      limit: 25,
      offset: 25, // page 2 with limit 25
      fromYear: 1970,
      toYear: 1999, // 1990 + 9
      minDeadActors: 5,
      includeObscure: false,
    })

    expect(jsonSpy).toHaveBeenCalledWith({
      movies: expect.arrayContaining([
        expect.objectContaining({
          rank: 26, // First item on page 2 with 25 per page
        }),
      ]),
      pagination: {
        page: 2,
        pageSize: 25,
        totalCount: 75,
        totalPages: 3,
      },
    })
  })

  it("records CursedMoviesQuery custom event with correct attributes", async () => {
    mockReq.query = { page: "2", from: "1980", to: "1990", minDeaths: "5", includeObscure: "true" }
    vi.mocked(db.getHighMortalityMovies).mockResolvedValueOnce({
      movies: mockMovies,
      totalCount: 50,
    })

    await getCursedMovies(mockReq as Request, mockRes as Response)

    expect(recordCustomEvent).toHaveBeenCalledWith(
      "CursedMoviesQuery",
      expect.objectContaining({
        page: 2,
        fromDecade: 1980,
        toDecade: 1990,
        minDeaths: 5,
        includeObscure: true,
        resultCount: 2,
        totalCount: 50,
        responseTimeMs: expect.any(Number),
      })
    )
  })
})

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
    })
  })
})

describe("getCursedMoviesFilters", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let endSpy: ReturnType<typeof vi.fn>
  const originalEnv = process.env.DATABASE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgres://test"

    jsonSpy = vi.fn()
    setSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    endSpy = vi.fn()

    mockReq = {
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as unknown as Response["json"],
      status: statusSpy as unknown as Response["status"],
      set: setSpy as unknown as Response["set"],
      end: endSpy as unknown as Response["end"],
    }
  })

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv
  })

  it("returns maxMinDeaths from database", async () => {
    vi.mocked(db.getMaxValidMinDeaths).mockResolvedValueOnce(15)

    await getCursedMoviesFilters(mockReq as Request, mockRes as Response)

    expect(db.getMaxValidMinDeaths).toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ maxMinDeaths: 15 })
  })

  it("sets ETag header on response", async () => {
    vi.mocked(db.getMaxValidMinDeaths).mockResolvedValueOnce(10)

    await getCursedMoviesFilters(mockReq as Request, mockRes as Response)

    expect(setSpy).toHaveBeenCalledWith("ETag", expect.stringMatching(/^"[a-f0-9]{32}"$/))
    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=3600")
  })

  it("returns 304 Not Modified when ETag matches", async () => {
    // First call to get the ETag
    vi.mocked(db.getMaxValidMinDeaths).mockResolvedValue(10)
    await getCursedMoviesFilters(mockReq as Request, mockRes as Response)

    // Get the ETag that was set
    const etagCall = setSpy.mock.calls.find((call) => call[0] === "ETag")
    const etag = etagCall![1] as string

    // Reset mocks for second call
    vi.clearAllMocks()
    ;(mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(etag)

    await getCursedMoviesFilters(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(304)
    expect(endSpy).toHaveBeenCalled()
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it("returns default when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getCursedMoviesFilters(mockReq as Request, mockRes as Response)

    expect(db.getMaxValidMinDeaths).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ maxMinDeaths: 3 })
  })

  it("returns default on database error", async () => {
    vi.mocked(db.getMaxValidMinDeaths).mockRejectedValueOnce(new Error("Database error"))

    await getCursedMoviesFilters(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({ maxMinDeaths: 3 })
  })
})
