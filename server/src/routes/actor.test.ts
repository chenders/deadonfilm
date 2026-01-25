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
  getActorByEitherIdWithSlug: vi.fn(),
  hasDetailedDeathInfo: vi.fn().mockResolvedValue(false),
}))

vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
    addCustomAttribute: vi.fn(),
    addCustomAttributes: vi.fn(),
  },
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

  const mockActorRecord = {
    id: 1,
    tmdb_id: 12345,
    name: "Living Actor",
    birthday: "1980-05-15",
    deathday: null,
    cause_of_death: null,
    cause_of_death_source: null,
    cause_of_death_details: null,
    cause_of_death_details_source: null,
    wikipedia_url: null,
    profile_path: "/profile.jpg",
    age_at_death: null,
    expected_lifespan: null,
    years_lost: null,
    popularity: 5.5,
    violent_death: false,
    tvmaze_person_id: null,
    thetvdb_person_id: null,
    imdb_person_id: null,
    is_obscure: false,
    deathday_confidence: null,
    deathday_verification_source: null,
    deathday_verified_at: null,
    has_detailed_death_info: false,
  }

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
    has_detailed_death_info: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()
    setSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { slug: "living-actor-12345" },
      headers: {},
    }

    // Default mock for getActorByEitherIdWithSlug - returns actor matched by id
    vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValue({
      actor: mockActorRecord,
      matchedBy: "id",
    })
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
      set: setSpy as Response["set"],
    }
  })

  it("returns 400 for invalid actor ID", async () => {
    mockReq.params = { slug: "invalid-slug" }

    await getActor(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Invalid actor ID" },
    })
  })

  it("returns 400 for missing actor ID", async () => {
    mockReq.params = { slug: "" }

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

    // Cache key should be constructed via CACHE_KEYS.actor().profile using internal actor.id
    expect(setCached).toHaveBeenCalledWith(
      "actor:id:1",
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
    mockReq.params = { slug: "deceased-actor-2" }
    vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValueOnce({
      actor: mockDeceasedRecord,
      matchedBy: "id",
    })
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])

    await getActor(mockReq as Request, mockRes as Response)

    expect(tmdb.getPersonDetails).toHaveBeenCalledWith(67890)
    expect(db.getActorFilmography).toHaveBeenCalledWith(67890)
    expect(db.getActorShowFilmography).toHaveBeenCalledWith(67890)
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
    mockReq.params = { slug: "deceased-actor-3" }
    vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValueOnce({
      actor: { ...mockActorRecord, id: 3, tmdb_id: 67890 },
      matchedBy: "id",
    })
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce([])
    vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])

    await getActor(mockReq as Request, mockRes as Response)
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
      mockReq.params = { slug: "deceased-actor-5" }
      vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValueOnce({
        actor: mockDeceasedRecord,
        matchedBy: "id",
      })
      vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
      vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
      vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce([])

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

  describe("URL redirect handling (legacy tmdb_id URLs)", () => {
    let redirectSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      redirectSpy = vi.fn()
      mockRes.redirect = redirectSpy as Response["redirect"]
    })

    it("redirects with 301 when matched by tmdb_id", async () => {
      const actorWithTmdbId = {
        ...mockActorRecord,
        id: 4165,
        tmdb_id: 190,
        name: "Clint Eastwood",
      }

      // Simulate legacy URL using tmdb_id=190 in slug
      mockReq.params = { slug: "clint-eastwood-190" }
      vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValueOnce({
        actor: actorWithTmdbId,
        matchedBy: "tmdb_id",
      })

      await getActor(mockReq as Request, mockRes as Response)

      // Should redirect to canonical URL with actor.id
      expect(redirectSpy).toHaveBeenCalledWith(301, "/api/actor/clint-eastwood-4165")

      // Should NOT fetch TMDB data or set cache
      expect(tmdb.getPersonDetails).not.toHaveBeenCalled()
      expect(setCached).not.toHaveBeenCalled()
      expect(jsonSpy).not.toHaveBeenCalled()
    })

    it("records ActorUrlRedirect custom event on redirect", async () => {
      const actorWithTmdbId = {
        ...mockActorRecord,
        id: 100,
        tmdb_id: 5000,
        name: "John Wayne",
      }

      mockReq.params = { slug: "john-wayne-5000" }
      mockReq.headers = {
        "user-agent": "Mozilla/5.0 Test Browser",
        referer: "https://example.com/previous-page",
      }

      vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValueOnce({
        actor: actorWithTmdbId,
        matchedBy: "tmdb_id",
      })

      await getActor(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith("ActorUrlRedirect", {
        actorId: 100,
        tmdbId: 5000,
        actorName: "John Wayne",
        slug: "john-wayne-5000",
        matchType: "tmdb_id",
        endpoint: "profile",
        userAgent: "Mozilla/5.0 Test Browser",
        referer: "https://example.com/previous-page",
      })
    })

    it("does not redirect when matched by id (canonical URL)", async () => {
      vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValueOnce({
        actor: mockActorRecord,
        matchedBy: "id",
      })
      vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
      vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
      vi.mocked(db.getActorShowFilmography).mockResolvedValueOnce(mockTVFilmography)

      await getActor(mockReq as Request, mockRes as Response)

      // Should NOT redirect
      expect(redirectSpy).not.toHaveBeenCalled()

      // Should proceed normally
      expect(tmdb.getPersonDetails).toHaveBeenCalled()
      expect(jsonSpy).toHaveBeenCalled()
    })

    it("handles redirect with null tmdb_id gracefully", async () => {
      const actorWithoutTmdbId = {
        ...mockActorRecord,
        id: 100,
        tmdb_id: null,
        name: "IMDb Only Actor",
      }

      mockReq.params = { slug: "imdb-only-actor-999" }
      vi.mocked(db.getActorByEitherIdWithSlug).mockResolvedValueOnce({
        actor: actorWithoutTmdbId,
        matchedBy: "tmdb_id",
      })

      await getActor(mockReq as Request, mockRes as Response)

      // Should still redirect
      expect(redirectSpy).toHaveBeenCalledWith(301, "/api/actor/imdb-only-actor-100")

      // NewRelic event should omit tmdbId field (conditional spreading)
      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
        "ActorUrlRedirect",
        expect.not.objectContaining({
          tmdbId: expect.anything(),
        })
      )
    })
  })
})
