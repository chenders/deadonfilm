import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import {
  getCauseCategoryIndexHandler,
  getCauseCategoryHandler,
  getSpecificCauseHandler,
} from "./causes.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getCauseCategoryIndex: vi.fn(),
  getCauseCategory: vi.fn(),
  getSpecificCause: vi.fn(),
}))

vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
  },
}))

import newrelic from "newrelic"

describe("getCauseCategoryIndexHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockIndexData = {
    categories: [
      {
        slug: "cancer",
        label: "Cancer",
        count: 150,
        avgAge: 68.5,
        avgYearsLost: 10.2,
        topCauses: [
          { cause: "Lung cancer", slug: "lung-cancer", count: 45 },
          { cause: "Pancreatic cancer", slug: "pancreatic-cancer", count: 30 },
        ],
      },
      {
        slug: "heart-disease",
        label: "Heart Disease",
        count: 100,
        avgAge: 72.3,
        avgYearsLost: 6.5,
        topCauses: [{ cause: "Heart attack", slug: "heart-attack", count: 60 }],
      },
    ],
    totalWithKnownCause: 500,
    overallAvgAge: 70.1,
    overallAvgYearsLost: 8.3,
    mostCommonCategory: "cancer",
  }

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

  it("returns category index from database", async () => {
    vi.mocked(db.getCauseCategoryIndex).mockResolvedValueOnce(mockIndexData)

    await getCauseCategoryIndexHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategoryIndex).toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith(mockIndexData)
  })

  it("returns empty response when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getCauseCategoryIndexHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategoryIndex).not.toHaveBeenCalled()
    expect(jsonSpy).toHaveBeenCalledWith({
      categories: [],
      totalWithKnownCause: 0,
      overallAvgAge: null,
      overallAvgYearsLost: null,
      mostCommonCategory: null,
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getCauseCategoryIndex).mockRejectedValueOnce(new Error("Database error"))

    await getCauseCategoryIndexHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch cause categories" },
    })
  })

  it("records custom event with correct attributes", async () => {
    vi.mocked(db.getCauseCategoryIndex).mockResolvedValueOnce(mockIndexData)

    await getCauseCategoryIndexHandler(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "CausesCategoryIndexFetch",
      expect.objectContaining({
        categoryCount: 2,
        totalWithKnownCause: 500,
        durationMs: expect.any(Number),
      })
    )
  })
})

describe("getCauseCategoryHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockCategoryData = {
    slug: "cancer",
    label: "Cancer",
    count: 150,
    avgAge: 68.5,
    avgYearsLost: 10.2,
    percentage: 30.0,
    notableActors: [
      {
        id: 1,
        tmdbId: 12345,
        name: "Actor One",
        profilePath: "/path1.jpg",
        deathday: "2020-01-15",
        causeOfDeath: "Lung cancer",
        causeOfDeathDetails: "Stage 4 lung cancer",
        ageAtDeath: 65,
      },
    ],
    decadeBreakdown: [
      { decade: "2020", count: 45 },
      { decade: "2010", count: 60 },
    ],
    specificCauses: [
      { cause: "Lung cancer", slug: "lung-cancer", count: 45, avgAge: 67.2 },
      { cause: "Pancreatic cancer", slug: "pancreatic-cancer", count: 30, avgAge: 70.1 },
    ],
    actors: [
      {
        rank: 1,
        id: 1,
        tmdbId: 12345,
        name: "Actor One",
        profilePath: "/path1.jpg",
        deathday: "2020-01-15",
        causeOfDeath: "Lung cancer",
        causeOfDeathDetails: "Stage 4 lung cancer",
        ageAtDeath: 65,
        yearsLost: 12,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: 150,
      totalPages: 3,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { categorySlug: "cancer" },
      query: {},
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
    }
  })

  it("returns category detail for valid slug", async () => {
    vi.mocked(db.getCauseCategory).mockResolvedValueOnce(mockCategoryData)

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategory).toHaveBeenCalledWith("cancer", {
      page: 1,
      includeObscure: false,
      specificCause: null,
    })
    expect(jsonSpy).toHaveBeenCalledWith(mockCategoryData)
  })

  it("returns 400 when category slug is missing", async () => {
    mockReq.params = {}

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Category slug is required" },
    })
  })

  it("returns 404 for invalid category slug", async () => {
    mockReq.params = { categorySlug: "invalid-category" }

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Category not found" },
    })
  })

  it("returns 404 when category not found in database", async () => {
    vi.mocked(db.getCauseCategory).mockResolvedValueOnce(null)

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Category not found" },
    })
  })

  it("handles pagination with page parameter", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getCauseCategory).mockResolvedValueOnce(mockCategoryData)

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategory).toHaveBeenCalledWith("cancer", {
      page: 2,
      includeObscure: false,
      specificCause: null,
    })
  })

  it("enforces minimum page of 1", async () => {
    mockReq.query = { page: "0" }
    vi.mocked(db.getCauseCategory).mockResolvedValueOnce(mockCategoryData)

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategory).toHaveBeenCalledWith("cancer", {
      page: 1,
      includeObscure: false,
      specificCause: null,
    })
  })

  it("handles includeObscure parameter", async () => {
    mockReq.query = { includeObscure: "true" }
    vi.mocked(db.getCauseCategory).mockResolvedValueOnce(mockCategoryData)

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategory).toHaveBeenCalledWith("cancer", {
      page: 1,
      includeObscure: true,
      specificCause: null,
    })
  })

  it("handles specificCause filter parameter", async () => {
    mockReq.query = { cause: "lung-cancer" }
    vi.mocked(db.getCauseCategory).mockResolvedValueOnce(mockCategoryData)

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategory).toHaveBeenCalledWith("cancer", {
      page: 1,
      includeObscure: false,
      specificCause: "lung-cancer",
    })
  })

  it("returns 404 when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(db.getCauseCategory).not.toHaveBeenCalled()
    expect(statusSpy).toHaveBeenCalledWith(404)
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getCauseCategory).mockRejectedValueOnce(new Error("Database error"))

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch cause category" },
    })
  })

  it("records custom event with correct attributes", async () => {
    mockReq.query = { page: "2", includeObscure: "true" }
    vi.mocked(db.getCauseCategory).mockResolvedValueOnce(mockCategoryData)

    await getCauseCategoryHandler(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "CausesCategoryFetch",
      expect.objectContaining({
        categorySlug: "cancer",
        page: 2,
        includeObscure: true,
        actorCount: 1,
        totalCount: 150,
        durationMs: expect.any(Number),
      })
    )
  })
})

describe("getSpecificCauseHandler", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockSpecificCauseData = {
    cause: "Lung cancer",
    slug: "lung-cancer",
    categorySlug: "cancer",
    categoryLabel: "Cancer",
    count: 45,
    avgAge: 67.2,
    avgYearsLost: 11.5,
    notableActors: [
      {
        id: 1,
        tmdbId: 12345,
        name: "Actor One",
        profilePath: "/path1.jpg",
        deathday: "2020-01-15",
        causeOfDeathDetails: "Stage 4 lung cancer",
        ageAtDeath: 65,
      },
    ],
    decadeBreakdown: [
      { decade: "2020", count: 15 },
      { decade: "2010", count: 20 },
    ],
    actors: [
      {
        rank: 1,
        id: 1,
        tmdbId: 12345,
        name: "Actor One",
        profilePath: "/path1.jpg",
        deathday: "2020-01-15",
        causeOfDeathDetails: "Stage 4 lung cancer",
        ageAtDeath: 65,
        yearsLost: 12,
      },
    ],
    pagination: {
      page: 1,
      pageSize: 50,
      totalCount: 45,
      totalPages: 1,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { categorySlug: "cancer", causeSlug: "lung-cancer" },
      query: {},
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: vi.fn(),
    }
  })

  it("returns specific cause detail for valid slugs", async () => {
    vi.mocked(db.getSpecificCause).mockResolvedValueOnce(mockSpecificCauseData)

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getSpecificCause).toHaveBeenCalledWith("cancer", "lung-cancer", {
      page: 1,
      includeObscure: false,
    })
    expect(jsonSpy).toHaveBeenCalledWith(mockSpecificCauseData)
  })

  it("returns 400 when slugs are missing", async () => {
    mockReq.params = {}

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Category and cause slugs are required" },
    })
  })

  it("returns 400 when cause slug is missing", async () => {
    mockReq.params = { categorySlug: "cancer" }

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Category and cause slugs are required" },
    })
  })

  it("returns 404 for invalid category slug", async () => {
    mockReq.params = { categorySlug: "invalid-category", causeSlug: "lung-cancer" }

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Category not found" },
    })
  })

  it("returns 404 when cause not found in database", async () => {
    vi.mocked(db.getSpecificCause).mockResolvedValueOnce(null)

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Cause not found" },
    })
  })

  it("handles pagination with page parameter", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getSpecificCause).mockResolvedValueOnce(mockSpecificCauseData)

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getSpecificCause).toHaveBeenCalledWith("cancer", "lung-cancer", {
      page: 2,
      includeObscure: false,
    })
  })

  it("enforces minimum page of 1", async () => {
    mockReq.query = { page: "-1" }
    vi.mocked(db.getSpecificCause).mockResolvedValueOnce(mockSpecificCauseData)

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getSpecificCause).toHaveBeenCalledWith("cancer", "lung-cancer", {
      page: 1,
      includeObscure: false,
    })
  })

  it("handles includeObscure parameter", async () => {
    mockReq.query = { includeObscure: "true" }
    vi.mocked(db.getSpecificCause).mockResolvedValueOnce(mockSpecificCauseData)

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getSpecificCause).toHaveBeenCalledWith("cancer", "lung-cancer", {
      page: 1,
      includeObscure: true,
    })
  })

  it("returns 404 when DATABASE_URL is not set", async () => {
    delete process.env.DATABASE_URL

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(db.getSpecificCause).not.toHaveBeenCalled()
    expect(statusSpy).toHaveBeenCalledWith(404)
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getSpecificCause).mockRejectedValueOnce(new Error("Database error"))

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch specific cause" },
    })
  })

  it("records custom event with correct attributes", async () => {
    mockReq.query = { page: "1", includeObscure: "false" }
    vi.mocked(db.getSpecificCause).mockResolvedValueOnce(mockSpecificCauseData)

    await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "SpecificCauseFetch",
      expect.objectContaining({
        categorySlug: "cancer",
        causeSlug: "lung-cancer",
        cause: "Lung cancer",
        page: 1,
        includeObscure: false,
        actorCount: 1,
        totalCount: 45,
        durationMs: expect.any(Number),
      })
    )
  })

  it("validates all supported category slugs", async () => {
    const validSlugs = [
      "cancer",
      "heart-disease",
      "respiratory",
      "neurological",
      "accident",
      "overdose",
      "suicide",
      "homicide",
      "infectious",
      "liver-kidney",
      "natural",
      "other",
    ]

    for (const slug of validSlugs) {
      vi.clearAllMocks()
      mockReq.params = { categorySlug: slug, causeSlug: "some-cause" }
      vi.mocked(db.getSpecificCause).mockResolvedValueOnce(mockSpecificCauseData)

      await getSpecificCauseHandler(mockReq as Request, mockRes as Response)

      expect(db.getSpecificCause).toHaveBeenCalled()
    }
  })
})
