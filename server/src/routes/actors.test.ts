import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getCursedActorsRoute } from "./actors.js"
import * as db from "../lib/db.js"

// Mock the db module
vi.mock("../lib/db.js", () => ({
  getCursedActors: vi.fn(),
}))

describe("getCursedActorsRoute", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let endSpy: ReturnType<typeof vi.fn>

  const mockActors = [
    {
      actor_tmdb_id: 1,
      actor_name: "Actor One",
      is_deceased: false,
      total_movies: 50,
      total_actual_deaths: 30,
      total_expected_deaths: 15,
      curse_score: 1.0,
    },
    {
      actor_tmdb_id: 2,
      actor_name: "Actor Two",
      is_deceased: true,
      total_movies: 40,
      total_actual_deaths: 25,
      total_expected_deaths: 12,
      curse_score: 1.08,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    setSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    endSpy = vi.fn()

    mockReq = {
      query: {},
      get: vi.fn().mockReturnValue(undefined),
    }
    mockRes = {
      json: jsonSpy as unknown as Response["json"],
      status: statusSpy as unknown as Response["status"],
      set: setSpy as unknown as Response["set"],
      end: endSpy as unknown as Response["end"],
    }
  })

  it("returns actors with pagination metadata", async () => {
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 100,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      actors: expect.arrayContaining([
        expect.objectContaining({
          rank: 1,
          id: 1,
          name: "Actor One",
          isDeceased: false,
          totalMovies: 50,
          curseScore: 1.0,
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

  it("sets ETag header on response", async () => {
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 100,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(setSpy).toHaveBeenCalledWith("ETag", expect.stringMatching(/^"[a-f0-9]{32}"$/))
    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=300")
  })

  it("returns 304 Not Modified when ETag matches", async () => {
    // First call to get the ETag
    vi.mocked(db.getCursedActors).mockResolvedValue({
      actors: mockActors,
      totalCount: 100,
    })
    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    // Get the ETag that was set
    const etagCall = setSpy.mock.calls.find((call) => call[0] === "ETag")
    const etag = etagCall![1] as string

    // Reset mocks for second call
    vi.clearAllMocks()
    ;(mockReq.get as ReturnType<typeof vi.fn>).mockReturnValue(etag)

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(304)
    expect(endSpy).toHaveBeenCalled()
    expect(jsonSpy).not.toHaveBeenCalled()
  })

  it("parses page parameter correctly", async () => {
    mockReq.query = { page: "2" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 100,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 50, // page 2 = offset 50
      })
    )
    // Rank should be based on global position
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: expect.arrayContaining([
          expect.objectContaining({
            rank: 51, // First item on page 2
          }),
        ]),
      })
    )
  })

  it("parses status filter correctly", async () => {
    mockReq.query = { status: "living" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 50,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        actorStatus: "living",
      })
    )
  })

  it("parses deceased status filter correctly", async () => {
    mockReq.query = { status: "deceased" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 50,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        actorStatus: "deceased",
      })
    )
  })

  it("defaults invalid status to all", async () => {
    mockReq.query = { status: "invalid" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 100,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        actorStatus: "all",
      })
    )
  })

  it("parses minMovies filter correctly", async () => {
    mockReq.query = { minMovies: "5" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 30,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        minMovies: 5,
      })
    )
  })

  it("defaults minMovies to 2", async () => {
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 100,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        minMovies: 2,
      })
    )
  })

  it("parses fromDecade filter correctly", async () => {
    mockReq.query = { from: "1980" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 50,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        fromYear: 1980,
      })
    )
  })

  it("parses toDecade filter and converts to end of decade", async () => {
    mockReq.query = { to: "1990" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 50,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        toYear: 1999, // 1990 + 9
      })
    )
  })

  it("limits to 100 actors per page", async () => {
    mockReq.query = { limit: "200" }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 100,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100, // Capped at 100
      })
    )
  })

  it("enforces max 20 pages", async () => {
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 5000, // Would be 100 pages at 50 per page
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: expect.objectContaining({
          totalPages: 20, // Capped at 20
        }),
      })
    )
  })

  it("returns 500 on database error", async () => {
    vi.mocked(db.getCursedActors).mockRejectedValueOnce(new Error("Database error"))

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch cursed actors" },
    })
  })

  it("handles all filters together", async () => {
    mockReq.query = {
      page: "2",
      from: "1970",
      to: "1990",
      minMovies: "5",
      status: "living",
      limit: "25",
    }
    vi.mocked(db.getCursedActors).mockResolvedValueOnce({
      actors: mockActors,
      totalCount: 75,
    })

    await getCursedActorsRoute(mockReq as Request, mockRes as Response)

    expect(db.getCursedActors).toHaveBeenCalledWith({
      limit: 25,
      offset: 25, // page 2 with limit 25
      minMovies: 5,
      actorStatus: "living",
      fromYear: 1970,
      toYear: 1999, // 1990 + 9
    })

    expect(jsonSpy).toHaveBeenCalledWith({
      actors: expect.arrayContaining([
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
