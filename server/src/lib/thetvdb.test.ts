import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock fetch before importing the module
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Import after mocking
import {
  authenticate,
  clearTokenCache,
  getSeries,
  getSeriesExtended,
  getSeriesEpisodes,
  getSeasonEpisodes,
  getSeriesActors,
  getSeriesCharacters,
  getPerson,
  getPersonExtended,
  getSeriesSeasons,
  searchSeries,
  findSeriesByName,
  type TheTVDBSeries,
  type TheTVDBEpisode,
  type TheTVDBActor,
  type TheTVDBPerson,
  type TheTVDBSeason,
} from "./thetvdb.js"

// Sample test data
const mockSeries: TheTVDBSeries = {
  id: 121361,
  name: "Game of Thrones",
  slug: "game-of-thrones",
  image: "https://artworks.thetvdb.com/banners/posters/121361-1.jpg",
  firstAired: "2011-04-17",
  lastAired: "2019-05-19",
  nextAired: null,
  score: 1000000,
  status: {
    id: 2,
    name: "Ended",
    recordType: "series",
    keepUpdated: false,
  },
  originalCountry: "usa",
  originalLanguage: "eng",
  defaultSeasonType: 1,
  isOrderRandomized: false,
  lastUpdated: "2023-01-15T12:00:00Z",
  averageRuntime: 60,
  episodes: null,
  overview: "Based on the bestselling book series by George R.R. Martin.",
  year: "2011",
}

const mockEpisode: TheTVDBEpisode = {
  id: 3254641,
  seriesId: 121361,
  name: "Winter Is Coming",
  aired: "2011-04-17",
  runtime: 60,
  nameTranslations: ["eng"],
  overview: "Lord Eddard Stark is asked to serve as Hand to the King.",
  overviewTranslations: ["eng"],
  image: "https://artworks.thetvdb.com/banners/episodes/121361/3254641.jpg",
  imageType: 11,
  isMovie: 0,
  seasons: null,
  number: 1,
  seasonNumber: 1,
  lastUpdated: "2023-01-15T12:00:00Z",
  finaleType: null,
  year: "2011",
}

const mockActor: TheTVDBActor = {
  id: 1,
  name: "Daenerys Targaryen",
  image: "https://artworks.thetvdb.com/banners/actors/1.jpg",
  sort: 1,
  type: 3, // Actor
  personId: 296574,
  seriesId: 121361,
  movieId: null,
  episodeId: null,
  isFeatured: true,
  peopleId: 296574,
  personName: "Emilia Clarke",
  tagOptions: null,
}

const mockPerson: TheTVDBPerson = {
  id: 296574,
  name: "Emilia Clarke",
  image: "https://artworks.thetvdb.com/banners/person/296574.jpg",
  score: 1000,
  birth: "1986-10-23",
  death: null,
  birthPlace: "London, England, UK",
  gender: 2,
  biographies: [
    {
      biography: "British actress known for Game of Thrones.",
      language: "eng",
    },
  ],
}

const mockSeason: TheTVDBSeason = {
  id: 364731,
  seriesId: 121361,
  type: {
    id: 1,
    name: "Aired Order",
    type: "official",
  },
  name: "Season 1",
  number: 1,
  image: "https://artworks.thetvdb.com/banners/seasons/121361-1.jpg",
  imageType: 7,
  lastUpdated: "2023-01-15T12:00:00Z",
  companies: {
    studio: null,
    network: null,
    production: null,
    distributor: null,
    special_effects: null,
  },
}

describe("TheTVDB API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearTokenCache()
    process.env.THETVDB_API_KEY = "test-api-key"
  })

  afterEach(() => {
    delete process.env.THETVDB_API_KEY
  })

  describe("authenticate", () => {
    it("authenticates and returns JWT token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-jwt-token" },
          }),
      })

      const token = await authenticate()

      expect(mockFetch).toHaveBeenCalledWith("https://api4.thetvdb.com/v4/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ apikey: "test-api-key" }),
      })
      expect(token).toBe("test-jwt-token")
    })

    it("caches token and returns cached value on subsequent calls", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "cached-jwt-token" },
          }),
      })

      // First call - should fetch token
      const token1 = await authenticate()

      // Second call - should use cached token
      const token2 = await authenticate()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(token1).toBe("cached-jwt-token")
      expect(token2).toBe("cached-jwt-token")
    })

    it("throws error when API key is not set", async () => {
      delete process.env.THETVDB_API_KEY

      await expect(authenticate()).rejects.toThrow(
        "THETVDB_API_KEY environment variable is not set"
      )
    })

    it("throws error on authentication failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      })

      await expect(authenticate()).rejects.toThrow(
        "TheTVDB authentication failed: 401 Unauthorized"
      )
    })
  })

  describe("clearTokenCache", () => {
    it("clears cached token, forcing re-authentication", async () => {
      // First authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "first-token" },
          }),
      })

      await authenticate()

      // Clear cache
      clearTokenCache()

      // Second authentication should fetch again
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "second-token" },
          }),
      })

      const token2 = await authenticate()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(token2).toBe("second-token")
    })
  })

  describe("getSeries", () => {
    it("returns series details by TheTVDB ID", async () => {
      // Auth call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      // Series call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: mockSeries,
          }),
      })

      const result = await getSeries(121361)

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/series/121361",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      )
      expect(result).toEqual(mockSeries)
    })

    it("returns null when series not found (404)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await getSeries(999999)

      expect(result).toBeNull()
    })

    it("throws on API error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })

      await expect(getSeries(121361)).rejects.toThrow(
        "TheTVDB API error: 500 Internal Server Error"
      )
    })
  })

  describe("getSeriesExtended", () => {
    it("returns extended series details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: mockSeries,
          }),
      })

      const result = await getSeriesExtended(121361)

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/series/121361/extended",
        expect.any(Object)
      )
      expect(result).toEqual(mockSeries)
    })
  })

  describe("getSeriesEpisodes", () => {
    it("returns all episodes with pagination", async () => {
      const page0Episodes = [mockEpisode, { ...mockEpisode, id: 3254642, number: 2 }]
      const page1Episodes = [{ ...mockEpisode, id: 3254643, number: 3 }]

      // Auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      // Page 0
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { series: mockSeries, episodes: page0Episodes },
          }),
      })

      // Page 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { series: mockSeries, episodes: page1Episodes },
          }),
      })

      // Page 2 (empty - stops pagination)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { series: mockSeries, episodes: [] },
          }),
      })

      const result = await getSeriesEpisodes(121361)

      expect(result).toHaveLength(3)
      expect(result[0].id).toBe(3254641)
      expect(result[1].id).toBe(3254642)
      expect(result[2].id).toBe(3254643)
    })

    it("returns empty array when no episodes found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { series: mockSeries, episodes: [] },
          }),
      })

      const result = await getSeriesEpisodes(121361)

      expect(result).toEqual([])
    })

    it("accepts different season types", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { series: mockSeries, episodes: [] },
          }),
      })

      await getSeriesEpisodes(121361, "dvd")

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/series/121361/episodes/dvd?page=0",
        expect.any(Object)
      )
    })
  })

  describe("getSeasonEpisodes", () => {
    it("filters episodes by season number", async () => {
      const allEpisodes = [
        { ...mockEpisode, seasonNumber: 1, number: 1 },
        { ...mockEpisode, id: 3254642, seasonNumber: 1, number: 2 },
        { ...mockEpisode, id: 3254650, seasonNumber: 2, number: 1 },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { series: mockSeries, episodes: allEpisodes },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { series: mockSeries, episodes: [] },
          }),
      })

      const result = await getSeasonEpisodes(121361, 1)

      expect(result).toHaveLength(2)
      expect(result.every((ep) => ep.seasonNumber === 1)).toBe(true)
    })
  })

  describe("getSeriesActors", () => {
    it("returns only actors (type 3) from characters endpoint", async () => {
      const characters = [
        mockActor,
        { ...mockActor, id: 2, type: 1 }, // Not an actor
        { ...mockActor, id: 3, type: 3 }, // Another actor
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: characters,
          }),
      })

      const result = await getSeriesActors(121361)

      expect(result).toHaveLength(2)
      expect(result.every((a) => a.type === 3)).toBe(true)
    })

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await getSeriesActors(999999)

      expect(result).toEqual([])
    })
  })

  describe("getSeriesCharacters", () => {
    it("returns all characters (not just actors)", async () => {
      const characters = [
        mockActor,
        { ...mockActor, id: 2, type: 1 },
        { ...mockActor, id: 3, type: 2 },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: characters,
          }),
      })

      const result = await getSeriesCharacters(121361)

      expect(result).toHaveLength(3)
    })
  })

  describe("getPerson", () => {
    it("returns person details by TheTVDB person ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: mockPerson,
          }),
      })

      const result = await getPerson(296574)

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/people/296574",
        expect.any(Object)
      )
      expect(result).toEqual(mockPerson)
    })

    it("returns null when person not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await getPerson(999999)

      expect(result).toBeNull()
    })
  })

  describe("getPersonExtended", () => {
    it("returns extended person details", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: mockPerson,
          }),
      })

      const result = await getPersonExtended(296574)

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/people/296574/extended",
        expect.any(Object)
      )
      expect(result).toEqual(mockPerson)
    })
  })

  describe("getSeriesSeasons", () => {
    it("returns all seasons for a series", async () => {
      const seasons = [mockSeason, { ...mockSeason, id: 364732, number: 2 }]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: seasons,
          }),
      })

      const result = await getSeriesSeasons(121361)

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/series/121361/seasons",
        expect.any(Object)
      )
      expect(result).toHaveLength(2)
    })

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await getSeriesSeasons(999999)

      expect(result).toEqual([])
    })
  })

  describe("searchSeries", () => {
    it("searches for series by query", async () => {
      const searchResults = [mockSeries, { ...mockSeries, id: 121362, name: "Game of Thrones 2" }]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: searchResults,
          }),
      })

      const result = await searchSeries("Game of Thrones")

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/search?query=Game%20of%20Thrones&type=series",
        expect.any(Object)
      )
      expect(result).toHaveLength(2)
    })

    it("encodes special characters in query", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: [],
          }),
      })

      await searchSeries("Show & Tell: Part 1")

      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api4.thetvdb.com/v4/search?query=Show%20%26%20Tell%3A%20Part%201&type=series",
        expect.any(Object)
      )
    })

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await searchSeries("NonexistentShow")

      expect(result).toEqual([])
    })
  })

  describe("findSeriesByName", () => {
    it("returns exact title match when found", async () => {
      const searchResults = [
        { ...mockSeries, name: "Game of Thrones: Documentary" },
        mockSeries, // Exact match
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: searchResults,
          }),
      })

      const result = await findSeriesByName("Game of Thrones")

      expect(result?.name).toBe("Game of Thrones")
    })

    it("returns first result when no exact match found", async () => {
      const searchResults = [
        { ...mockSeries, id: 1, name: "Game of Thrones: Documentary" },
        { ...mockSeries, id: 2, name: "Game of Thrones Companion" },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: searchResults,
          }),
      })

      const result = await findSeriesByName("Game of Thrones")

      expect(result?.id).toBe(1) // First result
    })

    it("returns null when no results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: [],
          }),
      })

      const result = await findSeriesByName("Completely Unknown Show")

      expect(result).toBeNull()
    })

    it("handles case-insensitive exact matching", async () => {
      const searchResults = [{ ...mockSeries, name: "game of thrones" }]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: searchResults,
          }),
      })

      const result = await findSeriesByName("Game of Thrones")

      expect(result?.name).toBe("game of thrones")
    })
  })

  describe("Error Handling", () => {
    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      await expect(authenticate()).rejects.toThrow("Network error")
    })

    it("handles rate limit exceeded (429)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            status: "success",
            data: { token: "test-token" },
          }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })

      await expect(getSeries(121361)).rejects.toThrow("TheTVDB API error: 429 Too Many Requests")
    })
  })
})
