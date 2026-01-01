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
  getActor: vi.fn(),
}))

vi.mock("../lib/newrelic.js", () => ({
  recordCustomEvent: vi.fn(),
}))

import { recordCustomEvent } from "../lib/newrelic.js"

describe("getActor", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

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
  }

  beforeEach(() => {
    vi.clearAllMocks()

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {
      params: { id: "12345" },
    }
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
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

    await getActor(mockReq as Request, mockRes as Response)

    expect(tmdb.getPersonDetails).toHaveBeenCalledWith(12345)
    expect(db.getActorFilmography).toHaveBeenCalledWith(12345)
    expect(db.getActor).not.toHaveBeenCalled()
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
      deathInfo: null,
    })
  })

  it("returns actor profile for deceased actor with death info from database", async () => {
    mockReq.params = { id: "67890" }
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
    vi.mocked(db.getActor).mockResolvedValueOnce(mockDeceasedRecord)

    await getActor(mockReq as Request, mockRes as Response)

    expect(tmdb.getPersonDetails).toHaveBeenCalledWith(67890)
    expect(db.getActorFilmography).toHaveBeenCalledWith(67890)
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
      deathInfo: {
        causeOfDeath: "Natural causes",
        causeOfDeathDetails: "Passed peacefully in sleep.",
        wikipediaUrl: "https://en.wikipedia.org/wiki/Actor",
        ageAtDeath: 80,
        yearsLost: -5,
      },
    })
  })

  it("calculates age at death when deceased record not in database", async () => {
    mockReq.params = { id: "67890" }
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce([])
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
        },
      })
    )
  })

  it("returns empty filmography when actor has no movies in database", async () => {
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce([])

    await getActor(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzedFilmography: [],
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

    await getActor(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch actor data" },
    })
  })

  it("response structure does not include costarStats", async () => {
    vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
    vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)

    await getActor(mockReq as Request, mockRes as Response)

    const response = jsonSpy.mock.calls[0][0]
    expect(response).not.toHaveProperty("costarStats")
    expect(Object.keys(response)).toEqual(["actor", "analyzedFilmography", "deathInfo"])
  })

  describe("recordCustomEvent tracking", () => {
    it("records ActorView custom event for living actor", async () => {
      vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockLivingPerson)
      vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)

      await getActor(mockReq as Request, mockRes as Response)

      expect(recordCustomEvent).toHaveBeenCalledWith(
        "ActorView",
        expect.objectContaining({
          tmdbId: 12345,
          name: "Living Actor",
          isDeceased: false,
          filmographyCount: 1,
          hasCauseOfDeath: false,
          responseTimeMs: expect.any(Number),
        })
      )
    })

    it("records ActorView custom event for deceased actor with cause of death", async () => {
      mockReq.params = { id: "67890" }
      vi.mocked(tmdb.getPersonDetails).mockResolvedValueOnce(mockDeceasedPerson)
      vi.mocked(db.getActorFilmography).mockResolvedValueOnce(mockFilmography)
      vi.mocked(db.getActor).mockResolvedValueOnce(mockDeceasedRecord)

      await getActor(mockReq as Request, mockRes as Response)

      expect(recordCustomEvent).toHaveBeenCalledWith(
        "ActorView",
        expect.objectContaining({
          tmdbId: 67890,
          name: "Deceased Actor",
          isDeceased: true,
          filmographyCount: 1,
          hasCauseOfDeath: true,
          responseTimeMs: expect.any(Number),
        })
      )
    })

    it("does not record ActorView event on error", async () => {
      vi.mocked(tmdb.getPersonDetails).mockRejectedValueOnce(new Error("API error"))

      await getActor(mockReq as Request, mockRes as Response)

      expect(recordCustomEvent).not.toHaveBeenCalled()
    })
  })
})
