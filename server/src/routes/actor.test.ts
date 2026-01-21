import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getActor } from "./actor.js"
import * as tmdb from "../lib/tmdb.js"
import * as db from "../lib/db.js"

// Mock the modules
vi.mock("../lib/tmdb.js", () => ({
  getPersonDetails: vi.fn(),
}))

vi.mock("../lib/db.js", () => ({
  getActorFilmography: vi.fn(),
  getActorShowFilmography: vi.fn(),
  getActor: vi.fn(),
  hasDetailedDeathInfo: vi.fn().mockResolvedValue(false),
}))

vi.mock("newrelic", () => ({
  default: {
  recordCustomEvent: vi.fn(),
}
}))

vi.mock("../lib/cache.js", () => ({
  getCached: vi.fn().mockResolvedValue(null), // Always miss cache in tests
  setCached: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: {
    actor: (id: number) => ({
      profile: `actor:id:${id}`,
      death: `actor:id:${id}:type:death`,
    }),
  },
  CACHE_TTL: { WEEK: 604800 },
}))

import newrelic from "newrelic"
import { getCached, setCached, CACHE_TTL } from "../lib/cache.js"

describe("getActor", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>
  let setSpy: ReturnType<typeof vi.fn>

  const mockLivingPerson = {
    id: 12345,
    name: "Living Actor",
    birthday: "1980-05-15",
    deathday: null,
    biography: "A famous actor.",
    profile_path: "/profile.jpg",
    place_of_birth: "Los Angeles, CA",
    imdb_id: "nm1234567",
    popularity: 5.5,
  }

  const mockDeceasedPerson = {
    id: 67890,
    name: "Deceased Actor",
    birthday: "1940-03-10",
    deathday: "2020-08-15",
    biography: "A legendary performer.",
    profile_path: "/legacy.jpg",
    place_of_birth: "New York, NY",
    imdb_id: "nm7654321",
    popularity: 8.2,
  }

  const mockFilmography = [
    {
      movieId: 100,
      title: "Great Movie",
      releaseYear: 2015,
      character: "Lead Role",
      posterPath: "/poster.jpg",
      deceasedCount: 3,
      castCount: 10,
    },
  ]

  const mockTVFilmography = [
    {
      showId: 200,
      name: "Great Show",
      firstAirYear: 2018,
      lastAirYear: 2022,
      character: "Main Role",
      posterPath: "/show-poster.jpg",
      deceasedCount: 2,
      castCount: 8,
      episodeCount: 24,
    },
  ]

  const mockDeceasedRecord = {
    id: 1,
    tmdb_id: 67890,
    name: "Deceased Actor",
    birthday: "1940-03-10",
    deathday: "2020-08-15",
    cause_of_death: "Natural causes",
    cause_of_death_source: "claude" as const,
    cause_of_death_details: "Passed peacefully in sleep.",
    cause_of_death_details_source: "claude" as const,
    wikipedia_url: "https://en.wikipedia.org/wiki/Actor",
    profile_path: "/legacy.jpg",
    age_at_death: 80,
    expected_lifespan: 75,
    years_lost: -5,
    popularity: 50.0,
    violent_death: false,
    tvmaze_person_id: null,
    thetvdb_person_id: null,
    imdb_person_id: null,
    is_obscure: false,
    deathday_confidence: null,
    deathday_verification_source: null,
    deathday_verified_at: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { id: "12345" },
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }
  })

  it("returns 400 for invalid actor ID", async () => {
    mockReq.params = { id: "invalid" }

    await getActor(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid actor ID" },
    })
  })

  it("returns 400 for missing actor ID", async () => {
    mockReq.params = {}

    await getActor(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid actor ID" },
    })
  })

  it("returns actor profile for living actor without death info", async () => {
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce(mockTVFilmography)

    await getActor(mockReq as Request, mockRes as Response)

    expect(tmdb.getPersonDetails).toHaveBeenCalledWith(12345)
    expect(db.getActorFilmography).toHaveBeenCalledWith(12345)
    expect(db.getActorShowFilmography).toHaveBeenCalledWith(12345)
    expect(db.getActor).not.toHaveBeenCalled()
    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=600")
    expect(jsonSpy).toHaveBeenCalledWith({
      actor: {
        id: 12345,
        name: "Living Actor",
        birthday: "1980-05-15",
        deathday: null,
        biography: "A famous actor.",
        profilePath: "/profile.jpg",
        placeOfBirth: "Los Angeles, CA",
      },
      analyzedFilmography: mockFilmography,
      analyzedTVFilmography: mockTVFilmography,
      deathInfo: null,
    })
  })

  it("sets response in cache on cache miss", async () => {
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce(mockTVFilmography)

    await getActor(mockReq as Request, mockRes as Response)

    // Cache key should be constructed via CACHE_KEYS.actor().profile
    expect(setCached).toHaveBeenCalledWith(
      "actor:id:12345",
      expect.objectContaining({
        actor: expect.objectContaining({ id: 12345, name: "Living Actor" }),
        analyzedFilmography: mockFilmography,
        analyzedTVFilmography: mockTVFilmography,
        deathInfo: null,
      }),
      CACHE_TTL.WEEK
    )
  })

  it("returns cached response without calling TMDB/database on cache hit", async () => {
    const cachedResponse = {
      actor: {
        id: 12345,
        name: "Cached Actor",
        birthday: "1980-05-15",
        deathday: null,
        biography: "From cache",
        profilePath: "/cached.jpg",
        placeOfBirth: "Cache City",
      },
      analyzedFilmography: [],
      analyzedTVFilmography: [],
      deathInfo: null,
    }
    vi.mocked(getCached).mockResolvedValueOnce(cachedResponse)

    await getActor(mockReq as Request, mockRes as Response)

    // Should not call TMDB or database
    expect(tmdb.getPersonDetails).not.toHaveBeenCalled()
    expect(db.getActorFilmography).not.toHaveBeenCalled()
    expect(db.getActorShowFilmography).not.toHaveBeenCalled()
    expect(db.getActor).not.toHaveBeenCalled()

    // Should not call setCached (already cached)
    expect(setCached).not.toHaveBeenCalled()

    // Should set Cache-Control header and return cached data
    expect(setSpy).toHaveBeenCalledWith("Cache-Control", "public, max-age=600")
    expect(jsonSpy).toHaveBeenCalledWith(cachedResponse)

    // Should record custom event with cacheHit: true
    expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
      "ActorView",
      expect.objectContaining({
        tmdbId: 12345,
        name: "Cached Actor",
        cacheHit: true,
      })
    )
  })

  it("returns actor profile for deceased actor with death info from database", async () => {
    mockReq.params = { id: "67890" }
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])
    vi.mocked(db.getActor).mockResolvedValueOnce(mockDeceasedRecord)

    await getActor(mockReq as Request, mockRes as Response)

    expect(tmdb.getPersonDetails).toHaveBeenCalledWith(67890)
    expect(db.getActorFilmography).toHaveBeenCalledWith(67890)
    expect(db.getActorShowFilmography).toHaveBeenCalledWith(67890)
    expect(db.getActor).toHaveBeenCalledWith(67890)
    expect(jsonSpy).toHaveBeenCalledWith({
      actor: {
        id: 67890,
        name: "Deceased Actor",
        birthday: "1940-03-10",
        deathday: "2020-08-15",
        biography: "A legendary performer.",
        profilePath: "/legacy.jpg",
        placeOfBirth: "New York, NY",
      },
      analyzedFilmography: mockFilmography,
      analyzedTVFilmography: [],
      deathInfo: {
        causeOfDeath: "Natural causes",
        causeOfDeathDetails: "Passed peacefully in sleep.",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Actor",
        ageAtDeath: 80,
        yearsLost: -5,
        hasDetailedDeathInfo: false,
      },
    })
  })

  it("calculates age at death when deceased record not in database", async () => {
    mockReq.params = { id: "67890" }
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce([])
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])
    vi.mocked(db.getActor).mockResolvedValueOnce(null)

    await getActor(mockReq as Request, mockRes as Response)

    expect(db.getActor).toHaveBeenCalledWith(67890)
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        deathInfo: {
          causeOfDeath: null,
          causeOfDeathDetails: null,
          wikipediaUrl: null,
          ageAtDeath: 80, // 2020 - 1940
          yearsLost: null,
          hasDetailedDeathInfo: false,
        },
      })
    )
  })

  it("returns empty filmography when actor has no movies in database", async () => {
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce([])
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])

    await getActor(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzedFilmography: [],
        analyzedTVFilmography: [],
      })
    )
  })

  it("returns 500 on TMDB API error", async () => {
    vi.mocked(tmdb.getPersonDetails).mockRejectedValueOnce(new Error("TMDB API error"))

    await getActor(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch actor data" },
    })
  })

  it("returns 500 on database error", async () => {
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
    vi.mocked(db.getActorFilmography).mockRejectedValueOnce(new Error("Database error"))
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])

    await getActor(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch actor data" },
    })
  })

  it("response structure does not include costarStats", async () => {
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce(mockTVFilmography)

    await getActor(mockReq as Request, mockRes as Response)

    const response = jsonSpy.mock.calls[0][0]
    expect(response).not.toHaveProperty("costarStats")
    expect(Object.keys(response)).toEqual([
      "actor",
      "analyzedFilmography",
      "analyzedTVFilmography",
      "deathInfo",
    ])
  })

  describe("recordCustomEvent tracking", () => {
    it("records ActorView custom event for living actor", async () => {
      vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
      vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
      vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce(mockTVFilmography)

      await getActor(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
        "ActorView",
        expect.objectContaining({
          tmdbId: 12345,
          name: "Living Actor",
          isDeceased: false,
          filmographyCount: 1,
          tvFilmographyCount: 1,
          hasCauseOfDeath: false,
          responseTimeMs: expect.any(Number),
        })
      )
    })

    it("records ActorView custom event for deceased actor with cause of death", async () => {
      mockReq.params = { id: "67890" }
      vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
      vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
      vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])
      vi.mocked(db.getActor).mockResolvedValueOnce(mockDeceasedRecord)

      await getActor(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
        "ActorView",
        expect.objectContaining({
          tmdbId: 67890,
          name: "Deceased Actor",
          isDeceased: true,
          filmographyCount: 1,
          tvFilmographyCount: 0,
          hasCauseOfDeath: true,
          responseTimeMs: expect.any(Number),
        })
      )
    })

    it("does not record ActorView event on error", async () => {
      vi.mocked(tmdb.getPersonDetails).mockRejectedValueOnce(new Error("API error"))

      await getActor(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).not.toHaveBeenCalled()
    })
  })
})
