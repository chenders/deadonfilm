import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getStats, getRecentDeathsHandler, getCovidDeathsHandler } from "./stats.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getSiteStats: vi.fn(),
  getRecentDeaths: vi.fn(),
  getCovidDeaths: vi.fn(),
  getUnnaturalDeaths: vi.fn(),
  UNNATURAL_DEATH_CATEGORIES: {
    suicide: { label: "Suicide", patterns: [] },
    accident: { label: "Accident", patterns: [] },
    overdose: { label: "Overdose", patterns: [] },
    homicide: { label: "Homicide", patterns: [] },
    other: { label: "Other", patterns: [] },
  },
}))

describe("getStats", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockStats = {
    totalDeceasedActors: 1500,
    totalMoviesAnalyzed: 350,
    topCauseOfDeath: "Cancer",
    avgMortalityPercentage: 42.5,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Ensure DATABASE_URL is set for tests
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {}
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }
  })

  it("returns site stats from database", async () => {
    vi.mocked(db.getSiteStats).mockResolvedValueOnce(mockStats)

    await getStats(mockReq as Request, mockRes as Response)

    expect(db.getSiteStats).toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith(mockStats)
  })

  it("returns empty stats when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getStats(mockReq as Request, mockRes as Response)

    expect(db.getSiteStats).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      totalDeceasedActors: 0,
      totalMoviesAnalyzed: 0,
      topCauseOfDeath: null,
      avgMortalityPercentage: null,
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getSiteStats).mockRejectedValueOnce(new Error("Database error"))

    await getStats(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch site statistics" },
    })
  })

  it("handles null values in stats", async () => {
    const statsWithNulls = {
      totalDeceasedActors: 100,
      totalMoviesAnalyzed: 50,
      topCauseOfDeath: null,
      avgMortalityPercentage: null,
    }
    vi.mocked(db.getSiteStats).mockResolvedValueOnce(statsWithNulls)

    await getStats(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(statsWithNulls)
  })
})

describe("getRecentDeathsHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockDeaths = [
    {
      tmdb_id: 1,
      name: "Actor One",
      deathday: "2024-01-15",
      cause_of_death: "Natural causes",
      profile_path: "/path1.jpg",
    },
    {
      tmdb_id: 2,
      name: "Actor Two",
      deathday: "2024-01-10",
      cause_of_death: null,
      profile_path: null,
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
  })

  it("returns recent deaths with default limit", async () => {
    vi.mocked(db.getRecentDeaths).mockResolvedValueOnce(mockDeaths)

    await getRecentDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getRecentDeaths).toHaveBeenCalledWith(5)
    expect(jsonSpy).toHaveBeenCalledWith({ deaths: mockDeaths })
  })

  it("parses limit from query params", async () => {
    mockReq.query = { limit: "10" }
    vi.mocked(db.getRecentDeaths).mockResolvedValueOnce(mockDeaths)

    await getRecentDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getRecentDeaths).toHaveBeenCalledWith(10)
  })

  it("caps limit at 20", async () => {
    mockReq.query = { limit: "50" }
    vi.mocked(db.getRecentDeaths).mockResolvedValueOnce(mockDeaths)

    await getRecentDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getRecentDeaths).toHaveBeenCalledWith(20)
  })

  it("returns empty array when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getRecentDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getRecentDeaths).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ deaths: [] })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getRecentDeaths).mockRejectedValueOnce(new Error("Database error"))

    await getRecentDeathsHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch recent deaths" },
    })
  })

  it("handles empty result from database", async () => {
    vi.mocked(db.getRecentDeaths).mockResolvedValueOnce([])

    await getRecentDeathsHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({ deaths: [] })
  })

  it("handles invalid limit gracefully", async () => {
    mockReq.query = { limit: "invalid" }
    vi.mocked(db.getRecentDeaths).mockResolvedValueOnce(mockDeaths)

    await getRecentDeathsHandler(mockReq as Request, mockRes as Response)

    // NaN from parseInt defaults to 5
    expect(db.getRecentDeaths).toHaveBeenCalledWith(5)
  })
})

describe("getCovidDeathsHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockPersons = [
    {
      tmdb_id: 1,
      name: "Actor One",
      birthday: "1950-01-01",
      deathday: "2021-03-15",
      cause_of_death: "COVID-19",
      cause_of_death_source: "claude" as const,
      cause_of_death_details: "Complications from COVID-19",
      cause_of_death_details_source: "claude" as const,
      wikipedia_url: "https://en.wikipedia.org/wiki/Actor_One",
      profile_path: "/path1.jpg",
      age_at_death: 71,
      expected_lifespan: 78,
      years_lost: 7,
    },
    {
      tmdb_id: 2,
      name: "Actor Two",
      birthday: "1945-05-20",
      deathday: "2020-12-01",
      cause_of_death: "Coronavirus",
      cause_of_death_source: "wikipedia" as const,
      cause_of_death_details: null,
      cause_of_death_details_source: null,
      wikipedia_url: null,
      profile_path: null,
      age_at_death: 75,
      expected_lifespan: 80,
      years_lost: 5,
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
  })

  it("returns COVID deaths with default pagination", async () => {
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 2,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0 })
    expect(jsonSpy).toHaveBeenCalledWith({
      persons: [
        {
          rank: 1,
          id: 1,
          name: "Actor One",
          deathday: "2021-03-15",
          causeOfDeath: "COVID-19",
          causeOfDeathDetails: "Complications from COVID-19",
          profilePath: "/path1.jpg",
          ageAtDeath: 71,
        },
        {
          rank: 2,
          id: 2,
          name: "Actor Two",
          deathday: "2020-12-01",
          causeOfDeath: "Coronavirus",
          causeOfDeathDetails: null,
          profilePath: null,
          ageAtDeath: 75,
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
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 52,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 50 })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        persons: expect.arrayContaining([
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

  it("enforces minimum page of 1", async () => {
    mockReq.query = { page: "0" }
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 2,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0 })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ page: 1 }),
      })
    )
  })

  it("returns empty response when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getCovidDeaths).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      persons: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getCovidDeaths).mockRejectedValueOnce(new Error("Database error"))

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch COVID deaths" },
    })
  })

  it("handles empty result from database", async () => {
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: [],
      totalCount: 0,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      persons: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("handles invalid page gracefully", async () => {
    mockReq.query = { page: "invalid" }
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 2,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    // NaN from parseInt defaults to 1
    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0 })
  })

  it("calculates totalPages correctly", async () => {
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 125,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          totalPages: 3, // Math.ceil(125 / 50) = 3
        }),
      })
    )
  })
})
