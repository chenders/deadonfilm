import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

// Mock the related-content DB module
vi.mock("../lib/db/related-content.js", () => ({
  getRelatedActors: vi.fn(),
  getRelatedMovies: vi.fn(),
  getRelatedShows: vi.fn(),
}))

// Mock the db module (for pool.query in the actors route)
const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}))
vi.mock("../lib/db.js", () => ({
  getPool: vi.fn().mockReturnValue({
    query: mockQuery,
  }),
}))

// Mock the cache module
vi.mock("../lib/cache.js", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  buildCacheKey: vi.fn(
    (prefix: string, params: Record<string, unknown>) => `${prefix}:${JSON.stringify(params)}`
  ),
  CACHE_TTL: { SHORT: 300, WEEK: 604800 },
  CACHE_PREFIX: {
    RELATED_ACTORS: "related-actors",
    RELATED_MOVIES: "related-movies",
    RELATED_SHOWS: "related-shows",
  },
}))

// Mock the etag module - pass through to res.json for simpler assertions
vi.mock("../lib/etag.js", () => ({
  sendWithETag: vi.fn((_req: Request, res: Response, data: unknown) => res.json(data)),
}))

import { getRelatedActorsRoute, getRelatedMoviesRoute, getRelatedShowsRoute } from "./related.js"
import { getRelatedActors, getRelatedMovies, getRelatedShows } from "../lib/db/related-content.js"
import { getCached, setCached } from "../lib/cache.js"
import { sendWithETag } from "../lib/etag.js"

// ============================================================================
// Helpers
// ============================================================================

function createMockReq(params: Record<string, string> = {}, query: Record<string, string> = {}) {
  return {
    params,
    query,
  } as unknown as Request
}

function createMockRes() {
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

// ============================================================================
// getRelatedActorsRoute
// ============================================================================

describe("getRelatedActorsRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 for invalid actor ID", async () => {
    const req = createMockReq({ id: "abc" })
    const res = createMockRes()

    await getRelatedActorsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid actor ID" } })
  })

  it("returns 400 for zero actor ID", async () => {
    const req = createMockReq({ id: "0" })
    const res = createMockRes()

    await getRelatedActorsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid actor ID" } })
  })

  it("returns 400 for negative actor ID", async () => {
    const req = createMockReq({ id: "-1" })
    const res = createMockRes()

    await getRelatedActorsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid actor ID" } })
  })

  it("returns 404 when actor not found", async () => {
    const req = createMockReq({ id: "999" })
    const res = createMockRes()

    mockQuery.mockResolvedValueOnce({ rows: [] })

    await getRelatedActorsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Actor not found" } })
  })

  it("returns related actors", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    const actorRow = {
      tmdb_id: 100,
      cause_of_death: "Heart attack",
      birthday: "1945-06-15",
    }
    mockQuery.mockResolvedValueOnce({ rows: [actorRow] })

    const mockRelatedActors = [
      {
        id: 10,
        tmdbId: 200,
        name: "John Smith",
        profilePath: "/profile.jpg",
        fallbackProfileUrl: null,
        deathday: "2020-01-15",
        causeOfDeath: "Heart attack",
        birthday: "1948-03-22",
      },
      {
        id: 11,
        tmdbId: 201,
        name: "Jane Doe",
        profilePath: null,
        fallbackProfileUrl: null,
        deathday: "2019-06-10",
        causeOfDeath: "Heart attack",
        birthday: "1942-11-05",
      },
    ]
    vi.mocked(getRelatedActors).mockResolvedValueOnce({
      actors: mockRelatedActors,
      matchType: "cause",
    })

    await getRelatedActorsRoute(req, res)

    expect(getRelatedActors).toHaveBeenCalledWith(42, "Heart attack", 1940)
    expect(sendWithETag).toHaveBeenCalledWith(
      req,
      res,
      { actors: mockRelatedActors, matchType: "cause" },
      604800
    )
    expect(res.json).toHaveBeenCalledWith({ actors: mockRelatedActors, matchType: "cause" })
  })

  it("passes null birth decade when birthday is null", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 100, cause_of_death: null, birthday: null }],
    })
    vi.mocked(getRelatedActors).mockResolvedValueOnce({ actors: [], matchType: "none" })

    await getRelatedActorsRoute(req, res)

    expect(getRelatedActors).toHaveBeenCalledWith(42, null, null)
  })

  it("handles actor with null tmdb_id", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: null, cause_of_death: "Cancer", birthday: "1950-01-01" }],
    })
    vi.mocked(getRelatedActors).mockResolvedValueOnce({ actors: [], matchType: "none" })

    await getRelatedActorsRoute(req, res)

    // Should pass actorId (42) for self-exclusion, not tmdb_id
    expect(getRelatedActors).toHaveBeenCalledWith(42, "Cancer", 1950)
    expect(res.json).toHaveBeenCalledWith({ actors: [], matchType: "none" })
  })

  it("computes birth decade correctly", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 100, cause_of_death: null, birthday: "1978-12-31" }],
    })
    vi.mocked(getRelatedActors).mockResolvedValueOnce({ actors: [], matchType: "none" })

    await getRelatedActorsRoute(req, res)

    expect(getRelatedActors).toHaveBeenCalledWith(42, null, 1970)
  })

  it("handles Date object from PostgreSQL for birthday", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    // PostgreSQL returns Date objects for date columns
    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 100, cause_of_death: "Cancer", birthday: new Date("1945-06-15") }],
    })
    vi.mocked(getRelatedActors).mockResolvedValueOnce({ actors: [], matchType: "none" })

    await getRelatedActorsRoute(req, res)

    expect(getRelatedActors).toHaveBeenCalledWith(42, "Cancer", 1940)
  })

  it("returns cached data when available", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    const cachedData = {
      actors: [
        {
          id: 10,
          tmdbId: 200,
          name: "Cached Actor",
          profilePath: null,
          fallbackProfileUrl: null,
          deathday: "2020-01-15",
          causeOfDeath: "Cancer",
          birthday: "1950-05-01",
        },
      ],
      matchType: "cause" as const,
    }
    vi.mocked(getCached).mockResolvedValueOnce(cachedData)

    await getRelatedActorsRoute(req, res)

    expect(sendWithETag).toHaveBeenCalledWith(req, res, cachedData, 604800)
    expect(mockQuery).not.toHaveBeenCalled()
    expect(getRelatedActors).not.toHaveBeenCalled()
  })

  it("caches the response after fetching from database", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    const mockRelated = [
      {
        id: 10,
        tmdbId: 200,
        name: "John Smith",
        profilePath: null,
        fallbackProfileUrl: null,
        deathday: "2020-01-15",
        causeOfDeath: "Cancer",
        birthday: "1950-05-01",
      },
    ]
    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 100, cause_of_death: "Cancer", birthday: "1950-01-01" }],
    })
    vi.mocked(getRelatedActors).mockResolvedValueOnce({
      actors: mockRelated,
      matchType: "cause",
    })

    await getRelatedActorsRoute(req, res)

    expect(setCached).toHaveBeenCalledWith(
      expect.any(String),
      { actors: mockRelated, matchType: "cause" },
      604800
    )
  })

  it("does not cache empty results and uses short HTTP TTL", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 100, cause_of_death: "Cancer", birthday: "1950-01-01" }],
    })
    vi.mocked(getRelatedActors).mockResolvedValueOnce({ actors: [], matchType: "none" })

    await getRelatedActorsRoute(req, res)

    expect(setCached).not.toHaveBeenCalled()
    expect(sendWithETag).toHaveBeenCalledWith(req, res, { actors: [], matchType: "none" }, 300)
    expect(res.json).toHaveBeenCalledWith({ actors: [], matchType: "none" })
  })

  it("returns 500 on database error", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    mockQuery.mockRejectedValueOnce(new Error("Database error"))

    await getRelatedActorsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { message: "Failed to fetch related actors" },
    })
  })

  it("returns 500 when getRelatedActors throws", async () => {
    const req = createMockReq({ id: "42" })
    const res = createMockRes()

    mockQuery.mockResolvedValueOnce({
      rows: [{ tmdb_id: 100, cause_of_death: "Cancer", birthday: "1950-01-01" }],
    })
    vi.mocked(getRelatedActors).mockRejectedValueOnce(new Error("Query failed"))

    await getRelatedActorsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { message: "Failed to fetch related actors" },
    })
  })
})

// ============================================================================
// getRelatedMoviesRoute
// ============================================================================

describe("getRelatedMoviesRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 for invalid movie ID", async () => {
    const req = createMockReq({ id: "abc" })
    const res = createMockRes()

    await getRelatedMoviesRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid movie ID" } })
  })

  it("returns 400 for zero movie ID", async () => {
    const req = createMockReq({ id: "0" })
    const res = createMockRes()

    await getRelatedMoviesRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid movie ID" } })
  })

  it("returns 400 for negative movie ID", async () => {
    const req = createMockReq({ id: "-5" })
    const res = createMockRes()

    await getRelatedMoviesRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid movie ID" } })
  })

  it("returns related movies", async () => {
    const req = createMockReq({ id: "550" })
    const res = createMockRes()

    const mockRelatedMovies = [
      {
        tmdbId: 680,
        title: "Pulp Fiction",
        releaseDate: "1994-10-14",
        posterPath: "/poster.jpg",
        deceasedCount: 8,
        castCount: 25,
        sharedCastCount: 3,
      },
      {
        tmdbId: 278,
        title: "The Shawshank Redemption",
        releaseDate: "1994-09-23",
        posterPath: "/shawshank.jpg",
        deceasedCount: 5,
        castCount: 20,
        sharedCastCount: 2,
      },
    ]
    vi.mocked(getRelatedMovies).mockResolvedValueOnce(mockRelatedMovies)

    await getRelatedMoviesRoute(req, res)

    expect(getRelatedMovies).toHaveBeenCalledWith(550)
    expect(sendWithETag).toHaveBeenCalledWith(req, res, { movies: mockRelatedMovies }, 604800)
    expect(res.json).toHaveBeenCalledWith({ movies: mockRelatedMovies })
  })

  it("returns cached data when available", async () => {
    const req = createMockReq({ id: "550" })
    const res = createMockRes()

    const cachedData = {
      movies: [
        {
          tmdbId: 680,
          title: "Cached Movie",
          releaseDate: "1994-10-14",
          posterPath: null,
          deceasedCount: 3,
          castCount: 15,
          sharedCastCount: 1,
        },
      ],
    }
    vi.mocked(getCached).mockResolvedValueOnce(cachedData)

    await getRelatedMoviesRoute(req, res)

    expect(sendWithETag).toHaveBeenCalledWith(req, res, cachedData, 604800)
    expect(getRelatedMovies).not.toHaveBeenCalled()
  })

  it("caches the response after fetching", async () => {
    const req = createMockReq({ id: "550" })
    const res = createMockRes()

    const mockRelated = [
      {
        tmdbId: 680,
        title: "Pulp Fiction",
        releaseDate: "1994-10-14",
        posterPath: null,
        deceasedCount: 3,
        castCount: 15,
        sharedCastCount: 1,
      },
    ]
    vi.mocked(getRelatedMovies).mockResolvedValueOnce(mockRelated)

    await getRelatedMoviesRoute(req, res)

    expect(setCached).toHaveBeenCalledWith(expect.any(String), { movies: mockRelated }, 604800)
  })

  it("does not cache empty results and uses short HTTP TTL", async () => {
    const req = createMockReq({ id: "550" })
    const res = createMockRes()

    vi.mocked(getRelatedMovies).mockResolvedValueOnce([])

    await getRelatedMoviesRoute(req, res)

    expect(setCached).not.toHaveBeenCalled()
    expect(sendWithETag).toHaveBeenCalledWith(req, res, { movies: [] }, 300)
    expect(res.json).toHaveBeenCalledWith({ movies: [] })
  })

  it("returns 500 on database error", async () => {
    const req = createMockReq({ id: "550" })
    const res = createMockRes()

    vi.mocked(getRelatedMovies).mockRejectedValueOnce(new Error("Database error"))

    await getRelatedMoviesRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { message: "Failed to fetch related movies" },
    })
  })
})

// ============================================================================
// getRelatedShowsRoute
// ============================================================================

describe("getRelatedShowsRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 for invalid show ID", async () => {
    const req = createMockReq({ id: "abc" })
    const res = createMockRes()

    await getRelatedShowsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid show ID" } })
  })

  it("returns 400 for zero show ID", async () => {
    const req = createMockReq({ id: "0" })
    const res = createMockRes()

    await getRelatedShowsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid show ID" } })
  })

  it("returns 400 for negative show ID", async () => {
    const req = createMockReq({ id: "-10" })
    const res = createMockRes()

    await getRelatedShowsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: { message: "Invalid show ID" } })
  })

  it("returns related shows", async () => {
    const req = createMockReq({ id: "1399" })
    const res = createMockRes()

    const mockRelatedShows = [
      {
        tmdbId: 1396,
        name: "Breaking Bad",
        firstAirDate: "2008-01-20",
        posterPath: "/bb.jpg",
        deceasedCount: 4,
        castCount: 30,
        sharedCastCount: 5,
      },
      {
        tmdbId: 60059,
        name: "Better Call Saul",
        firstAirDate: "2015-02-08",
        posterPath: "/bcs.jpg",
        deceasedCount: 2,
        castCount: 20,
        sharedCastCount: 3,
      },
    ]
    vi.mocked(getRelatedShows).mockResolvedValueOnce(mockRelatedShows)

    await getRelatedShowsRoute(req, res)

    expect(getRelatedShows).toHaveBeenCalledWith(1399)
    expect(sendWithETag).toHaveBeenCalledWith(req, res, { shows: mockRelatedShows }, 604800)
    expect(res.json).toHaveBeenCalledWith({ shows: mockRelatedShows })
  })

  it("returns cached data when available", async () => {
    const req = createMockReq({ id: "1399" })
    const res = createMockRes()

    const cachedData = {
      shows: [
        {
          tmdbId: 1396,
          name: "Cached Show",
          firstAirDate: "2008-01-20",
          posterPath: null,
          deceasedCount: 2,
          castCount: 15,
          sharedCastCount: 2,
        },
      ],
    }
    vi.mocked(getCached).mockResolvedValueOnce(cachedData)

    await getRelatedShowsRoute(req, res)

    expect(sendWithETag).toHaveBeenCalledWith(req, res, cachedData, 604800)
    expect(getRelatedShows).not.toHaveBeenCalled()
  })

  it("caches the response after fetching", async () => {
    const req = createMockReq({ id: "1399" })
    const res = createMockRes()

    const mockRelated = [
      {
        tmdbId: 1396,
        name: "Breaking Bad",
        firstAirDate: "2008-01-20",
        posterPath: null,
        deceasedCount: 2,
        castCount: 15,
        sharedCastCount: 2,
      },
    ]
    vi.mocked(getRelatedShows).mockResolvedValueOnce(mockRelated)

    await getRelatedShowsRoute(req, res)

    expect(setCached).toHaveBeenCalledWith(expect.any(String), { shows: mockRelated }, 604800)
  })

  it("does not cache empty results and uses short HTTP TTL", async () => {
    const req = createMockReq({ id: "1399" })
    const res = createMockRes()

    vi.mocked(getRelatedShows).mockResolvedValueOnce([])

    await getRelatedShowsRoute(req, res)

    expect(setCached).not.toHaveBeenCalled()
    expect(sendWithETag).toHaveBeenCalledWith(req, res, { shows: [] }, 300)
    expect(res.json).toHaveBeenCalledWith({ shows: [] })
  })

  it("returns 500 on database error", async () => {
    const req = createMockReq({ id: "1399" })
    const res = createMockRes()

    vi.mocked(getRelatedShows).mockRejectedValueOnce(new Error("Database error"))

    await getRelatedShowsRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: { message: "Failed to fetch related shows" },
    })
  })
})
