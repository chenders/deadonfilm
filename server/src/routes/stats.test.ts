import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getStats, getRecentDeathsHandler } from "./stats.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getSiteStats: vi.fn(),
  getRecentDeaths: vi.fn(),
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
