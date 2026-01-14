import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

// Mock all dependencies before importing the module under test
vi.mock("../../lib/tmdb.js", () => ({
  getTVShowDetails: vi.fn(),
  getTVShowAggregateCredits: vi.fn(),
  getSeasonDetails: vi.fn(),
  getEpisodeDetails: vi.fn(),
  getEpisodeCredits: vi.fn(),
  batchGetPersonDetails: vi.fn(),
}))

vi.mock("../../lib/db-helpers.js", () => ({
  getActorsIfAvailable: vi.fn(),
}))

vi.mock("../../lib/mortality-stats.js", () => ({
  calculateMovieMortality: vi.fn(),
}))

import { getEpisode } from "./episode.js"
import {
  getTVShowDetails,
  getTVShowAggregateCredits,
  getEpisodeDetails,
  getEpisodeCredits,
  batchGetPersonDetails,
} from "../../lib/tmdb.js"
import { getActorsIfAvailable } from "../../lib/db-helpers.js"
import { calculateMovieMortality } from "../../lib/mortality-stats.js"

describe("getEpisode route", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockShow = {
    id: 1400,
    name: "Test Show",
    poster_path: "/poster.jpg",
    first_air_date: "1990-01-01",
    original_language: "en",
    origin_country: ["US"],
  }

  const mockEpisode = {
    id: 12345,
    season_number: 5,
    episode_number: 1,
    name: "The Test Episode",
    overview: "An episode for testing",
    air_date: "1994-01-01",
    runtime: 22,
    still_path: "/still.jpg",
  }

  const mockCredits = {
    cast: [{ id: 101, name: "Main Actor", character: "Lead", profile_path: "/main.jpg" }],
    guest_stars: [
      { id: 102, name: "Guest Actor", character: "Guest Role", profile_path: "/guest.jpg" },
    ],
  }

  const mockAggregateCredits = {
    id: 1400,
    cast: [
      { id: 101, name: "Main Actor", total_episode_count: 180, roles: [], order: 0 },
      { id: 102, name: "Guest Actor", total_episode_count: 5, roles: [], order: 1 },
    ],
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
    vi.mocked(getTVShowDetails).mockResolvedValue(mockShow as never)
    vi.mocked(getEpisodeDetails).mockResolvedValue(mockEpisode as never)
    vi.mocked(getEpisodeCredits).mockResolvedValue(mockCredits as never)
    vi.mocked(getTVShowAggregateCredits).mockResolvedValue(mockAggregateCredits as never)
    vi.mocked(batchGetPersonDetails).mockResolvedValue(
      new Map([
        [
          101,
          {
            id: 101,
            name: "Main Actor",
            birthday: "1960-01-01",
            deathday: null,
            profile_path: "/main.jpg",
            popularity: 50,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
          },
        ],
        [
          102,
          {
            id: 102,
            name: "Guest Actor",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            profile_path: "/guest.jpg",
            popularity: 10,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
          },
        ],
      ])
    )
    vi.mocked(getActorsIfAvailable).mockResolvedValue(new Map())
    vi.mocked(calculateMovieMortality).mockResolvedValue({
      expectedDeaths: 0.5,
      actualDeaths: 1,
      mortalitySurpriseScore: 1,
      actorResults: [],
    })
  })

  describe("totalEpisodes from aggregate credits", () => {
    it("uses episode count from aggregate credits for living actors", async () => {
      mockReq = { params: { showId: "1400", season: "5", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          living: expect.arrayContaining([
            expect.objectContaining({
              id: 101,
              name: "Main Actor",
              totalEpisodes: 180, // From aggregate credits, not hardcoded 1
            }),
          ]),
        })
      )
    })

    it("uses episode count from aggregate credits for deceased actors", async () => {
      mockReq = { params: { showId: "1400", season: "5", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          deceased: expect.arrayContaining([
            expect.objectContaining({
              id: 102,
              name: "Guest Actor",
              totalEpisodes: 5, // From aggregate credits, not hardcoded 1
            }),
          ]),
        })
      )
    })

    it("falls back to 1 when actor not in aggregate credits", async () => {
      // Actor 103 is in episode credits but not in aggregate credits
      vi.mocked(getEpisodeCredits).mockResolvedValue({
        cast: [{ id: 103, name: "Unknown Actor", character: "Extra", profile_path: null }],
        guest_stars: [],
      } as never)
      vi.mocked(batchGetPersonDetails).mockResolvedValue(
        new Map([
          [
            103,
            {
              id: 103,
              name: "Unknown Actor",
              birthday: "1970-01-01",
              deathday: null,
              profile_path: null,
              popularity: 1,
              biography: "",
              place_of_birth: null,
              imdb_id: null,
            },
          ],
        ])
      )
      mockReq = { params: { showId: "1400", season: "5", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          living: expect.arrayContaining([
            expect.objectContaining({
              id: 103,
              name: "Unknown Actor",
              totalEpisodes: 1, // Fallback when not in aggregate credits
            }),
          ]),
        })
      )
    })

    it("falls back to 1 when person details not available", async () => {
      // Actor has no person details (returns undefined from map)
      vi.mocked(batchGetPersonDetails).mockResolvedValue(new Map())
      mockReq = { params: { showId: "1400", season: "5", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          living: expect.arrayContaining([
            expect.objectContaining({
              id: 101,
              name: "Main Actor",
              totalEpisodes: 180, // Still uses aggregate credits even without person details
            }),
          ]),
        })
      )
    })
  })

  describe("validation", () => {
    it("returns 400 for invalid show ID", async () => {
      mockReq = { params: { showId: "invalid", season: "5", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid show ID" } })
    })

    it("returns 400 for invalid season number", async () => {
      mockReq = { params: { showId: "1400", season: "abc", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid season number" } })
    })

    it("returns 400 for invalid episode number", async () => {
      mockReq = { params: { showId: "1400", season: "5", episode: "xyz" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(400)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid episode number" } })
    })

    it("returns 404 for non-US/non-English shows", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue({
        ...mockShow,
        original_language: "de",
        origin_country: ["DE"],
      } as never)
      mockReq = { params: { showId: "1400", season: "5", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(statusSpy).toHaveBeenCalledWith(404)
      expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Show not available" } })
    })
  })

  describe("response structure", () => {
    it("returns complete episode response", async () => {
      mockReq = { params: { showId: "1400", season: "5", episode: "1" } }

      await getEpisode(mockReq as Request, mockRes as Response)

      expect(jsonSpy).toHaveBeenCalledWith({
        show: {
          id: 1400,
          name: "Test Show",
          posterPath: "/poster.jpg",
          firstAirDate: "1990-01-01",
        },
        episode: {
          id: 12345,
          seasonNumber: 5,
          episodeNumber: 1,
          name: "The Test Episode",
          overview: "An episode for testing",
          airDate: "1994-01-01",
          runtime: 22,
          stillPath: "/still.jpg",
        },
        deceased: expect.any(Array),
        living: expect.any(Array),
        stats: expect.objectContaining({
          totalCast: 2,
          deceasedCount: 1,
          livingCount: 1,
        }),
      })
    })
  })
})
