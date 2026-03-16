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
  updateDeathInfoByActorId: vi.fn().mockResolvedValue(undefined),
  upsertMovie: vi.fn().mockResolvedValue(undefined),
  batchUpsertActorMovieAppearances: vi.fn().mockResolvedValue(undefined),
  getMovie: vi.fn().mockResolvedValue(null),
  getMovieWithCast: vi.fn().mockResolvedValue([]),
}))

vi.mock("../lib/db-helpers.js", () => ({
  getActorsIfAvailable: vi.fn().mockResolvedValue(new Map()),
  getActorsByInternalIds: vi.fn().mockResolvedValue(new Map()),
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

vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
    addCustomAttribute: vi.fn(),
    addCustomAttributes: vi.fn(),
  },
}))

import { getMovie, getMovieDeathInfo } from "./movie.js"
import { getMovieDetails, getMovieCredits, batchGetPersonDetails } from "../lib/tmdb.js"
import { batchUpsertActors, getMovie as getMovieFromDb, getMovieWithCast } from "../lib/db.js"
import { getActorsByInternalIds } from "../lib/db-helpers.js"
import { calculateMovieMortality } from "../lib/mortality-stats.js"
import newrelic from "newrelic"
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

    // Setup default mocks (TMDB fallback path)
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
            known_for_department: "Acting",
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
            known_for_department: "Acting",
          },
        ],
      ])
    )
    vi.mocked(getMovieFromDb).mockResolvedValue(null)
    vi.mocked(getMovieWithCast).mockResolvedValue([])
    vi.mocked(batchUpsertActors).mockResolvedValue(
      new Map([
        [101, 5001],
        [102, 5002],
      ])
    )
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

  describe("TMDB fallback path (no DB cast)", () => {
    it("returns internal actor IDs from batchUpsertActors mapping", async () => {
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      expect(getMovieDetails).toHaveBeenCalledWith(14629)
      expect(getMovieCredits).toHaveBeenCalledWith(14629)
      expect(batchUpsertActors).toHaveBeenCalled()

      const response = jsonSpy.mock.calls[0][0]
      // Actor IDs should be internal IDs from batchUpsertActors, not TMDB IDs (101, 102)
      // Sorted by death date descending: Peppard (1994) before Hepburn (1993)
      expect(response.deceased[0].id).toBe(5002) // Peppard (died 1994)
      expect(response.deceased[1].id).toBe(5001) // Hepburn (died 1993)
      expect(response.movie.id).toBe(14629) // Movie ID stays as TMDB ID
    })

    it("falls back to TMDB ID if actor upsert fails", async () => {
      vi.mocked(batchUpsertActors).mockRejectedValue(new Error("DB unavailable"))
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      const response = jsonSpy.mock.calls[0][0]
      // Falls back to TMDB IDs when upsert fails
      // Sorted by death date descending: Peppard (1994) before Hepburn (1993)
      expect(response.deceased[0].id).toBe(102) // Peppard
      expect(response.deceased[1].id).toBe(101) // Hepburn
    })
  })

  describe("DB-first path (cast in database)", () => {
    const mockDbCast = [
      {
        actor_id: 5001,
        actor_tmdb_id: 101,
        name: "Audrey Hepburn",
        birthday: "1929-05-04",
        deathday: "1993-01-20",
        profile_path: "/audrey.jpg",
        cause_of_death: "Cancer",
        cause_of_death_source: "claude" as const,
        cause_of_death_details: "Died of appendiceal cancer",
        cause_of_death_details_source: "claude" as const,
        wikipedia_url: "https://en.wikipedia.org/wiki/Audrey_Hepburn",
        age_at_death: 63,
        years_lost: 17.5,
        expected_lifespan: 80.5,
        character_name: "Holly Golightly",
        billing_order: 0,
        appearance_type: "regular" as const,
      },
      {
        actor_id: 5002,
        actor_tmdb_id: 102,
        name: "George Peppard",
        birthday: "1928-10-01",
        deathday: null,
        profile_path: "/george.jpg",
        cause_of_death: null,
        cause_of_death_source: null,
        cause_of_death_details: null,
        cause_of_death_details_source: null,
        wikipedia_url: null,
        age_at_death: null,
        years_lost: null,
        expected_lifespan: null,
        character_name: "Paul Varjak",
        billing_order: 1,
        appearance_type: "regular" as const,
      },
    ]

    it("returns internal actor IDs from DB cast query", async () => {
      vi.mocked(getMovieWithCast).mockResolvedValue(mockDbCast)
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      // Should NOT call TMDB credits or person details
      expect(getMovieCredits).not.toHaveBeenCalled()
      expect(batchGetPersonDetails).not.toHaveBeenCalled()

      const response = jsonSpy.mock.calls[0][0]
      // Actor IDs are internal IDs from the database
      expect(response.deceased[0].id).toBe(5001)
      expect(response.deceased[0].name).toBe("Audrey Hepburn")
      expect(response.deceased[0].causeOfDeath).toBe("Cancer")
      expect(response.deceased[0].tmdbUrl).toBe("https://www.themoviedb.org/person/101")
      // Living actor
      expect(response.living[0].id).toBe(5002)
      expect(response.living[0].name).toBe("George Peppard")
    })

    it("includes death info from DB without additional queries", async () => {
      vi.mocked(getMovieWithCast).mockResolvedValue(mockDbCast)
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      const response = jsonSpy.mock.calls[0][0]
      expect(response.deceased[0]).toEqual(
        expect.objectContaining({
          causeOfDeath: "Cancer",
          causeOfDeathDetails: "Died of appendiceal cancer",
          wikipediaUrl: "https://en.wikipedia.org/wiki/Audrey_Hepburn",
          ageAtDeath: 63,
          yearsLost: 17.5,
        })
      )
    })

    it("tracks dbFirst in New Relic event", async () => {
      vi.mocked(getMovieWithCast).mockResolvedValue(mockDbCast)
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
        "MovieView",
        expect.objectContaining({
          dbFirst: true,
        })
      )
    })
  })

  describe("recordCustomEvent tracking", () => {
    it("records MovieView custom event with correct attributes", async () => {
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
        "MovieView",
        expect.objectContaining({
          tmdbId: 14629,
          title: "Breakfast at Tiffany's",
          releaseYear: 1961,
          deceasedCount: 2,
          livingCount: 0,
          expectedDeaths: 1.8,
          curseScore: 0.11,
          dbFirst: false,
          responseTimeMs: expect.any(Number),
        })
      )
    })

    it("does not record MovieView event on error", async () => {
      vi.mocked(getMovieDetails).mockRejectedValue(new Error("API error"))
      mockReq = { params: { id: "14629" } }

      await getMovie(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).not.toHaveBeenCalled()
      expect(statusSpy).toHaveBeenCalledWith(500)
    })
  })

  describe("Wikidata enrichment batching", () => {
    it("enriches all deceased actors via getCauseOfDeath", async () => {
      // Set up 5 deceased actors to verify batching (3 + 2)
      const fiveActors = Array.from({ length: 5 }, (_, i) => ({
        id: 200 + i,
        name: `Actor ${i}`,
        character: `Role ${i}`,
        profile_path: `/actor${i}.jpg`,
        order: i,
        gender: 2,
        known_for_department: "Acting",
      }))

      vi.mocked(getMovieCredits).mockResolvedValue({
        id: 14629,
        cast: fiveActors,
        crew: [],
      })

      const personDetailsMap = new Map(
        fiveActors.map((a) => [
          a.id,
          {
            id: a.id,
            name: a.name,
            birthday: "1920-01-01",
            deathday: "1980-01-01",
            profile_path: a.profile_path,
            popularity: 10,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
            known_for_department: "Acting",
          },
        ])
      )
      vi.mocked(batchGetPersonDetails).mockResolvedValue(personDetailsMap)

      // Return internal IDs for all 5 actors
      vi.mocked(batchUpsertActors).mockResolvedValue(
        new Map(fiveActors.map((a, i) => [a.id, 6000 + i]))
      )

      vi.mocked(getCauseOfDeath).mockImplementation(async () => {
        return {
          causeOfDeath: "Natural causes",
          causeOfDeathSource: "claude",
          causeOfDeathDetails: null,
          causeOfDeathDetailsSource: null,
          wikipediaUrl: null,
        }
      })

      mockReq = { params: { id: "14629" } }
      await getMovie(mockReq as Request, mockRes as Response)

      // enrichWithWikidata runs in background — wait for it to complete
      await vi.waitFor(() => {
        expect(getCauseOfDeath).toHaveBeenCalledTimes(5)
      })
    })
  })

  describe("aggregate score handling", () => {
    it("returns aggregateScore and aggregateConfidence when available in database", async () => {
      mockReq = { params: { id: "14629" } }
      vi.mocked(getMovieFromDb).mockResolvedValue({
        tmdb_id: 14629,
        title: "Breakfast at Tiffany's",
        aggregate_score: 8.2,
        aggregate_confidence: 0.85,
      } as Awaited<ReturnType<typeof getMovieFromDb>>)

      await getMovie(mockReq as Request, mockRes as Response)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateScore: 8.2,
          aggregateConfidence: 0.85,
        })
      )
    })

    it("returns null for aggregateScore and aggregateConfidence when not in database", async () => {
      mockReq = { params: { id: "14629" } }
      vi.mocked(getMovieFromDb).mockResolvedValue(null)

      await getMovie(mockReq as Request, mockRes as Response)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateScore: null,
          aggregateConfidence: null,
        })
      )
    })

    it("handles database lookup failure gracefully", async () => {
      mockReq = { params: { id: "14629" } }
      vi.mocked(getMovieFromDb).mockRejectedValue(new Error("Database error"))

      await getMovie(mockReq as Request, mockRes as Response)

      // Should still return movie data, aggregate score fields will be null
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          movie: expect.objectContaining({ id: 14629 }),
          aggregateScore: null,
          aggregateConfidence: null,
        })
      )
    })
  })
})

describe("getMovieDeathInfo route", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }
  })

  it("returns 400 for missing personIds", async () => {
    mockReq = { params: { id: "14629" }, query: {} }

    await getMovieDeathInfo(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
  })

  it("queries by internal actor IDs, not TMDB IDs", async () => {
    const mockActorRecord = {
      id: 5001,
      tmdb_id: 101,
      name: "Audrey Hepburn",
      cause_of_death: "Cancer",
      cause_of_death_details: "Appendiceal cancer",
      wikipedia_url: "https://en.wikipedia.org/wiki/Audrey_Hepburn",
    }
    vi.mocked(getActorsByInternalIds).mockResolvedValue(new Map([[5001, mockActorRecord as never]]))

    mockReq = { params: { id: "14629" }, query: { personIds: "5001" } }

    await getMovieDeathInfo(mockReq as Request, mockRes as Response)

    // Should call getActorsByInternalIds, not getActorsIfAvailable
    expect(getActorsByInternalIds).toHaveBeenCalledWith([5001])
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deathInfo: {
          5001: {
            causeOfDeath: "Cancer",
            causeOfDeathDetails: "Appendiceal cancer",
            wikipediaUrl: "https://en.wikipedia.org/wiki/Audrey_Hepburn",
          },
        },
      })
    )
  })
})
