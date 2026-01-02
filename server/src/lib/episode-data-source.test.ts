import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the API modules before importing the module under test
vi.mock("./tmdb.js", () => ({
  getTVShowDetails: vi.fn(),
  getSeasonDetails: vi.fn(),
  getTVShowExternalIds: vi.fn(),
  getEpisodeCredits: vi.fn(),
  getTVShowAggregateCredits: vi.fn(),
  searchPerson: vi.fn(),
  getPersonDetails: vi.fn(),
}))

vi.mock("./tvmaze.js", () => ({
  lookupShowByTvdb: vi.fn(),
  lookupShowByImdb: vi.fn(),
  getSeasonEpisodes: vi.fn(),
  getShowCast: vi.fn(),
  getEpisodeGuestCast: vi.fn(),
}))

vi.mock("./thetvdb.js", () => ({
  getSeasonEpisodes: vi.fn(),
  getSeriesActors: vi.fn(),
  getPerson: vi.fn(),
}))

vi.mock("./db.js", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn(),
  })),
  getShow: vi.fn(),
  getEpisodeCountsBySeasonFromDb: vi.fn(),
}))

vi.mock("./imdb.js", () => ({
  getShowEpisodes: vi.fn(),
}))

// Import mocks
import * as tmdb from "./tmdb.js"
import * as tvmaze from "./tvmaze.js"
import * as thetvdb from "./thetvdb.js"
import * as db from "./db.js"
import * as imdb from "./imdb.js"

// Import module under test
import {
  detectTmdbDataGaps,
  detectShowDataGaps,
  countEpisodesInDb,
  getExternalIds,
  fetchEpisodesWithFallback,
  fetchEpisodeCastWithFallback,
  fetchShowCastWithFallback,
  tryMatchToTmdb,
  type NormalizedEpisode,
  type NormalizedCastMember,
} from "./episode-data-source.js"

describe("Episode Data Source Cascade", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("detectTmdbDataGaps", () => {
    it("returns no gaps when all seasons have episodes", async () => {
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [
          { season_number: 1, episode_count: 10 },
          { season_number: 2, episode_count: 12 },
        ],
      } as never)

      vi.mocked(tmdb.getSeasonDetails).mockImplementation((_, seasonNumber) =>
        Promise.resolve({
          season_number: seasonNumber,
          episodes: Array(seasonNumber === 1 ? 10 : 12).fill({ id: 1 }),
        } as never)
      )

      const result = await detectTmdbDataGaps(123)

      expect(result.hasGaps).toBe(false)
      expect(result.missingSeasons).toEqual([])
      expect(result.details).toEqual([])
    })

    it("detects gap when season has episode_count but API returns 0 episodes", async () => {
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [
          { season_number: 1, episode_count: 10 },
          { season_number: 2, episode_count: 50 }, // Says 50 episodes
        ],
      } as never)

      vi.mocked(tmdb.getSeasonDetails)
        .mockResolvedValueOnce({
          season_number: 1,
          episodes: Array(10).fill({ id: 1 }),
        } as never)
        .mockResolvedValueOnce({
          season_number: 2,
          episodes: [], // But returns empty!
        } as never)

      const result = await detectTmdbDataGaps(123)

      expect(result.hasGaps).toBe(true)
      expect(result.missingSeasons).toEqual([2])
      expect(result.details).toContain("Season 2: expected 50 episodes, got 0")
    })

    it("detects gap when season fetch fails", async () => {
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [{ season_number: 1, episode_count: 10 }],
      } as never)

      vi.mocked(tmdb.getSeasonDetails).mockRejectedValue(new Error("API timeout"))

      const result = await detectTmdbDataGaps(123)

      expect(result.hasGaps).toBe(true)
      expect(result.missingSeasons).toEqual([1])
      expect(result.details[0]).toContain("Season 1: fetch failed")
    })

    it("skips season 0 (specials)", async () => {
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [
          { season_number: 0, episode_count: 5 }, // Specials - should be skipped
          { season_number: 1, episode_count: 10 },
        ],
      } as never)

      vi.mocked(tmdb.getSeasonDetails).mockResolvedValueOnce({
        season_number: 1,
        episodes: Array(10).fill({ id: 1 }),
      } as never)

      const result = await detectTmdbDataGaps(123)

      expect(result.hasGaps).toBe(false)
      // Should only have called getSeasonDetails for season 1
      expect(tmdb.getSeasonDetails).toHaveBeenCalledTimes(1)
      expect(tmdb.getSeasonDetails).toHaveBeenCalledWith(123, 1)
    })

    it("handles show details fetch failure", async () => {
      vi.mocked(tmdb.getTVShowDetails).mockRejectedValue(new Error("Show not found"))

      const result = await detectTmdbDataGaps(123)

      expect(result.hasGaps).toBe(false)
      expect(result.details[0]).toContain("Failed to get show details")
    })
  })

  describe("getExternalIds", () => {
    it("returns external IDs from TMDB", async () => {
      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: 121361,
        imdb_id: "tt0944947",
      } as never)

      vi.mocked(tvmaze.lookupShowByTvdb).mockResolvedValue({
        id: 82,
        name: "Game of Thrones",
      } as never)

      const result = await getExternalIds(123)

      expect(result.thetvdbId).toBe(121361)
      expect(result.imdbId).toBe("tt0944947")
      expect(result.tvmazeId).toBe(82)
    })

    it("falls back to IMDb lookup for TVmaze when TheTVDB ID not found", async () => {
      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: null,
        imdb_id: "tt0944947",
      } as never)

      vi.mocked(tvmaze.lookupShowByImdb).mockResolvedValue({
        id: 82,
        name: "Game of Thrones",
      } as never)

      const result = await getExternalIds(123)

      expect(result.tvmazeId).toBe(82)
      expect(tvmaze.lookupShowByImdb).toHaveBeenCalledWith("tt0944947")
    })

    it("returns null IDs when external IDs not found", async () => {
      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: null,
        imdb_id: null,
      } as never)

      const result = await getExternalIds(123)

      expect(result.thetvdbId).toBeNull()
      expect(result.imdbId).toBeNull()
      expect(result.tvmazeId).toBeNull()
    })

    it("handles API errors gracefully", async () => {
      vi.mocked(tmdb.getTVShowExternalIds).mockRejectedValue(new Error("API error"))

      const result = await getExternalIds(123)

      expect(result.thetvdbId).toBeNull()
      expect(result.imdbId).toBeNull()
      expect(result.tvmazeId).toBeNull()
    })
  })

  describe("fetchEpisodesWithFallback", () => {
    it("returns TMDB episodes when available", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [
          {
            id: 100,
            season_number: 1,
            episode_number: 1,
            name: "Pilot",
            air_date: "2020-01-01",
            runtime: 60,
          },
        ],
      } as never)

      const result = await fetchEpisodesWithFallback(123, 1)

      expect(result.source).toBe("tmdb")
      expect(result.episodes).toHaveLength(1)
      expect(result.episodes[0].name).toBe("Pilot")
      expect(result.episodes[0].tmdbEpisodeId).toBe(100)
    })

    it("falls back to TVmaze when TMDB returns no episodes", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [],
      } as never)

      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: 121361,
        imdb_id: null,
      } as never)

      vi.mocked(tvmaze.lookupShowByTvdb).mockResolvedValue({
        id: 82,
        name: "Test Show",
      } as never)

      vi.mocked(tvmaze.getSeasonEpisodes).mockResolvedValue([
        {
          id: 200,
          season: 1,
          number: 1,
          name: "Pilot",
          airdate: "2020-01-01",
          airtime: "21:00",
          runtime: 60,
          image: null,
          summary: "<p>Episode summary</p>",
        },
      ] as never)

      const result = await fetchEpisodesWithFallback(123, 1)

      expect(result.source).toBe("tvmaze")
      expect(result.episodes).toHaveLength(1)
      expect(result.episodes[0].tvmazeEpisodeId).toBe(200)
    })

    it("falls back to TheTVDB when both TMDB and TVmaze fail", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockRejectedValue(new Error("TMDB error"))

      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: 121361,
        imdb_id: null,
      } as never)

      vi.mocked(tvmaze.lookupShowByTvdb).mockResolvedValue(null)

      vi.mocked(thetvdb.getSeasonEpisodes).mockResolvedValue([
        {
          id: 300,
          seriesId: 121361,
          seasonNumber: 1,
          number: 1,
          name: "Pilot",
          aired: "2020-01-01",
          runtime: 60,
          overview: "Episode overview",
          image: null,
        },
      ] as never)

      const result = await fetchEpisodesWithFallback(123, 1)

      expect(result.source).toBe("thetvdb")
      expect(result.episodes).toHaveLength(1)
      expect(result.episodes[0].thetvdbEpisodeId).toBe(300)
    })

    it("returns empty array when all sources fail", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockRejectedValue(new Error("TMDB error"))

      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: null,
        imdb_id: null,
      } as never)

      const result = await fetchEpisodesWithFallback(123, 1)

      expect(result.source).toBe("tmdb")
      expect(result.episodes).toEqual([])
    })

    it("uses provided external IDs instead of fetching", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [],
      } as never)

      vi.mocked(tvmaze.getSeasonEpisodes).mockResolvedValue([
        {
          id: 200,
          season: 1,
          number: 1,
          name: "Pilot",
          airdate: "2020-01-01",
          airtime: "21:00",
          runtime: 60,
          image: null,
          summary: null,
        },
      ] as never)

      const result = await fetchEpisodesWithFallback(123, 1, {
        tvmazeId: 82,
        thetvdbId: 121361,
        imdbId: null,
      })

      expect(result.source).toBe("tvmaze")
      // Should not have fetched external IDs
      expect(tmdb.getTVShowExternalIds).not.toHaveBeenCalled()
    })

    it("strips HTML from TVmaze summaries", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [],
      } as never)

      vi.mocked(tvmaze.getSeasonEpisodes).mockResolvedValue([
        {
          id: 200,
          season: 1,
          number: 1,
          name: "Pilot",
          airdate: "2020-01-01",
          airtime: "21:00",
          runtime: 60,
          image: null,
          summary: "<p>This is the <b>summary</b> with <i>HTML</i>.</p>",
        },
      ] as never)

      const result = await fetchEpisodesWithFallback(123, 1, {
        tvmazeId: 82,
        thetvdbId: null,
        imdbId: null,
      })

      expect(result.episodes[0].overview).toBe("This is the summary with HTML.")
    })

    describe("preferredSource parameter", () => {
      it("tries IMDb directly when preferredSource is 'imdb' and skips cascade", async () => {
        // The imdb module needs to be mocked
        vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
          tvdb_id: 121361,
          imdb_id: "tt0944947",
        } as never)

        // Note: imdb is mocked at module level but getShowEpisodes is not the same as getSeasonEpisodesWithDetails
        // For this test, we verify the correct behavior by checking TMDB is NOT called

        const result = await fetchEpisodesWithFallback(
          123,
          1,
          { tvmazeId: 82, thetvdbId: 121361, imdbId: "tt0944947" },
          "imdb"
        )

        // TMDB should not be called when preferredSource is imdb
        expect(tmdb.getSeasonDetails).not.toHaveBeenCalled()
        // Should return imdb as the source
        expect(result.source).toBe("imdb")
      })

      it("returns empty episodes when preferredSource is 'imdb' but no IMDb ID available", async () => {
        const result = await fetchEpisodesWithFallback(
          123,
          1,
          { tvmazeId: 82, thetvdbId: 121361, imdbId: null },
          "imdb"
        )

        // Should return empty array with imdb source
        expect(result.source).toBe("imdb")
        expect(result.episodes).toEqual([])
        // TMDB should not be called
        expect(tmdb.getSeasonDetails).not.toHaveBeenCalled()
      })

      it("tries TVmaze first when preferredSource is 'tvmaze'", async () => {
        vi.mocked(tvmaze.getSeasonEpisodes).mockResolvedValue([
          {
            id: 200,
            season: 1,
            number: 1,
            name: "TVmaze Pilot",
            airdate: "2020-01-01",
            airtime: "21:00",
            runtime: 60,
            image: null,
            summary: null,
          },
        ] as never)

        const result = await fetchEpisodesWithFallback(
          123,
          1,
          { tvmazeId: 82, thetvdbId: 121361, imdbId: null },
          "tvmaze"
        )

        expect(result.source).toBe("tvmaze")
        expect(result.episodes).toHaveLength(1)
        expect(result.episodes[0].name).toBe("TVmaze Pilot")
        // TMDB should not be called since TVmaze succeeded
        expect(tmdb.getSeasonDetails).not.toHaveBeenCalled()
      })

      it("falls back to cascade when preferredSource 'tvmaze' fails", async () => {
        vi.mocked(tvmaze.getSeasonEpisodes).mockRejectedValue(new Error("TVmaze error"))

        vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
          season_number: 1,
          episodes: [
            {
              id: 100,
              season_number: 1,
              episode_number: 1,
              name: "TMDB Pilot",
              air_date: "2020-01-01",
              runtime: 60,
            },
          ],
        } as never)

        const result = await fetchEpisodesWithFallback(
          123,
          1,
          { tvmazeId: 82, thetvdbId: 121361, imdbId: null },
          "tvmaze"
        )

        // Should fall back to TMDB after TVmaze fails
        expect(result.source).toBe("tmdb")
        expect(result.episodes[0].name).toBe("TMDB Pilot")
      })

      it("tries TheTVDB first when preferredSource is 'thetvdb'", async () => {
        vi.mocked(thetvdb.getSeasonEpisodes).mockResolvedValue([
          {
            id: 300,
            seriesId: 121361,
            seasonNumber: 1,
            number: 1,
            name: "TheTVDB Pilot",
            aired: "2020-01-01",
            runtime: 60,
            overview: "Episode overview",
            image: null,
          },
        ] as never)

        const result = await fetchEpisodesWithFallback(
          123,
          1,
          { tvmazeId: null, thetvdbId: 121361, imdbId: null },
          "thetvdb"
        )

        expect(result.source).toBe("thetvdb")
        expect(result.episodes).toHaveLength(1)
        expect(result.episodes[0].name).toBe("TheTVDB Pilot")
        // TMDB should not be called since TheTVDB succeeded
        expect(tmdb.getSeasonDetails).not.toHaveBeenCalled()
      })

      it("skips preferred source in cascade to avoid duplicate calls", async () => {
        // When tvmaze is preferred but fails, cascade should skip tvmaze
        vi.mocked(tvmaze.getSeasonEpisodes).mockRejectedValue(new Error("TVmaze error"))
        vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
          season_number: 1,
          episodes: [],
        } as never)
        vi.mocked(thetvdb.getSeasonEpisodes).mockResolvedValue([
          {
            id: 300,
            seriesId: 121361,
            seasonNumber: 1,
            number: 1,
            name: "TheTVDB Pilot",
            aired: "2020-01-01",
            runtime: 60,
            overview: null,
            image: null,
          },
        ] as never)

        const result = await fetchEpisodesWithFallback(
          123,
          1,
          { tvmazeId: 82, thetvdbId: 121361, imdbId: null },
          "tvmaze"
        )

        // Should get TheTVDB episodes (TMDB was empty, TVmaze was already tried)
        expect(result.source).toBe("thetvdb")
        // TVmaze should only be called once (for the preferred source attempt)
        expect(tvmaze.getSeasonEpisodes).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe("fetchEpisodeCastWithFallback", () => {
    it("returns TMDB cast when available", async () => {
      vi.mocked(tmdb.getEpisodeCredits).mockResolvedValue({
        cast: [{ id: 1, name: "Actor One", character: "Character 1", profile_path: "/path1.jpg" }],
        guest_stars: [
          { id: 2, name: "Guest Star", character: "Guest", profile_path: "/path2.jpg" },
        ],
      } as never)

      const result = await fetchEpisodeCastWithFallback(123, 1, 1)

      expect(result.source).toBe("tmdb")
      expect(result.cast).toHaveLength(2)
      expect(result.cast[0].name).toBe("Actor One")
      expect(result.cast[0].appearanceType).toBe("regular")
      expect(result.cast[1].name).toBe("Guest Star")
      expect(result.cast[1].appearanceType).toBe("guest")
    })

    it("falls back to TVmaze guest cast when TMDB has no cast", async () => {
      vi.mocked(tmdb.getEpisodeCredits).mockResolvedValue({
        cast: [],
        guest_stars: [],
      } as never)

      vi.mocked(tvmaze.getEpisodeGuestCast).mockResolvedValue([
        {
          person: {
            id: 100,
            name: "TVmaze Actor",
            birthday: "1990-01-01",
            deathday: null,
            gender: "Male",
            country: null,
            image: { medium: "/image.jpg", original: "/image.jpg" },
          },
          character: { id: 1, name: "Character", image: null },
          self: false,
          voice: false,
        },
      ] as never)

      const result = await fetchEpisodeCastWithFallback(123, 1, 1, { tvmazeEpisodeId: 200 })

      expect(result.source).toBe("tvmaze")
      expect(result.cast).toHaveLength(1)
      expect(result.cast[0].name).toBe("TVmaze Actor")
      expect(result.cast[0].tvmazePersonId).toBe(100)
    })

    it("returns empty cast when all sources fail", async () => {
      vi.mocked(tmdb.getEpisodeCredits).mockRejectedValue(new Error("TMDB error"))

      const result = await fetchEpisodeCastWithFallback(123, 1, 1)

      expect(result.source).toBe("tmdb")
      expect(result.cast).toEqual([])
    })
  })

  describe("fetchShowCastWithFallback", () => {
    it("returns TMDB aggregate credits when available", async () => {
      vi.mocked(tmdb.getTVShowAggregateCredits).mockResolvedValue({
        cast: [
          {
            id: 1,
            name: "Main Actor",
            roles: [{ character: "Main Character" }],
            profile_path: "/path.jpg",
          },
        ],
      } as never)

      const result = await fetchShowCastWithFallback(123)

      expect(result.source).toBe("tmdb")
      expect(result.cast).toHaveLength(1)
      expect(result.cast[0].name).toBe("Main Actor")
      expect(result.cast[0].characterName).toBe("Main Character")
    })

    it("falls back to TVmaze when TMDB has no cast", async () => {
      vi.mocked(tmdb.getTVShowAggregateCredits).mockResolvedValue({
        cast: [],
      } as never)

      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: 121361,
        imdb_id: null,
      } as never)

      vi.mocked(tvmaze.lookupShowByTvdb).mockResolvedValue({
        id: 82,
        name: "Test Show",
      } as never)

      vi.mocked(tvmaze.getShowCast).mockResolvedValue([
        {
          person: {
            id: 100,
            name: "TVmaze Actor",
            birthday: "1990-01-01",
            deathday: "2020-01-01",
            gender: "Female",
            country: null,
            image: null,
          },
          character: { id: 1, name: "Character", image: null },
          self: false,
          voice: false,
        },
      ] as never)

      const result = await fetchShowCastWithFallback(123)

      expect(result.source).toBe("tvmaze")
      expect(result.cast).toHaveLength(1)
      expect(result.cast[0].birthday).toBe("1990-01-01")
      expect(result.cast[0].deathday).toBe("2020-01-01")
    })

    it("falls back to TheTVDB when TMDB and TVmaze fail", async () => {
      vi.mocked(tmdb.getTVShowAggregateCredits).mockRejectedValue(new Error("TMDB error"))

      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: 121361,
        imdb_id: null,
      } as never)

      vi.mocked(tvmaze.lookupShowByTvdb).mockResolvedValue(null)

      vi.mocked(thetvdb.getSeriesActors).mockResolvedValue([
        {
          id: 1,
          name: "Character Name",
          image: null,
          sort: 1,
          type: 3,
          personId: 200,
          seriesId: 121361,
          movieId: null,
          episodeId: null,
          isFeatured: true,
          peopleId: 200,
          personName: "TheTVDB Actor",
          tagOptions: null,
        },
      ] as never)

      vi.mocked(thetvdb.getPerson).mockResolvedValue({
        id: 200,
        name: "TheTVDB Actor",
        image: "/actor.jpg",
        score: 100,
        birth: "1985-05-15",
        death: null,
        birthPlace: "Los Angeles",
        gender: 1,
        biographies: null,
      } as never)

      const result = await fetchShowCastWithFallback(123)

      expect(result.source).toBe("thetvdb")
      expect(result.cast).toHaveLength(1)
      expect(result.cast[0].name).toBe("TheTVDB Actor")
      expect(result.cast[0].birthday).toBe("1985-05-15")
      expect(result.cast[0].thetvdbPersonId).toBe(200)
    })

    it("returns empty cast when all sources fail", async () => {
      vi.mocked(tmdb.getTVShowAggregateCredits).mockRejectedValue(new Error("TMDB error"))

      vi.mocked(tmdb.getTVShowExternalIds).mockResolvedValue({
        tvdb_id: null,
        imdb_id: null,
      } as never)

      const result = await fetchShowCastWithFallback(123)

      expect(result.source).toBe("tmdb")
      expect(result.cast).toEqual([])
    })
  })

  describe("tryMatchToTmdb", () => {
    it("returns TMDB person ID when exact birthday match found", async () => {
      vi.mocked(tmdb.searchPerson).mockResolvedValue({
        results: [
          { id: 1, name: "John Smith", known_for_department: "Acting" },
          { id: 2, name: "John Smith Jr", known_for_department: "Acting" },
        ],
      } as never)

      vi.mocked(tmdb.getPersonDetails)
        .mockResolvedValueOnce({ id: 1, birthday: "1980-01-01" } as never)
        .mockResolvedValueOnce({ id: 2, birthday: "1990-05-15" } as never)

      const result = await tryMatchToTmdb("John Smith", "1990-05-15")

      expect(result).toBe(2)
    })

    it("returns single actor result when no birthday provided", async () => {
      vi.mocked(tmdb.searchPerson).mockResolvedValue({
        results: [{ id: 1, name: "Unique Actor", known_for_department: "Acting" }],
      } as never)

      const result = await tryMatchToTmdb("Unique Actor")

      expect(result).toBe(1)
    })

    it("returns null when multiple results and no birthday provided", async () => {
      vi.mocked(tmdb.searchPerson).mockResolvedValue({
        results: [
          { id: 1, name: "John Smith", known_for_department: "Acting" },
          { id: 2, name: "John Smith", known_for_department: "Acting" },
        ],
      } as never)

      const result = await tryMatchToTmdb("John Smith")

      expect(result).toBeNull()
    })

    it("returns null when single result is not an actor", async () => {
      vi.mocked(tmdb.searchPerson).mockResolvedValue({
        results: [{ id: 1, name: "Director Name", known_for_department: "Directing" }],
      } as never)

      const result = await tryMatchToTmdb("Director Name")

      expect(result).toBeNull()
    })

    it("returns null when no search results", async () => {
      vi.mocked(tmdb.searchPerson).mockResolvedValue({
        results: [],
      } as never)

      const result = await tryMatchToTmdb("Unknown Person")

      expect(result).toBeNull()
    })

    it("returns null on API error", async () => {
      vi.mocked(tmdb.searchPerson).mockRejectedValue(new Error("API error"))

      const result = await tryMatchToTmdb("Any Name")

      expect(result).toBeNull()
    })

    it("returns null when birthday provided but no match found", async () => {
      vi.mocked(tmdb.searchPerson).mockResolvedValue({
        results: [
          { id: 1, name: "John Smith", known_for_department: "Acting" },
          { id: 2, name: "John Smith Jr", known_for_department: "Acting" },
        ],
      } as never)

      // Both results have different birthdays than what we're looking for
      vi.mocked(tmdb.getPersonDetails)
        .mockResolvedValueOnce({ id: 1, birthday: "1980-01-01" } as never)
        .mockResolvedValueOnce({ id: 2, birthday: "1985-06-15" } as never)

      const result = await tryMatchToTmdb("John Smith", "1990-05-15")

      expect(result).toBeNull()
    })
  })

  describe("HTML Stripping (via normalization)", () => {
    it("strips standard HTML tags from summaries", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [],
      } as never)

      vi.mocked(tvmaze.getSeasonEpisodes).mockResolvedValue([
        {
          id: 200,
          season: 1,
          number: 1,
          name: "Test",
          airdate: "2020-01-01",
          airtime: "21:00",
          runtime: 60,
          image: null,
          summary: "<p>This is <b>bold</b> and <i>italic</i> text.</p>",
        },
      ] as never)

      const result = await fetchEpisodesWithFallback(123, 1, {
        tvmazeId: 82,
        thetvdbId: null,
        imdbId: null,
      })

      expect(result.episodes[0].overview).toBe("This is bold and italic text.")
    })

    it("handles tags with attributes", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [],
      } as never)

      vi.mocked(tvmaze.getSeasonEpisodes).mockResolvedValue([
        {
          id: 200,
          season: 1,
          number: 1,
          name: "Test",
          airdate: "2020-01-01",
          airtime: "21:00",
          runtime: 60,
          image: null,
          summary: '<p class="summary"><a href="http://example.com">Link</a> text</p>',
        },
      ] as never)

      const result = await fetchEpisodesWithFallback(123, 1, {
        tvmazeId: 82,
        thetvdbId: null,
        imdbId: null,
      })

      expect(result.episodes[0].overview).toBe("Link text")
    })

    it("trims whitespace from result", async () => {
      vi.mocked(tmdb.getSeasonDetails).mockResolvedValue({
        season_number: 1,
        episodes: [],
      } as never)

      vi.mocked(tvmaze.getSeasonEpisodes).mockResolvedValue([
        {
          id: 200,
          season: 1,
          number: 1,
          name: "Test",
          airdate: "2020-01-01",
          airtime: "21:00",
          runtime: 60,
          image: null,
          summary: "  <p>Text with whitespace</p>  ",
        },
      ] as never)

      const result = await fetchEpisodesWithFallback(123, 1, {
        tvmazeId: 82,
        thetvdbId: null,
        imdbId: null,
      })

      expect(result.episodes[0].overview).toBe("Text with whitespace")
    })
  })

  describe("countEpisodesInDb", () => {
    it("returns count of episodes for a show", async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: "150" }],
        }),
      }
      vi.mocked(db.getPool).mockReturnValue(mockPool as never)

      const result = await countEpisodesInDb(879)

      expect(mockPool.query).toHaveBeenCalledWith(
        "SELECT COUNT(*) as count FROM episodes WHERE show_tmdb_id = $1",
        [879]
      )
      expect(result).toBe(150)
    })

    it("returns 0 when no episodes exist", async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: "0" }],
        }),
      }
      vi.mocked(db.getPool).mockReturnValue(mockPool as never)

      const result = await countEpisodesInDb(999)

      expect(result).toBe(0)
    })

    it("handles empty result set", async () => {
      const mockPool = {
        query: vi.fn().mockResolvedValue({
          rows: [],
        }),
      }
      vi.mocked(db.getPool).mockReturnValue(mockPool as never)

      const result = await countEpisodesInDb(999)

      expect(result).toBe(0)
    })
  })

  describe("detectShowDataGaps", () => {
    beforeEach(() => {
      // Reset all mocks for each test
      vi.clearAllMocks()
    })

    it("returns no gaps when show not found in database", async () => {
      vi.mocked(db.getShow).mockResolvedValue(null)

      const result = await detectShowDataGaps(999)

      expect(result.hasGaps).toBe(false)
      expect(result.details).toContain("Show not found in database")
    })

    it("detects gaps when expected episodes exceed actual episodes by more than tolerance", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 1000,
        imdb_id: null,
      } as never)

      // Mock episode counts per season (total 100 episodes)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map([[1, 100]]))

      // Mock TMDB to return no gaps at season level
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 879,
        name: "Test Show",
        seasons: [],
      } as never)

      const result = await detectShowDataGaps(879)

      expect(result.hasGaps).toBe(true)
      expect(result.details[0]).toContain("Expected 1000 episodes (TMDB), have 100")
    })

    it("returns no gaps when episodes within tolerance", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 100,
        imdb_id: null,
      } as never)

      // Mock episode counts per season (total 95 episodes)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map([[1, 95]]))

      // Mock TMDB to return no gaps at season level
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [],
      } as never)

      const result = await detectShowDataGaps(123)

      // 95 out of 100 is within 10% tolerance (10 episodes)
      expect(result.hasGaps).toBe(false)
    })

    it("uses 10% tolerance with minimum of 5 episodes", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 20,
        imdb_id: null,
      } as never)

      // Mock episode counts per season (total 15 episodes)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map([[1, 15]]))

      // Mock TMDB to return no gaps at season level
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [],
      } as never)

      const result = await detectShowDataGaps(123)

      // For 20 episodes, tolerance is max(5, 2) = 5
      // Missing 5 is exactly at tolerance, so no gap
      expect(result.hasGaps).toBe(false)
    })

    it("detects gaps when missing more than minimum tolerance", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 20,
        imdb_id: null,
      } as never)

      // Mock episode counts per season (total 10 episodes)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map([[1, 10]]))

      // Mock TMDB to return no gaps at season level
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [],
      } as never)

      const result = await detectShowDataGaps(123)

      // For 20 episodes, tolerance is 5. Missing 10 > 5, so gap detected
      expect(result.hasGaps).toBe(true)
    })

    it("detects gaps from IMDb when IMDb has more episodes than database", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 100,
        imdb_id: "tt0123456",
      } as never)

      // Mock episode counts per season (total 100 episodes in season 1)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map([[1, 100]]))

      // Mock TMDB to return no gaps
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [],
      } as never)

      // IMDb has 200 episodes in season 1 (more than the 100 in db)
      vi.mocked(imdb.getShowEpisodes).mockResolvedValue([
        { tconst: "tt001", parentTconst: "tt0123456", seasonNumber: 1, episodeNumber: 1 },
        { tconst: "tt002", parentTconst: "tt0123456", seasonNumber: 1, episodeNumber: 2 },
        // ... many more
        ...Array(198).fill({
          tconst: "tt999",
          parentTconst: "tt0123456",
          seasonNumber: 1,
          episodeNumber: 3,
        }),
      ])

      const result = await detectShowDataGaps(123)

      expect(result.hasGaps).toBe(true)
      expect(result.details[0]).toContain("Total: IMDb has 200 episodes, database has 100")
      expect(result.missingSeasons).toContain(1)
    })

    it("uses provided imdbId over show imdb_id", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 0,
        imdb_id: "tt9999999",
      } as never)

      // Mock episode counts per season (empty)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map())

      // Mock TMDB to return no gaps
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [],
      } as never)

      // Mock IMDb lookup
      vi.mocked(imdb.getShowEpisodes).mockResolvedValue([])

      await detectShowDataGaps(123, "tt0000001")

      // Should use the provided imdbId
      expect(imdb.getShowEpisodes).toHaveBeenCalledWith("tt0000001")
    })

    it("handles IMDb lookup errors gracefully", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 100,
        imdb_id: "tt0123456",
      } as never)

      // Mock episode counts per season (total 100 episodes)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map([[1, 100]]))

      // Mock TMDB to return no gaps
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [],
      } as never)

      // IMDb lookup fails
      vi.mocked(imdb.getShowEpisodes).mockRejectedValue(new Error("IMDb download failed"))

      const result = await detectShowDataGaps(123)

      // Should not throw, just add error to details
      expect(result.details.some((d) => d.includes("IMDb check failed"))).toBe(true)
    })

    it("includes missing seasons from IMDb in result", async () => {
      vi.mocked(db.getShow).mockResolvedValue({
        number_of_episodes: 50,
        imdb_id: "tt0123456",
      } as never)

      // Mock episode counts per season (database has 10 episodes in season 1 only)
      vi.mocked(db.getEpisodeCountsBySeasonFromDb).mockResolvedValue(new Map([[1, 10]]))

      // Mock TMDB to return no gaps
      vi.mocked(tmdb.getTVShowDetails).mockResolvedValue({
        id: 123,
        name: "Test Show",
        seasons: [],
      } as never)

      // IMDb has episodes across multiple seasons (more than db has per season)
      vi.mocked(imdb.getShowEpisodes).mockResolvedValue([
        // Season 1: 15 episodes (db has 10, so gap)
        ...Array(15).fill({
          tconst: "tt001",
          parentTconst: "tt0123456",
          seasonNumber: 1,
          episodeNumber: 1,
        }),
        // Season 2: 10 episodes (db has 0, so gap)
        ...Array(10).fill({
          tconst: "tt002",
          parentTconst: "tt0123456",
          seasonNumber: 2,
          episodeNumber: 1,
        }),
        // Season 3: 10 episodes (db has 0, so gap)
        ...Array(10).fill({
          tconst: "tt003",
          parentTconst: "tt0123456",
          seasonNumber: 3,
          episodeNumber: 1,
        }),
        // Season 4: 15 episodes (db has 0, so gap)
        ...Array(15).fill({
          tconst: "tt004",
          parentTconst: "tt0123456",
          seasonNumber: 4,
          episodeNumber: 1,
        }),
      ])

      const result = await detectShowDataGaps(123)

      expect(result.hasGaps).toBe(true)
      expect(result.missingSeasons).toContain(1)
      expect(result.missingSeasons).toContain(2)
      expect(result.missingSeasons).toContain(3)
      expect(result.missingSeasons).toContain(4)
    })
  })
})
