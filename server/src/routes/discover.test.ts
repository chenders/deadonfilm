import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getCursedMovies } from "./discover.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getHighMortalityMovies: vi.fn(),
}))

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
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
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
})
