import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

// Mock all dependencies before importing the module under test
vi.mock("../lib/tmdb.js", () => ({
  getMovieDetails: vi.fn(),
  getMovieCredits: vi.fn(),
  batchGetPersonDetails: vi.fn(),
}))

vi.mock("../lib/db.js", () => ({
  getActors: vi.fn(),
  batchUpsertActors: vi.fn(),
  updateDeathInfo: vi.fn().mockResolvedValue(undefined),
  upsertMovie: vi.fn().mockResolvedValue(undefined),
  batchUpsertActorMovieAppearances: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../lib/mortality-stats.js", () => ({
  calculateMovieMortality: vi.fn(),
  calculateYearsLost: vi.fn(),
}))

vi.mock("../lib/wikidata.js", () => ({
  getCauseOfDeath: vi.fn(),
}))

vi.mock("../lib/movie-cache.js", () => ({
  buildMovieRecord: vi.fn(),
  buildActorMovieAppearanceRecord: vi.fn(),
}))

vi.mock("../lib/newrelic.js", () => ({
  recordCustomEvent: vi.fn(),
}))

import { getMovie } from "./movie.js"
import { getMovieDetails, getMovieCredits, batchGetPersonDetails } from "../lib/tmdb.js"
import { getActors, batchUpsertActors } from "../lib/db.js"
import { calculateMovieMortality } from "../lib/mortality-stats.js"
import { recordCustomEvent } from "../lib/newrelic.js"
import { getCauseOfDeath } from "../lib/wikidata.js"

describe("getMovie route", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockMovie = {
    id: 14629,
    title: "Breakfast at Tiffany's",
    release_date: "1961-10-05",
    poster_path: "/poster.jpg",
    overview: "A classic film",
    runtime: 115,
    genres: [{ id: 35, name: "Comedy" }],
  }

  const mockCredits = {
    id: 14629,
    cast: [
      {
        id: 101,
        name: "Audrey Hepburn",
        character: "Holly Golightly",
        profile_path: "/audrey.jpg",
        order: 0,
        gender: 1,
        known_for_department: "Acting",
      },
      {
        id: 102,
        name: "George Peppard",
        character: "Paul Varjak",
        profile_path: "/george.jpg",
        order: 1,
        gender: 2,
        known_for_department: "Acting",
      },
    ],
    crew: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }

    // Setup default mocks
    vi.mocked(getMovieDetails).mockResolvedValue(mockMovie)
    vi.mocked(getMovieCredits).mockResolvedValue(mockCredits)
    vi.mocked(batchGetPersonDetails).mockResolvedValue(
      new Map([
        [
          101,
          {
            id: 101,
            name: "Audrey Hepburn",
            birthday: "1929-05-04",
            deathday: "1993-01-20",
            profile_path: "/audrey.jpg",
            popularity: 20,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
          },
        ],
        [
          102,
          {
            id: 102,
            name: "George Peppard",
            birthday: "1928-10-01",
            deathday: "1994-05-08",
            profile_path: "/george.jpg",
            popularity: 15,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
          },
        ],
      ])
    )
    vi.mocked(getActors).mockResolvedValue(new Map())
    vi.mocked(batchUpsertActors).mockResolvedValue()
    vi.mocked(calculateMovieMortality).mockResolvedValue({
      expectedDeaths: 1.8,
      actualDeaths: 2,
      mortalitySurpriseScore: 0.11,
      actorResults: [],
    })
    vi.mocked(getCauseOfDeath).mockResolvedValue({
      causeOfDeath: "Cancer",
      causeOfDeathSource: "claude" as const,
      causeOfDeathDetails: "Died of cancer",
      causeOfDeathDetailsSource: "claude" as const,
      wikipediaUrl: "https://en.wikipedia.org/wiki/Actor",
    })
  })

  it("returns 400 for invalid movie ID", async () => {
    mockReq = { params: { id: "invalid" } }

    await getMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid movie ID" },
    })
  })

  it("returns movie data with deceased cast", async () => {
    mockReq = { params: { id: "14629" } }

    await getMovie(mockReq as Request, mockRes as Response)

    expect(getMovieDetails).toHaveBeenCalledWith(14629)
    expect(getMovieCredits).toHaveBeenCalledWith(14629)
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        movie: expect.objectContaining({
          id: 14629,
          title: "Breakfast at Tiffany's",
        }),
        deceased: expect.arrayContaining([
          expect.objectContaining({
            id: 101,
            name: "Audrey Hepburn",
          }),
        ]),
        stats: expect.objectContaining({
          deceasedCount: 2,
          livingCount: 0,
        }),
      })
    )
  })

  describe("recordCustomEvent tracking", () => {
    it("records MovieView custom event with correct attributes", async () => {
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      expect(recordCustomEvent).toHaveBeenCalledWith(
        "MovieView",
        expect.objectContaining({
          tmdbId: 14629,
          title: "Breakfast at Tiffany's",
          releaseYear: 1961,
          deceasedCount: 2,
          livingCount: 0,
          expectedDeaths: 1.8,
          curseScore: 0.11,
          responseTimeMs: expect.any(Number),
        })
      )
    })

    it("does not record MovieView event on error", async () => {
      vi.mocked(getMovieDetails).mockRejectedValue(new Error("API error"))
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      expect(recordCustomEvent).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })
})
