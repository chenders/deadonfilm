import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock fetch before importing the module
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Import after mocking
import {
  searchShowByName,
  searchShows,
  lookupShowByTvdb,
  lookupShowByImdb,
  getShow,
  getShowWithEmbeds,
  getShowEpisodes,
  getSeasonEpisodes,
  getShowCast,
  getEpisodeGuestCast,
  getEpisode,
  getPerson,
  findShowByName,
  findShow,
  type TVmazeShow,
  type TVmazeEpisode,
  type TVmazeCastMember,
  type TVmazeGuestCastMember,
  type TVmazePerson,
  type TVmazeSearchResult,
} from "./tvmaze.js"

// Sample test data
const mockShow: TVmazeShow = {
  id: 82,
  name: "Game of Thrones",
  premiered: "2011-04-17",
  ended: "2019-05-19",
  status: "Ended",
  runtime: 60,
  officialSite: "http://www.hbo.com/game-of-thrones",
  schedule: { time: "21:00", days: ["Sunday"] },
  network: {
    id: 8,
    name: "HBO",
    country: { name: "United States", code: "US" },
  },
  webChannel: null,
  externals: { tvrage: 24493, thetvdb: 121361, imdb: "tt0944947" },
  image: {
    medium: "https://static.tvmaze.com/uploads/images/medium_portrait/190/476117.jpg",
    original: "https://static.tvmaze.com/uploads/images/original_untouched/190/476117.jpg",
  },
  summary: "<p>Based on the bestselling book series.</p>",
}

const mockEpisode: TVmazeEpisode = {
  id: 4952,
  name: "Winter Is Coming",
  season: 1,
  number: 1,
  airdate: "2011-04-17",
  airtime: "21:00",
  runtime: 60,
  image: {
    medium: "https://static.tvmaze.com/uploads/images/medium_landscape/1/2668.jpg",
    original: "https://static.tvmaze.com/uploads/images/original_untouched/1/2668.jpg",
  },
  summary: "<p>Lord Eddard Stark is asked to serve as Hand to the King.</p>",
}

const mockPerson: TVmazePerson = {
  id: 14075,
  name: "Emilia Clarke",
  birthday: "1986-10-23",
  deathday: null,
  gender: "Female",
  country: { name: "United Kingdom", code: "GB" },
  image: {
    medium: "https://static.tvmaze.com/uploads/images/medium_portrait/0/1815.jpg",
    original: "https://static.tvmaze.com/uploads/images/original_untouched/0/1815.jpg",
  },
}

const mockCastMember: TVmazeCastMember = {
  person: mockPerson,
  character: {
    id: 41800,
    name: "Daenerys Targaryen",
    image: null,
  },
  self: false,
  voice: false,
}

const mockGuestCastMember: TVmazeGuestCastMember = {
  person: {
    ...mockPerson,
    id: 99999,
    name: "Guest Star",
  },
  character: {
    id: 12345,
    name: "Guest Character",
    image: null,
  },
  self: false,
  voice: false,
}

describe("TVmaze API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("searchShowByName", () => {
    it("returns show when found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await searchShowByName("Game of Thrones")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tvmaze.com/singlesearch/shows?q=Game%20of%20Thrones"
      )
      expect(result).toEqual(mockShow)
    })

    it("returns null when show not found (404)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await searchShowByName("NonexistentShow")

      expect(result).toBeNull()
    })

    it("throws error on API failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      })

      await expect(searchShowByName("Game of Thrones")).rejects.toThrow(
        "TVmaze API error: 500 Internal Server Error"
      )
    })

    it("encodes special characters in query", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      await searchShowByName("Show & Tell: Part 1")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tvmaze.com/singlesearch/shows?q=Show%20%26%20Tell%3A%20Part%201"
      )
    })
  })

  describe("searchShows", () => {
    it("returns array of search results", async () => {
      const mockResults: TVmazeSearchResult[] = [
        { score: 0.9, show: mockShow },
        { score: 0.7, show: { ...mockShow, id: 83, name: "Similar Show" } },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResults),
      })

      const result = await searchShows("Game")

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/search/shows?q=Game")
      expect(result).toHaveLength(2)
      expect(result[0].score).toBe(0.9)
    })

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await searchShows("NonexistentShow")

      expect(result).toEqual([])
    })
  })

  describe("lookupShowByTvdb", () => {
    it("returns show when found by TheTVDB ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await lookupShowByTvdb(121361)

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/lookup/shows?thetvdb=121361")
      expect(result).toEqual(mockShow)
    })

    it("returns null when not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await lookupShowByTvdb(999999)

      expect(result).toBeNull()
    })
  })

  describe("lookupShowByImdb", () => {
    it("returns show when found by IMDb ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await lookupShowByImdb("tt0944947")

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/lookup/shows?imdb=tt0944947")
      expect(result).toEqual(mockShow)
    })
  })

  describe("getShow", () => {
    it("returns show by TVmaze ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await getShow(82)

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/shows/82")
      expect(result).toEqual(mockShow)
    })
  })

  describe("getShowWithEmbeds", () => {
    it("returns show with embedded episodes and cast", async () => {
      const showWithEmbeds = {
        ...mockShow,
        _embedded: {
          episodes: [mockEpisode],
          cast: [mockCastMember],
        },
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(showWithEmbeds),
      })

      const result = await getShowWithEmbeds(82)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tvmaze.com/shows/82?embed[]=episodes&embed[]=cast"
      )
      expect(result?._embedded?.episodes).toHaveLength(1)
      expect(result?._embedded?.cast).toHaveLength(1)
    })

    it("allows specifying specific embeds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      await getShowWithEmbeds(82, ["episodes"])

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/shows/82?embed[]=episodes")
    })
  })

  describe("getShowEpisodes", () => {
    it("returns all episodes for a show", async () => {
      const episodes = [mockEpisode, { ...mockEpisode, id: 4953, number: 2, name: "The Kingsroad" }]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(episodes),
      })

      const result = await getShowEpisodes(82)

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/shows/82/episodes")
      expect(result).toHaveLength(2)
    })

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await getShowEpisodes(999999)

      expect(result).toEqual([])
    })
  })

  describe("getSeasonEpisodes", () => {
    it("filters episodes by season number", async () => {
      const allEpisodes = [
        { ...mockEpisode, season: 1, number: 1 },
        { ...mockEpisode, id: 4953, season: 1, number: 2 },
        { ...mockEpisode, id: 5000, season: 2, number: 1 },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(allEpisodes),
      })

      const result = await getSeasonEpisodes(82, 1)

      expect(result).toHaveLength(2)
      expect(result.every((ep) => ep.season === 1)).toBe(true)
    })
  })

  describe("getShowCast", () => {
    it("returns main cast for a show", async () => {
      const cast = [mockCastMember]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(cast),
      })

      const result = await getShowCast(82)

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/shows/82/cast")
      expect(result).toHaveLength(1)
      expect(result[0].person.name).toBe("Emilia Clarke")
    })

    it("returns empty array on 404", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await getShowCast(999999)

      expect(result).toEqual([])
    })
  })

  describe("getEpisodeGuestCast", () => {
    it("returns guest cast for an episode", async () => {
      const guestCast = [mockGuestCastMember]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(guestCast),
      })

      const result = await getEpisodeGuestCast(4952)

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/episodes/4952/guestcast")
      expect(result).toHaveLength(1)
      expect(result[0].person.name).toBe("Guest Star")
    })
  })

  describe("getEpisode", () => {
    it("returns episode by TVmaze episode ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockEpisode),
      })

      const result = await getEpisode(4952)

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/episodes/4952")
      expect(result).toEqual(mockEpisode)
    })
  })

  describe("getPerson", () => {
    it("returns person by TVmaze person ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockPerson),
      })

      const result = await getPerson(14075)

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/people/14075")
      expect(result).toEqual(mockPerson)
    })

    it("returns null when person not found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await getPerson(999999)

      expect(result).toBeNull()
    })
  })

  describe("findShowByName", () => {
    it("returns singlesearch result when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await findShowByName("Game of Thrones")

      expect(result).toEqual(mockShow)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it("falls back to multi-search when singlesearch returns 404", async () => {
      // First call: singlesearch returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      // Second call: multi-search returns results
      const mockResults: TVmazeSearchResult[] = [{ score: 0.9, show: mockShow }]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResults),
      })

      const result = await findShowByName("Game of Thrones")

      expect(result).toEqual(mockShow)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it("finds exact title match in multi-search results", async () => {
      // singlesearch returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      // multi-search returns multiple results
      const mockResults: TVmazeSearchResult[] = [
        { score: 0.9, show: { ...mockShow, id: 100, name: "Game of Thrones: Documentary" } },
        { score: 0.8, show: mockShow }, // Exact match but lower score
      ]
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResults),
      })

      const result = await findShowByName("Game of Thrones")

      expect(result?.name).toBe("Game of Thrones") // Exact match preferred
    })

    it("returns null when no results found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      const result = await findShowByName("Completely Unknown Show")

      expect(result).toBeNull()
    })
  })

  describe("findShow", () => {
    it("finds show by TheTVDB ID first", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await findShow({
        name: "Game of Thrones",
        thetvdbId: 121361,
        imdbId: "tt0944947",
      })

      expect(mockFetch).toHaveBeenCalledWith("https://api.tvmaze.com/lookup/shows?thetvdb=121361")
      expect(result).toEqual(mockShow)
    })

    it("falls back to IMDb ID when TheTVDB lookup fails", async () => {
      // TheTVDB lookup returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      // IMDb lookup succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await findShow({
        name: "Game of Thrones",
        thetvdbId: 121361,
        imdbId: "tt0944947",
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenLastCalledWith(
        "https://api.tvmaze.com/lookup/shows?imdb=tt0944947"
      )
      expect(result).toEqual(mockShow)
    })

    it("falls back to name search when external ID lookups fail", async () => {
      // TheTVDB lookup returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      // IMDb lookup returns 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      })

      // Name search succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await findShow({
        name: "Game of Thrones",
        thetvdbId: 121361,
        imdbId: "tt0944947",
      })

      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(result).toEqual(mockShow)
    })

    it("skips null external IDs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockShow),
      })

      const result = await findShow({
        name: "Game of Thrones",
        thetvdbId: null,
        imdbId: null,
      })

      // Should go directly to name search
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.tvmaze.com/singlesearch/shows?q=Game%20of%20Thrones"
      )
      expect(result).toEqual(mockShow)
    })
  })

  describe("Error Handling", () => {
    it("propagates network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"))

      await expect(getShow(82)).rejects.toThrow("Network error")
    })

    it("throws on rate limit exceeded (429)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      })

      await expect(getShow(82)).rejects.toThrow("TVmaze API error: 429 Too Many Requests")
    })
  })
})
