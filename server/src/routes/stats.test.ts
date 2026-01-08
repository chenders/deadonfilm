import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import {
  getStats,
  getRecentDeathsHandler,
  getCovidDeathsHandler,
  getUnnaturalDeathsHandler,
} from "./stats.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getSiteStats: vi.fn(),
  getRecentDeaths: vi.fn(),
  getCovidDeaths: vi.fn(),
  getUnnaturalDeaths: vi.fn(),
  UNNATURAL_DEATH_CATEGORIES: {
    suicide: { label: "Suicide", patterns: ["suicide"] },
    accident: { label: "Accident", patterns: ["accident"] },
    overdose: { label: "Overdose", patterns: ["overdose"] },
    homicide: { label: "Homicide", patterns: ["homicide", "murder"] },
    other: { label: "Other", patterns: [] },
  },
}))

vi.mock("../lib/newrelic.js", () => ({
  recordCustomEvent: vi.fn(),
}))

import { recordCustomEvent } from "../lib/newrelic.js"

describe("getStats", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockStats = {
    totalActors: 500000,
    totalDeceasedActors: 1500,
    totalMoviesAnalyzed: 350,
    topCauseOfDeath: "Cancer",
    topCauseOfDeathCategorySlug: "cancer",
    avgMortalityPercentage: 42.5,
    causeOfDeathPercentage: 25.8,
    actorsWithCauseKnown: 387,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Ensure DATABASE_URL is set for tests
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
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
      totalActors: 0,
      totalDeceasedActors: 0,
      totalMoviesAnalyzed: 0,
      topCauseOfDeath: null,
      topCauseOfDeathCategorySlug: null,
      avgMortalityPercentage: null,
      causeOfDeathPercentage: null,
      actorsWithCauseKnown: null,
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
      totalActors: 10000,
      totalDeceasedActors: 100,
      totalMoviesAnalyzed: 50,
      topCauseOfDeath: null,
      topCauseOfDeathCategorySlug: null,
      avgMortalityPercentage: null,
      causeOfDeathPercentage: null,
      actorsWithCauseKnown: null,
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
      cause_of_death_details: "Died peacefully at home",
      profile_path: "/path1.jpg",
    },
    {
      tmdb_id: 2,
      name: "Actor Two",
      deathday: "2024-01-10",
      cause_of_death: null,
      cause_of_death_details: null,
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
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
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

  const mockCovidPersons = [
    {
      id: 1,
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
      popularity: 15.0,
      violent_death: false,
      tvmaze_person_id: null,
      thetvdb_person_id: null,
      imdb_person_id: null,
      is_obscure: false,
      deathday_confidence: null,
      deathday_verification_source: null,
      deathday_verified_at: null,
    },
    {
      id: 2,
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
      popularity: null,
      violent_death: null,
      tvmaze_person_id: null,
      thetvdb_person_id: null,
      imdb_person_id: null,
      is_obscure: true,
      deathday_confidence: null,
      deathday_verification_source: null,
      deathday_verified_at: null,
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
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
    }
  })

  it("returns COVID deaths with default pagination", async () => {
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockCovidPersons,
      totalCount: 2,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0, includeObscure: false })
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
      persons: mockCovidPersons,
      totalCount: 52,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 50, includeObscure: false })
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
      persons: mockCovidPersons,
      totalCount: 2,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0, includeObscure: false })
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
      persons: mockCovidPersons,
      totalCount: 2,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    // NaN from parseInt defaults to 1
    expect(db.getCovidDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0, includeObscure: false })
  })

  it("calculates totalPages correctly", async () => {
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockCovidPersons,
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

  it("records CovidDeathsQuery custom event with correct attributes", async () => {
    mockReq.query = { page: "2", includeObscure: "true" }
    vi.mocked(db.getCovidDeaths).mockResolvedValueOnce({
      persons: mockCovidPersons,
      totalCount: 75,
    })

    await getCovidDeathsHandler(mockReq as Request, mockRes as Response)

    expect(recordCustomEvent).toHaveBeenCalledWith(
      "CovidDeathsQuery",
      expect.objectContaining({
        page: 2,
        includeObscure: true,
        resultCount: 2,
        totalCount: 75,
        responseTimeMs: expect.any(Number),
      })
    )
  })
})

describe("getUnnaturalDeathsHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockUnnaturalPersons = [
    {
      id: 1,
      tmdb_id: 1,
      name: "Actor One",
      birthday: "1960-01-01",
      deathday: "2020-05-15",
      cause_of_death: "Suicide",
      cause_of_death_source: "claude" as const,
      cause_of_death_details: "Took own life",
      cause_of_death_details_source: "claude" as const,
      wikipedia_url: "https://en.wikipedia.org/wiki/Actor_One",
      profile_path: "/path1.jpg",
      age_at_death: 60,
      expected_lifespan: 78,
      years_lost: 18,
      popularity: 25.0,
      violent_death: true,
      tvmaze_person_id: null,
      thetvdb_person_id: null,
      imdb_person_id: null,
      is_obscure: false,
      deathday_confidence: null,
      deathday_verification_source: null,
      deathday_verified_at: null,
    },
    {
      id: 2,
      tmdb_id: 2,
      name: "Actor Two",
      birthday: "1970-03-20",
      deathday: "2019-08-10",
      cause_of_death: "Accident",
      cause_of_death_source: "wikipedia" as const,
      cause_of_death_details: "Car crash",
      cause_of_death_details_source: "wikipedia" as const,
      wikipedia_url: null,
      profile_path: null,
      age_at_death: 49,
      expected_lifespan: 80,
      years_lost: 31,
      popularity: null,
      violent_death: true,
      tvmaze_person_id: null,
      thetvdb_person_id: null,
      imdb_person_id: null,
      is_obscure: true,
      deathday_confidence: null,
      deathday_verification_source: null,
      deathday_verified_at: null,
    },
  ]

  const mockCategoryCounts = {
    suicide: 10,
    accident: 25,
    overdose: 15,
    homicide: 5,
    other: 8,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Ensure DATABASE_URL is set for tests
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

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

  it("returns unnatural deaths with default pagination", async () => {
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 63,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      category: "all",
      showSelfInflicted: false,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith({
      persons: [
        {
          rank: 1,
          id: 1,
          name: "Actor One",
          deathday: "2020-05-15",
          causeOfDeath: "Suicide",
          causeOfDeathDetails: "Took own life",
          profilePath: "/path1.jpg",
          ageAtDeath: 60,
        },
        {
          rank: 2,
          id: 2,
          name: "Actor Two",
          deathday: "2019-08-10",
          causeOfDeath: "Accident",
          causeOfDeathDetails: "Car crash",
          profilePath: null,
          ageAtDeath: 49,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 50,
        totalCount: 63,
        totalPages: 2,
      },
      categories: [
        { id: "suicide", label: "Suicide", count: 10 },
        { id: "accident", label: "Accident", count: 25 },
        { id: "overdose", label: "Overdose", count: 15 },
        { id: "homicide", label: "Homicide", count: 5 },
        { id: "other", label: "Other", count: 8 },
      ],
      selectedCategory: "all",
      showSelfInflicted: false,
    })
  })

  it("parses category from query params", async () => {
    mockReq.query = { category: "accident" }
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 25,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      category: "accident",
      showSelfInflicted: false,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCategory: "accident",
      })
    )
  })

  it("ignores invalid category and defaults to all", async () => {
    mockReq.query = { category: "invalid_category" }
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 63,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      category: "all",
      showSelfInflicted: false,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCategory: "all",
      })
    )
  })

  it("parses showSelfInflicted from query params", async () => {
    mockReq.query = { showSelfInflicted: "true" }
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 63,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      category: "all",
      showSelfInflicted: true,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        showSelfInflicted: true,
      })
    )
  })

  it("parses page from query params", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 63,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 50,
      category: "all",
      showSelfInflicted: false,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        persons: expect.arrayContaining([
          expect.objectContaining({ rank: 51 }),
          expect.objectContaining({ rank: 52 }),
        ]),
        pagination: expect.objectContaining({
          page: 2,
        }),
      })
    )
  })

  it("enforces minimum page of 1", async () => {
    mockReq.query = { page: "0" }
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 63,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      category: "all",
      showSelfInflicted: false,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ page: 1 }),
      })
    )
  })

  it("returns empty response when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      persons: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      categories: [],
      categoryCounts: {},
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getUnnaturalDeaths).mockRejectedValueOnce(new Error("Database error"))

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch unnatural deaths" },
    })
  })

  it("handles empty result from database", async () => {
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: [],
      totalCount: 0,
      categoryCounts: { suicide: 0, accident: 0, overdose: 0, homicide: 0, other: 0 },
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      persons: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
      categories: [
        { id: "suicide", label: "Suicide", count: 0 },
        { id: "accident", label: "Accident", count: 0 },
        { id: "overdose", label: "Overdose", count: 0 },
        { id: "homicide", label: "Homicide", count: 0 },
        { id: "other", label: "Other", count: 0 },
      ],
      selectedCategory: "all",
      showSelfInflicted: false,
    })
  })

  it("handles invalid page gracefully", async () => {
    mockReq.query = { page: "invalid" }
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 63,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    // NaN from parseInt defaults to 1
    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      category: "all",
      showSelfInflicted: false,
      includeObscure: false,
    })
  })

  it("combines category and showSelfInflicted filters", async () => {
    mockReq.query = { category: "overdose", showSelfInflicted: "true" }
    vi.mocked(db.getUnnaturalDeaths).mockResolvedValueOnce({
      persons: mockUnnaturalPersons,
      totalCount: 15,
      categoryCounts: mockCategoryCounts,
    })

    await getUnnaturalDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getUnnaturalDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      category: "overdose",
      showSelfInflicted: true,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCategory: "overdose",
        showSelfInflicted: true,
      })
    )
  })
})
