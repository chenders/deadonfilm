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

// Import mocks
import * as tmdb from "./tmdb.js"
import * as tvmaze from "./tvmaze.js"
import * as thetvdb from "./thetvdb.js"

// Import module under test
import {
  detectTmdbDataGaps,
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
})
