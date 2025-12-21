import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"

// Mock all dependencies before importing the module under test
vi.mock("../lib/tmdb.js", () => ({
  getTVShowDetails: vi.fn(),
  getTVShowAggregateCredits: vi.fn(),
  getSeasonDetails: vi.fn(),
  getEpisodeDetails: vi.fn(),
  getEpisodeCredits: vi.fn(),
  batchGetPersonDetails: vi.fn(),
  searchTVShows: vi.fn(),
}))

vi.mock("../lib/db.js", () => ({
  getDeceasedPersons: vi.fn(),
  batchUpsertDeceasedPersons: vi.fn(),
  upsertShow: vi.fn(),
  getSeasons: vi.fn(),
}))

vi.mock("../lib/mortality-stats.js", () => ({
  calculateMovieMortality: vi.fn(),
  calculateYearsLost: vi.fn(),
}))

import { getShow } from "./shows.js"
import {
  getTVShowDetails,
  getTVShowAggregateCredits,
  batchGetPersonDetails,
  getSeasonDetails,
} from "../lib/tmdb.js"
import { getDeceasedPersons, upsertShow, getSeasons } from "../lib/db.js"
import { calculateMovieMortality } from "../lib/mortality-stats.js"

describe("getShow route", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const createMockShow = (status: string) => ({
    id: 1400,
    name: "Test Show",
    overview: "A test show",
    first_air_date: "1990-01-01",
    last_air_date: "1999-05-14",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    number_of_seasons: 2,
    number_of_episodes: 40,
    genres: [{ id: 35, name: "Comedy" }],
    seasons: [
      {
        id: 1,
        season_number: 0,
        episode_count: 5,
        name: "Specials",
        air_date: null,
        poster_path: null,
      },
      {
        id: 2,
        season_number: 1,
        episode_count: 20,
        name: "Season 1",
        air_date: "1990-01-01",
        poster_path: null,
      },
    ],
    vote_average: 8.5,
    popularity: 100,
    origin_country: ["US"],
    original_language: "en",
    status,
  })

  const baseMockCredits = {
    id: 1400,
    cast: [
      {
        id: 101,
        name: "Actor One",
        profile_path: "/actor1.jpg",
        roles: [{ character: "Character One", episode_count: 50 }],
        total_episode_count: 50,
        order: 0,
        gender: 1,
        known_for_department: "Acting",
      },
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
    vi.mocked(getTVShowAggregateCredits).mockResolvedValue(baseMockCredits)
    vi.mocked(batchGetPersonDetails).mockResolvedValue(
      new Map([
        [
          101,
          {
            id: 101,
            name: "Actor One",
            birthday: "1960-01-01",
            deathday: null,
            profile_path: "/actor1.jpg",
            popularity: 10,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
          },
        ],
      ])
    )
    vi.mocked(getDeceasedPersons).mockResolvedValue(new Map())
    vi.mocked(upsertShow).mockResolvedValue()
    vi.mocked(getSeasons).mockResolvedValue([])
    vi.mocked(calculateMovieMortality).mockResolvedValue({
      expectedDeaths: 0.5,
      actualDeaths: 0,
      mortalitySurpriseScore: -1,
      actorResults: [],
    })
  })

  describe("episode fetching optimization based on show status", () => {
    // These tests verify the performance optimization: ended/canceled shows
    // skip expensive episode fetching since they'll never have new episodes

    it("skips episode fetching when show status is 'Ended'", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      mockReq = { params: { id: "test-show-1990-1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // getSeasonDetails should NOT be called for ended shows
      expect(getSeasonDetails).not.toHaveBeenCalled()
    })

    it("skips episode fetching when show status is 'Canceled'", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Canceled"))
      mockReq = { params: { id: "test-show-1990-1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // getSeasonDetails should NOT be called for canceled shows
      expect(getSeasonDetails).not.toHaveBeenCalled()
    })

    it("skips episode fetching when show status is 'Cancelled' (UK spelling)", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Cancelled"))
      mockReq = { params: { id: "test-show-1990-1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // getSeasonDetails should NOT be called for cancelled shows
      expect(getSeasonDetails).not.toHaveBeenCalled()
    })
  })
})
