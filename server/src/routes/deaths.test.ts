import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import {
  getCauseCategoriesHandler,
  getDeathsByCauseHandler,
  getDecadeCategoriesHandler,
  getDeathsByDecadeHandler,
  getAllDeathsHandler,
} from "./deaths.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getCauseCategories: vi.fn(),
  getDeathsByCause: vi.fn(),
  getCauseFromSlug: vi.fn(),
  getDecadeCategories: vi.fn(),
  getDeathsByDecade: vi.fn(),
  getAllDeaths: vi.fn(),
}))

vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
    addCustomAttribute: vi.fn(),
    addCustomAttributes: vi.fn(),
  },
}))

import newrelic from "newrelic"

describe("getCauseCategoriesHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockCauses = [
    { cause: "Cancer", slug: "cancer", count: 150 },
    { cause: "Heart Attack", slug: "heart-attack", count: 100 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
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

  it("returns cause categories from database", async () => {
    vi.mocked(db.getCauseCategories).mockResolvedValueOnce(mockCauses)

    await getCauseCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategories).toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ causes: mockCauses })
  })

  it("returns empty array when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getCauseCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategories).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ causes: [] })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getCauseCategories).mockRejectedValueOnce(new Error("Database error"))

    await getCauseCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch cause categories" },
    })
  })
})

describe("getDeathsByCauseHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockDeaths = [
    {
      tmdb_id: 1,
      name: "Actor One",
      deathday: "2021-03-15",
      profile_path: "/path1.jpg",
      cause_of_death: "Cancer",
      cause_of_death_details: "Lung cancer",
      age_at_death: 72,
      years_lost: 6,
    },
    {
      tmdb_id: 2,
      name: "Actor Two",
      deathday: "2020-12-01",
      profile_path: null,
      cause_of_death: "Cancer",
      cause_of_death_details: null,
      age_at_death: 65,
      years_lost: 13,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { cause: "cancer" },
      query: {},
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
    }
  })

  it("returns deaths for a valid cause", async () => {
    vi.mocked(db.getCauseFromSlug).mockResolvedValueOnce("Cancer")
    vi.mocked(db.getDeathsByCause).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 2,
    })

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseFromSlug).toHaveBeenCalledWith("cancer")
    expect(db.getDeathsByCause).toHaveBeenCalledWith("Cancer", {
      limit: 50,
      offset: 0,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith({
      cause: "Cancer",
      slug: "cancer",
      deaths: [
        {
          id: 1,
          name: "Actor One",
          deathday: "2021-03-15",
          profilePath: "/path1.jpg",
          causeOfDeath: "Cancer",
          causeOfDeathDetails: "Lung cancer",
          ageAtDeath: 72,
          yearsLost: 6,
        },
        {
          id: 2,
          name: "Actor Two",
          deathday: "2020-12-01",
          profilePath: null,
          causeOfDeath: "Cancer",
          causeOfDeathDetails: null,
          ageAtDeath: 65,
          yearsLost: 13,
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

  it("returns 400 when cause slug is missing", async () => {
    mockReq.params = {}

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Cause slug is required" },
    })
  })

  it("returns 404 when cause is not found", async () => {
    vi.mocked(db.getCauseFromSlug).mockResolvedValueOnce(null)

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Cause not found" },
    })
  })

  it("handles pagination with page parameter", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getCauseFromSlug).mockResolvedValueOnce("Cancer")
    vi.mocked(db.getDeathsByCause).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 100,
    })

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathsByCause).toHaveBeenCalledWith("Cancer", {
      limit: 50,
      offset: 50,
      includeObscure: false,
    })
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
    vi.mocked(db.getCauseFromSlug).mockResolvedValueOnce("Cancer")
    vi.mocked(db.getDeathsByCause).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 2,
    })

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathsByCause).toHaveBeenCalledWith("Cancer", {
      limit: 50,
      offset: 0,
      includeObscure: false,
    })
  })

  it("returns empty response when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseFromSlug).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      cause: null,
      deaths: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getCauseFromSlug).mockRejectedValueOnce(new Error("Database error"))

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch deaths by cause" },
    })
  })
})

describe("getDecadeCategoriesHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockDecades = [
    {
      decade: 2020,
      count: 50,
      featuredActor: {
        id: 1,
        tmdbId: 123,
        name: "Test Actor",
        profilePath: "/test.jpg",
        causeOfDeath: "Natural causes",
      },
      topCauses: [{ cause: "Natural causes", count: 20, slug: "natural-causes" }],
      topMovie: {
        tmdbId: 100,
        title: "Test Movie",
        releaseYear: 2020,
        backdropPath: "/backdrop.jpg",
      },
    },
    {
      decade: 2010,
      count: 120,
      featuredActor: null,
      topCauses: [],
      topMovie: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
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

  it("returns decade categories from database", async () => {
    vi.mocked(db.getDecadeCategories).mockResolvedValueOnce(mockDecades)

    await getDecadeCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(db.getDecadeCategories).toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ decades: mockDecades })
  })

  it("returns empty array when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getDecadeCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(db.getDecadeCategories).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({ decades: [] })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getDecadeCategories).mockRejectedValueOnce(new Error("Database error"))

    await getDecadeCategoriesHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch decade categories" },
    })
  })
})

describe("getDeathsByDecadeHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockDeaths = [
    {
      tmdb_id: 1,
      name: "Actor One",
      deathday: "2021-03-15",
      profile_path: "/path1.jpg",
      cause_of_death: "Cancer",
      age_at_death: 72,
      years_lost: 6,
    },
    {
      tmdb_id: 2,
      name: "Actor Two",
      deathday: "2020-12-01",
      profile_path: null,
      cause_of_death: "Heart Attack",
      age_at_death: 65,
      years_lost: 13,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { decade: "2020s" },
      query: {},
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
    }
  })

  it("returns deaths for a valid decade with 's' suffix", async () => {
    vi.mocked(db.getDeathsByDecade).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 2,
    })

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathsByDecade).toHaveBeenCalledWith(2020, {
      limit: 50,
      offset: 0,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith({
      decade: 2020,
      decadeLabel: "2020s",
      deaths: [
        {
          id: 1,
          name: "Actor One",
          deathday: "2021-03-15",
          profilePath: "/path1.jpg",
          causeOfDeath: "Cancer",
          ageAtDeath: 72,
          yearsLost: 6,
        },
        {
          id: 2,
          name: "Actor Two",
          deathday: "2020-12-01",
          profilePath: null,
          causeOfDeath: "Heart Attack",
          ageAtDeath: 65,
          yearsLost: 13,
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

  it("returns deaths for a valid decade without 's' suffix", async () => {
    mockReq.params = { decade: "2020" }
    vi.mocked(db.getDeathsByDecade).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 2,
    })

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathsByDecade).toHaveBeenCalledWith(2020, {
      limit: 50,
      offset: 0,
      includeObscure: false,
    })
  })

  it("returns 400 for invalid decade format", async () => {
    mockReq.params = { decade: "invalid" }

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid decade format. Use format like '1950s' or '1950'" },
    })
  })

  it("returns 400 for decade before 1900", async () => {
    mockReq.params = { decade: "1890s" }

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid decade. Must be a valid decade like 1950, 1960, etc." },
    })
  })

  it("returns 400 for decade in the future", async () => {
    mockReq.params = { decade: "2030s" }

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid decade. Must be a valid decade like 1950, 1960, etc." },
    })
  })

  it("returns 400 for non-decade year", async () => {
    mockReq.params = { decade: "2025" }

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid decade. Must be a valid decade like 1950, 1960, etc." },
    })
  })

  it("handles pagination with page parameter", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getDeathsByDecade).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 100,
    })

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathsByDecade).toHaveBeenCalledWith(2020, {
      limit: 50,
      offset: 50,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          page: 2,
          totalPages: 2,
        }),
      })
    )
  })

  it("returns empty response when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(db.getDeathsByDecade).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      decade: null,
      deaths: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getDeathsByDecade).mockRejectedValueOnce(new Error("Database error"))

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch deaths by decade" },
    })
  })
})

describe("getAllDeathsHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockPersons = [
    {
      id: 1,
      tmdb_id: 1,
      name: "Actor One",
      birthday: "1939-01-01",
      deathday: "2024-01-15",
      profile_path: "/path1.jpg",
      cause_of_death: "Natural causes",
      cause_of_death_source: "claude" as const,
      cause_of_death_details: "Died peacefully in sleep",
      cause_of_death_details_source: "claude" as const,
      wikipedia_url: "https://en.wikipedia.org/wiki/Actor_One",
      age_at_death: 85,
      expected_lifespan: 80,
      years_lost: -5,
      tmdb_popularity: 10.5,
      violent_death: false,
      tvmaze_person_id: null,
      thetvdb_person_id: null,
      imdb_person_id: null,
      is_obscure: false,
      deathday_confidence: null,
      deathday_verification_source: null,
      deathday_verified_at: null,
      dof_popularity: null,
      dof_popularity_confidence: null,
      dof_popularity_updated_at: null,
      biography: null,
      biography_source_url: null,
      biography_source_type: null,
      biography_generated_at: null,
      biography_raw_tmdb: null,
      biography_has_content: null,
    },
    {
      id: 2,
      tmdb_id: 2,
      name: "Actor Two",
      birthday: "1952-01-01",
      deathday: "2024-01-10",
      profile_path: null,
      cause_of_death: null,
      cause_of_death_source: null,
      cause_of_death_details: null,
      cause_of_death_details_source: null,
      wikipedia_url: null,
      age_at_death: 72,
      expected_lifespan: 78,
      years_lost: 6,
      tmdb_popularity: null,
      violent_death: null,
      tvmaze_person_id: null,
      thetvdb_person_id: null,
      imdb_person_id: null,
      is_obscure: true,
      deathday_confidence: null,
      deathday_verification_source: null,
      deathday_verified_at: null,
      dof_popularity: null,
      dof_popularity_confidence: null,
      dof_popularity_updated_at: null,
      biography: null,
      biography_source_url: null,
      biography_source_type: null,
      biography_generated_at: null,
      biography_raw_tmdb: null,
      biography_has_content: null,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
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

  it("returns all deaths with default pagination", async () => {
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 2,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getAllDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0, includeObscure: false })
    expect(jsonSpy).toHaveBeenCalledWith({
      deaths: [
        {
          rank: 1,
          id: 1,
          name: "Actor One",
          deathday: "2024-01-15",
          profilePath: "/path1.jpg",
          causeOfDeath: "Natural causes",
          causeOfDeathDetails: "Died peacefully in sleep",
          ageAtDeath: 85,
        },
        {
          rank: 2,
          id: 2,
          name: "Actor Two",
          deathday: "2024-01-10",
          profilePath: null,
          causeOfDeath: null,
          causeOfDeathDetails: null,
          ageAtDeath: 72,
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

  it("handles pagination with page parameter", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 52,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getAllDeaths).toHaveBeenCalledWith({ limit: 50, offset: 50, includeObscure: false })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deaths: expect.arrayContaining([
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
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 2,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getAllDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0, includeObscure: false })
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({ page: 1 }),
      })
    )
  })

  it("returns empty response when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getAllDeaths).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      deaths: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getAllDeaths).mockRejectedValueOnce(new Error("Database error"))

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch all deaths" },
    })
  })

  it("handles empty result from database", async () => {
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: [],
      totalCount: 0,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      deaths: [],
      pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
    })
  })

  it("handles invalid page gracefully", async () => {
    mockReq.query = { page: "invalid" }
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 2,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    // NaN from parseInt defaults to 1
    expect(db.getAllDeaths).toHaveBeenCalledWith({ limit: 50, offset: 0, includeObscure: false })
  })

  it("calculates totalPages correctly", async () => {
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 125,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          totalPages: 3, // Math.ceil(125 / 50) = 3
        }),
      })
    )
  })

  it("records AllDeathsQuery custom event with correct attributes", async () => {
    mockReq.query = { page: "2", includeObscure: "true" }
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 75,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "AllDeathsQuery",
      expect.objectContaining({
        page: 2,
        includeObscure: true,
        resultCount: 2,
        totalCount: 75,
        responseTimeMs: expect.any(Number),
      })
    )
  })

  it("parses search from query params", async () => {
    mockReq.query = { search: "John" }
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 2,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getAllDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      includeObscure: false,
      search: "John",
    })
  })

  it("combines search with other filters", async () => {
    mockReq.query = { search: "John", includeObscure: "true", page: "2" }
    vi.mocked(db.getAllDeaths).mockResolvedValueOnce({
      persons: mockPersons,
      totalCount: 100,
    })

    await getAllDeathsHandler(mockReq as Request, mockRes as Response)

    expect(db.getAllDeaths).toHaveBeenCalledWith({
      limit: 50,
      offset: 50,
      includeObscure: true,
      search: "John",
    })
  })
})

describe("recordCustomEvent tracking", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>

  const mockDeaths = [
    {
      tmdb_id: 1,
      name: "Actor One",
      deathday: "2021-03-15",
      profile_path: "/path1.jpg",
      cause_of_death: "Cancer",
      cause_of_death_details: "Lung cancer",
      age_at_death: 72,
      years_lost: 6,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()

    mockRes = {
      json: jsonSpy as Response["json"],
      status: vi.fn().mockReturnThis() as unknown as Response["status"],
      set: vi.fn(),
    }
  })

  it("records DeathsByCauseQuery custom event with correct attributes", async () => {
    mockReq = {
      params: { cause: "cancer" },
      query: { page: "2", includeObscure: "true" },
      get: vi.fn().mockReturnValue(undefined),
    }
    vi.mocked(db.getCauseFromSlug).mockResolvedValueOnce("Cancer")
    vi.mocked(db.getDeathsByCause).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 75,
    })

    await getDeathsByCauseHandler(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "DeathsByCauseQuery",
      expect.objectContaining({
        cause: "Cancer",
        page: 2,
        includeObscure: true,
        resultCount: 1,
        totalCount: 75,
        responseTimeMs: expect.any(Number),
      })
    )
  })

  it("records DeathsByDecadeQuery custom event with correct attributes", async () => {
    mockReq = {
      params: { decade: "2020s" },
      query: { page: "2", includeObscure: "true" },
      get: vi.fn().mockReturnValue(undefined),
    }
    vi.mocked(db.getDeathsByDecade).mockResolvedValueOnce({
      deaths: mockDeaths,
      totalCount: 75,
    })

    await getDeathsByDecadeHandler(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "DeathsByDecadeQuery",
      expect.objectContaining({
        decade: 2020,
        page: 2,
        includeObscure: true,
        resultCount: 1,
        totalCount: 75,
        responseTimeMs: expect.any(Number),
      })
    )
  })
})
