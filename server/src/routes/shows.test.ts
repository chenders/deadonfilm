import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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
  getActors: vi.fn(),
  batchUpsertActors: vi.fn(),
  upsertShow: vi.fn(),
  getSeasons: vi.fn(),
  getDeceasedActorsForShow: vi.fn(),
  getLivingActorsForShow: vi.fn(),
}))

vi.mock("../lib/mortality-stats.js", () => ({
  calculateMovieMortality: vi.fn(),
  calculateYearsLost: vi.fn(),
}))

vi.mock("newrelic", () => ({
  default: {
    recordCustomEvent: vi.fn(),
    addCustomAttributes: vi.fn(),
  },
}))

import { getShow, getSeasonEpisodes, getSeason } from "./shows.js"
import {
  getTVShowDetails,
  getTVShowAggregateCredits,
  batchGetPersonDetails,
  getSeasonDetails,
} from "../lib/tmdb.js"
import {
  getActors,
  upsertShow,
  getSeasons,
  getDeceasedActorsForShow,
  getLivingActorsForShow,
  batchUpsertActors,
} from "../lib/db.js"
import { calculateMovieMortality } from "../lib/mortality-stats.js"
import newrelic from "newrelic"

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
    vi.mocked(getActors).mockResolvedValue(new Map())
    vi.mocked(batchUpsertActors).mockResolvedValue(new Map())
    vi.mocked(upsertShow).mockResolvedValue()
    vi.mocked(getSeasons).mockResolvedValue([])
    vi.mocked(getDeceasedActorsForShow).mockResolvedValue([])
    vi.mocked(getLivingActorsForShow).mockResolvedValue([])
    vi.mocked(calculateMovieMortality).mockResolvedValue({
      expectedDeaths: 0.5,
      actualDeaths: 0,
      mortalitySurpriseScore: -1,
      actorResults: [],
    })

    // Set DATABASE_URL to enable database features
    process.env.DATABASE_URL = "postgresql://test:test@localhost/test"
  })

  afterEach(() => {
    delete process.env.DATABASE_URL
  })

  describe("episode fetching optimization based on show status", () => {
    // These tests verify the performance optimization: ended/canceled shows
    // skip expensive episode fetching since they'll never have new episodes

    it("skips episode fetching when show status is 'Ended'", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // getSeasonDetails should NOT be called for ended shows
      expect(getSeasonDetails).not.toHaveBeenCalled()
    })

    it("skips episode fetching when show status is 'Canceled'", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Canceled"))
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // getSeasonDetails should NOT be called for canceled shows
      expect(getSeasonDetails).not.toHaveBeenCalled()
    })

    it("skips episode fetching when show status is 'Cancelled' (UK spelling)", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Cancelled"))
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // getSeasonDetails should NOT be called for cancelled shows
      expect(getSeasonDetails).not.toHaveBeenCalled()
    })
  })

  describe("recordCustomEvent tracking", () => {
    it("records ShowView custom event with correct attributes", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      expect(newrelic.recordCustomEvent).toHaveBeenCalledWith(
        "ShowView",
        expect.objectContaining({
          tmdbId: 1400,
          name: "Test Show",
          firstAirYear: 1990,
          isEnded: true,
          responseTimeMs: expect.any(Number),
        })
      )
    })
  })

  describe("database deceased guest stars integration", () => {
    it("merges deceased guest stars from database with TMDB results", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      // No living actors from TMDB aggregate credits (cast has deathday: null)
      vi.mocked(getTVShowAggregateCredits).mockResolvedValue({
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
      })
      // Return database deceased actor that's not in TMDB aggregate credits
      vi.mocked(getDeceasedActorsForShow).mockResolvedValue([
        {
          id: 1,
          tmdb_id: 20753,
          name: "Fred Willard",
          profile_path: "/fred.jpg",
          birthday: "1933-09-18",
          deathday: "2020-05-15",
          cause_of_death: "Cardiac arrest",
          cause_of_death_source: "claude",
          cause_of_death_details: "Died peacefully at home",
          cause_of_death_details_source: "claude",
          wikipedia_url: "https://en.wikipedia.org/wiki/Fred_Willard",
          age_at_death: 86,
          years_lost: -4,
          total_episodes: 3,
          episodes: [
            {
              season_number: 1,
              episode_number: 5,
              episode_name: "Episode 5",
              character_name: "Guest Role",
            },
          ],
        },
      ])
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      expect(getDeceasedActorsForShow).toHaveBeenCalledWith(1400)
      // Verify the response includes the merged deceased actor
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          deceased: expect.arrayContaining([
            expect.objectContaining({
              id: 20753,
              name: "Fred Willard",
              causeOfDeath: "Cardiac arrest",
              totalEpisodes: 3,
            }),
          ]),
        })
      )
    })

    it("skips duplicate actors already in TMDB aggregate credits", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      // Actor 101 is in TMDB aggregate credits AND is deceased
      vi.mocked(batchGetPersonDetails).mockResolvedValue(
        new Map([
          [
            101,
            {
              id: 101,
              name: "Actor One",
              birthday: "1940-01-01",
              deathday: "2020-01-01", // Deceased
              profile_path: "/actor1.jpg",
              popularity: 10,
              biography: "",
              place_of_birth: null,
              imdb_id: null,
            },
          ],
        ])
      )
      // Database also returns actor 101 - should be skipped
      vi.mocked(getDeceasedActorsForShow).mockResolvedValue([
        {
          id: 1,
          tmdb_id: 101,
          name: "Actor One",
          profile_path: "/actor1.jpg",
          birthday: "1940-01-01",
          deathday: "2020-01-01",
          cause_of_death: "Natural causes",
          cause_of_death_source: "claude",
          cause_of_death_details: null,
          cause_of_death_details_source: null,
          wikipedia_url: null,
          age_at_death: 80,
          years_lost: 5,
          total_episodes: 10,
          episodes: [],
        },
      ])
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // Response should contain deceased array
      expect(jsonSpy).toHaveBeenCalled()
      const response = jsonSpy.mock.calls[0][0]
      expect(response).toHaveProperty("deceased")
      // Actor 101 should only appear once in deceased list
      const actorIds = response.deceased.map((d: { id: number }) => d.id)
      expect(actorIds.filter((id: number) => id === 101).length).toBe(1)
    })

    it("handles database errors gracefully without crashing the route", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      // Simulate database error
      vi.mocked(getDeceasedActorsForShow).mockRejectedValue(new Error("Database connection error"))
      mockReq = { params: { id: "1400" } }

      // Route should complete without throwing
      await expect(getShow(mockReq as Request, mockRes as Response)).resolves.not.toThrow()

      // Response should still be returned (with actors from TMDB only)
      expect(jsonSpy).toHaveBeenCalled()
    })

    it("skips database query when DATABASE_URL is not set", async () => {
      delete process.env.DATABASE_URL
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      // getDeceasedActorsForShow should not be called when no DATABASE_URL
      expect(getDeceasedActorsForShow).not.toHaveBeenCalled()
    })

    it("correctly maps database episode format to API response format", async () => {
      vi.mocked(getTVShowDetails).mockResolvedValue(createMockShow("Ended"))
      vi.mocked(getDeceasedActorsForShow).mockResolvedValue([
        {
          id: 1,
          tmdb_id: 999,
          name: "Test Actor",
          profile_path: null,
          birthday: "1950-01-01",
          deathday: "2021-06-15",
          cause_of_death: null,
          cause_of_death_source: null,
          cause_of_death_details: null,
          cause_of_death_details_source: null,
          wikipedia_url: null,
          age_at_death: 71,
          years_lost: 8,
          total_episodes: 2,
          episodes: [
            {
              season_number: 2,
              episode_number: 5,
              episode_name: "The Episode",
              character_name: "Role A",
            },
            { season_number: 3, episode_number: 10, episode_name: null, character_name: null },
          ],
        },
      ])
      mockReq = { params: { id: "1400" } }

      await getShow(mockReq as Request, mockRes as Response)

      const response = jsonSpy.mock.calls[0][0]
      const dbActor = response.deceased.find((d: { id: number }) => d.id === 999)

      expect(dbActor).toBeDefined()
      expect(dbActor.episodes).toHaveLength(2)
      // First episode with name
      expect(dbActor.episodes[0]).toEqual({
        seasonNumber: 2,
        episodeNumber: 5,
        episodeName: "The Episode",
        character: "Role A",
      })
      // Second episode with null name falls back
      expect(dbActor.episodes[1]).toEqual({
        seasonNumber: 3,
        episodeNumber: 10,
        episodeName: "Episode 10",
        character: "Guest",
      })
    })
  })
})

describe("getSeasonEpisodes route", () => {
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

  it("returns episodes for a valid season", async () => {
    vi.mocked(getSeasonDetails).mockResolvedValue({
      id: 123,
      season_number: 1,
      name: "Season 1",
      air_date: "1990-01-01",
      poster_path: null,
      episodes: [
        {
          id: 1001,
          episode_number: 1,
          season_number: 1,
          name: "Pilot",
          air_date: "1990-01-01",
          runtime: 30,
          guest_stars: [],
        },
        {
          id: 1002,
          episode_number: 2,
          season_number: 1,
          name: "The Second One",
          air_date: "1990-01-08",
          runtime: 30,
          guest_stars: [],
        },
      ],
    })

    mockReq = { params: { id: "1400", seasonNumber: "1" } }

    await getSeasonEpisodes(mockReq as Request, mockRes as Response)

    expect(getSeasonDetails).toHaveBeenCalledWith(1400, 1)
    expect(jsonSpy).toHaveBeenCalledWith({
      episodes: [
        { episodeNumber: 1, seasonNumber: 1, name: "Pilot", airDate: "1990-01-01" },
        { episodeNumber: 2, seasonNumber: 1, name: "The Second One", airDate: "1990-01-08" },
      ],
    })
  })

  it("returns 400 for invalid show ID", async () => {
    mockReq = { params: { id: "invalid", seasonNumber: "1" } }

    await getSeasonEpisodes(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid show ID" } })
  })

  it("returns 400 for invalid season number", async () => {
    mockReq = { params: { id: "1400", seasonNumber: "abc" } }

    await getSeasonEpisodes(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid season number" } })
  })

  it("returns 400 for season number less than 1", async () => {
    mockReq = { params: { id: "1400", seasonNumber: "0" } }

    await getSeasonEpisodes(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid season number" } })
  })

  it("returns 500 on TMDB API error", async () => {
    vi.mocked(getSeasonDetails).mockRejectedValue(new Error("TMDB API error"))
    mockReq = { params: { id: "1400", seasonNumber: "1" } }

    await getSeasonEpisodes(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Failed to fetch season episodes" } })
  })
})

describe("getSeason route", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  const mockShow = {
    id: 1400,
    name: "Test Show",
    overview: "A test show",
    first_air_date: "1990-01-01",
    last_air_date: "1999-05-14",
    poster_path: "/poster.jpg",
    backdrop_path: null,
    original_language: "en",
    origin_country: ["US"],
    seasons: [
      {
        id: 1,
        season_number: 1,
        name: "Season 1",
        air_date: "1990-01-01",
        episode_count: 10,
        poster_path: "/s1.jpg",
      },
    ],
  }

  const mockSeason = {
    id: 123,
    season_number: 1,
    name: "Season 1",
    air_date: "1990-01-01",
    poster_path: "/s1.jpg",
    episodes: [
      {
        id: 1001,
        episode_number: 1,
        season_number: 1,
        name: "Pilot",
        air_date: "1990-01-01",
        runtime: 30,
        guest_stars: [{ id: 100, name: "Guest Star 1" }],
      },
      {
        id: 1002,
        episode_number: 2,
        season_number: 1,
        name: "Episode Two",
        air_date: "1990-01-08",
        runtime: 30,
        guest_stars: [{ id: 101, name: "Guest Star 2" }],
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
  })

  it("returns season data with stats for a valid request", async () => {
    vi.mocked(getTVShowDetails).mockResolvedValue(
      mockShow as ReturnType<typeof getTVShowDetails> extends Promise<infer T> ? T : never
    )
    vi.mocked(getSeasonDetails).mockResolvedValue(
      mockSeason as ReturnType<typeof getSeasonDetails> extends Promise<infer T> ? T : never
    )
    vi.mocked(batchGetPersonDetails).mockResolvedValue(
      new Map([
        [
          100,
          {
            id: 100,
            name: "Guest Star 1",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            profile_path: null,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
            popularity: 5.0,
          },
        ],
        [
          101,
          {
            id: 101,
            name: "Guest Star 2",
            birthday: "1960-01-01",
            deathday: null,
            profile_path: null,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
            popularity: 5.0,
          },
        ],
      ])
    )
    vi.mocked(getActors).mockResolvedValue(new Map())

    mockReq = { params: { id: "1400", seasonNumber: "1" } }

    await getSeason(mockReq as Request, mockRes as Response)

    expect(getTVShowDetails).toHaveBeenCalledWith(1400)
    expect(getSeasonDetails).toHaveBeenCalledWith(1400, 1)
    expect(jsonSpy).toHaveBeenCalledWith({
      show: {
        id: 1400,
        name: "Test Show",
        posterPath: "/poster.jpg",
        firstAirDate: "1990-01-01",
      },
      season: {
        seasonNumber: 1,
        name: "Season 1",
        airDate: "1990-01-01",
        posterPath: "/s1.jpg",
        episodeCount: 2,
      },
      episodes: [
        {
          episodeNumber: 1,
          seasonNumber: 1,
          name: "Pilot",
          airDate: "1990-01-01",
          runtime: 30,
          guestStarCount: 1,
          deceasedCount: 1,
        },
        {
          episodeNumber: 2,
          seasonNumber: 1,
          name: "Episode Two",
          airDate: "1990-01-08",
          runtime: 30,
          guestStarCount: 1,
          deceasedCount: 0,
        },
      ],
      stats: {
        totalEpisodes: 2,
        uniqueGuestStars: 2,
        uniqueDeceasedGuestStars: 1,
        expectedDeaths: 0.5,
        mortalitySurpriseScore: -1,
      },
    })
  })

  it("returns 400 for invalid show ID", async () => {
    mockReq = { params: { id: "invalid", seasonNumber: "1" } }

    await getSeason(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid show ID" } })
  })

  it("returns 400 for invalid season number", async () => {
    mockReq = { params: { id: "1400", seasonNumber: "abc" } }

    await getSeason(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid season number" } })
  })

  it("returns 400 for season number less than 1", async () => {
    mockReq = { params: { id: "1400", seasonNumber: "0" } }

    await getSeason(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(400)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Invalid season number" } })
  })

  it("returns 404 for non-US/non-English shows", async () => {
    const nonUSShow = { ...mockShow, original_language: "de", origin_country: ["DE"] }
    vi.mocked(getTVShowDetails).mockResolvedValue(
      nonUSShow as ReturnType<typeof getTVShowDetails> extends Promise<infer T> ? T : never
    )
    vi.mocked(getSeasonDetails).mockResolvedValue(
      mockSeason as ReturnType<typeof getSeasonDetails> extends Promise<infer T> ? T : never
    )

    mockReq = { params: { id: "1400", seasonNumber: "1" } }

    await getSeason(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Show not available" } })
  })

  it("returns 500 on TMDB API error", async () => {
    vi.mocked(getTVShowDetails).mockRejectedValue(new Error("TMDB API error"))
    mockReq = { params: { id: "1400", seasonNumber: "1" } }

    await getSeason(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({ error: { message: "Failed to fetch season data" } })
  })

  it("counts unique guest stars across episodes", async () => {
    const seasonWithDuplicates = {
      ...mockSeason,
      episodes: [
        {
          id: 1001,
          episode_number: 1,
          season_number: 1,
          name: "Ep 1",
          air_date: "1990-01-01",
          runtime: 30,
          guest_stars: [{ id: 100, name: "Same Guest" }],
        },
        {
          id: 1002,
          episode_number: 2,
          season_number: 1,
          name: "Ep 2",
          air_date: "1990-01-08",
          runtime: 30,
          guest_stars: [{ id: 100, name: "Same Guest" }],
        },
      ],
    }
    vi.mocked(getTVShowDetails).mockResolvedValue(
      mockShow as ReturnType<typeof getTVShowDetails> extends Promise<infer T> ? T : never
    )
    vi.mocked(getSeasonDetails).mockResolvedValue(
      seasonWithDuplicates as ReturnType<typeof getSeasonDetails> extends Promise<infer T>
        ? T
        : never
    )
    vi.mocked(batchGetPersonDetails).mockResolvedValue(
      new Map([
        [
          100,
          {
            id: 100,
            name: "Same Guest",
            birthday: "1950-01-01",
            deathday: "2020-01-01",
            profile_path: null,
            biography: "",
            place_of_birth: null,
            imdb_id: null,
            popularity: 5.0,
          },
        ],
      ])
    )
    vi.mocked(getActors).mockResolvedValue(new Map())

    mockReq = { params: { id: "1400", seasonNumber: "1" } }

    await getSeason(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stats: {
          totalEpisodes: 2,
          uniqueGuestStars: 1, // Same guest in both episodes counts as 1
          uniqueDeceasedGuestStars: 1,
          expectedDeaths: 0.5,
          mortalitySurpriseScore: -1,
        },
      })
    )
  })
})
