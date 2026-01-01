import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getDeathWatchHandler } from "./death-watch.js"
import * as db from "../lib/db.js"
import * as mortalityStats from "../lib/mortality-stats.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getDeathWatchActors: vi.fn(),
}))

// Mock the mortality-stats module
vi.mock("../lib/mortality-stats.js", () => ({
  calculateCumulativeDeathProbability: vi.fn(),
  getCohortLifeExpectancy: vi.fn(),
}))

describe("getDeathWatchHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockActors = [
    {
      actor_id: 1,
      actor_tmdb_id: 1,
      actor_name: "Actor One",
      birthday: "1935-01-15",
      age: 89,
      profile_path: "/path1.jpg",
      popularity: 10.5,
      total_movies: 25,
      total_episodes: 50,
    },
    {
      actor_id: 2,
      actor_tmdb_id: 2,
      actor_name: "Actor Two",
      birthday: "1940-06-20",
      age: 84,
      profile_path: "/path2.jpg",
      popularity: 8.2,
      total_movies: 15,
      total_episodes: 100,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Ensure DATABASE_URL is set for tests
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      query: {},
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }

    // Default mock implementations
    vi.mocked(mortalityStats.calculateCumulativeDeathProbability).mockResolvedValue(0.15)
    vi.mocked(mortalityStats.getCohortLifeExpectancy).mockResolvedValue(75)
  })

  it("returns death watch actors with default pagination", async () => {
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      minAge: undefined,
      includeObscure: false,
      search: undefined,
    })
    expect(jsonSpy).toHaveBeenCalledWith({
      actors: [
        {
          rank: 1,
          id: 1,
          name: "Actor One",
          age: 89,
          birthday: "1935-01-15",
          profilePath: "/path1.jpg",
          deathProbability: 0.15,
          yearsRemaining: 0, // max(0, 75 - 89) rounded
          totalMovies: 25,
          totalEpisodes: 50,
        },
        {
          rank: 2,
          id: 2,
          name: "Actor Two",
          age: 84,
          birthday: "1940-06-20",
          profilePath: "/path2.jpg",
          deathProbability: 0.15,
          yearsRemaining: 0, // max(0, 75 - 84) rounded
          totalMovies: 15,
          totalEpisodes: 100,
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

  it("parses page from query params", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 52,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 50,
      })
    )
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: expect.arrayContaining([
          expect.objectContaining({ rank: 51 }),
          expect.objectContaining({ rank: 52 }),
        ]),
        pagination: expect.objectContaining({
          page: 2,
          totalPages: 2,
        }),
      })
    )
  })

  it("parses limit from query params", async () => {
    mockReq.query = { limit: "25" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
      })
    )
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          pageSize: 25,
        }),
      })
    )
  })

  it("caps limit at 100", async () => {
    mockReq.query = { limit: "200" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
      })
    )
  })

  it("enforces minimum limit of 1", async () => {
    // When limit is 0, the || operator defaults to 50, then Math.max(1, ...) ensures minimum of 1
    // Since 0 || 50 = 50, we test with -5 to ensure Math.max(1, ...) is applied
    mockReq.query = { limit: "-5" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1,
      })
    )
  })

  it("parses minAge from query params", async () => {
    mockReq.query = { minAge: "70" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        minAge: 70,
      })
    )
  })

  it("parses includeObscure from query params", async () => {
    mockReq.query = { includeObscure: "true" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        includeObscure: true,
      })
    )
  })

  it("enforces minimum page of 1", async () => {
    mockReq.query = { page: "-5" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
      })
    )
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ page: 1 }),
      })
    )
  })

  it("returns empty response when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      actors: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getDeathWatchActors).mockRejectedValueOnce(new Error("Database error"))

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch Death Watch data" },
    })
  })

  it("handles empty result from database", async () => {
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: [],
      totalCount: 0,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      actors: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("handles invalid page gracefully", async () => {
    mockReq.query = { page: "invalid" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    // NaN from parseInt defaults to 1
    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 0,
      })
    )
  })

  it("calculates totalPages correctly", async () => {
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 125,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          totalPages: 3, // Math.ceil(125 / 50) = 3
        }),
      })
    )
  })

  it("calculates death probability for each actor", async () => {
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    // Should be called once per actor for 1-year probability
    expect(mortalityStats.calculateCumulativeDeathProbability).toHaveBeenCalledTimes(2)
    expect(mortalityStats.calculateCumulativeDeathProbability).toHaveBeenCalledWith(
      89,
      90,
      "combined"
    )
    expect(mortalityStats.calculateCumulativeDeathProbability).toHaveBeenCalledWith(
      84,
      85,
      "combined"
    )
  })

  it("calculates years remaining based on cohort life expectancy", async () => {
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })
    vi.mocked(mortalityStats.getCohortLifeExpectancy).mockResolvedValue(85)

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(mortalityStats.getCohortLifeExpectancy).toHaveBeenCalledTimes(2)
    expect(mortalityStats.getCohortLifeExpectancy).toHaveBeenCalledWith(1935, "combined")
    expect(mortalityStats.getCohortLifeExpectancy).toHaveBeenCalledWith(1940, "combined")

    // Verify yearsRemaining calculations
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: expect.arrayContaining([
          expect.objectContaining({
            name: "Actor One",
            yearsRemaining: 0, // max(0, 85 - 89) = 0
          }),
          expect.objectContaining({
            name: "Actor Two",
            yearsRemaining: 1, // max(0, round((85 - 84) * 10) / 10) = 1
          }),
        ]),
      })
    )
  })

  it("sets yearsRemaining to null when cohort data is unavailable", async () => {
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: [mockActors[0]],
      totalCount: 1,
    })
    vi.mocked(mortalityStats.getCohortLifeExpectancy).mockRejectedValue(
      new Error("Birth year 1935 not found")
    )

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: expect.arrayContaining([
          expect.objectContaining({
            yearsRemaining: null,
          }),
        ]),
      })
    )
  })

  it("rounds death probability to 4 decimal places", async () => {
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: [mockActors[0]],
      totalCount: 1,
    })
    vi.mocked(mortalityStats.calculateCumulativeDeathProbability).mockResolvedValue(0.123456789)

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: expect.arrayContaining([
          expect.objectContaining({
            deathProbability: 0.1235, // Rounded to 4 decimal places
          }),
        ]),
      })
    )
  })

  it("parses search from query params", async () => {
    mockReq.query = { search: "Clint" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 2,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "Clint",
      })
    )
  })

  it("combines search with other filters", async () => {
    mockReq.query = { search: "Clint", includeObscure: "true", page: "2" }
    vi.mocked(db.getDeathWatchActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 100,
    })

    await getDeathWatchHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathWatchActors).toHaveBeenCalledWith({
      limit: 50,
      offset: 50,
      minAge: undefined,
      includeObscure: true,
      search: "Clint",
    })
  })
})
