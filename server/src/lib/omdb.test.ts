import { describe, it, expect, vi, beforeEach } from "vitest"
import { getOMDbRatings } from "./omdb.js"
import type { OMDbResponse } from "./omdb.js"

// Mock fetch globally
global.fetch = vi.fn()

describe("OMDb API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set API key for tests
    process.env.OMDB_API_KEY = "test-api-key"
  })

  describe("getOMDbRatings", () => {
    it("successfully fetches complete ratings data", async () => {
      const mockResponse: OMDbResponse = {
        Title: "The Shawshank Redemption",
        Year: "1994",
        Rated: "R",
        Released: "14 Oct 1994",
        Runtime: "142 min",
        Genre: "Drama",
        Director: "Frank Darabont",
        Writer: "Stephen King, Frank Darabont",
        Actors: "Tim Robbins, Morgan Freeman, Bob Gunton",
        Plot: "Two imprisoned men bond over a number of years...",
        Language: "English",
        Country: "United States",
        Awards: "Nominated for 7 Oscars",
        Poster: "https://example.com/poster.jpg",
        Ratings: [
          { Source: "Internet Movie Database", Value: "9.3/10" },
          { Source: "Rotten Tomatoes", Value: "91%" },
          { Source: "Metacritic", Value: "82/100" },
        ],
        Metascore: "82",
        imdbRating: "9.3",
        imdbVotes: "2,800,000",
        imdbID: "tt0111161",
        Type: "movie",
        DVD: "N/A",
        BoxOffice: "$28,767,189",
        Production: "N/A",
        Website: "N/A",
        Response: "True",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getOMDbRatings("tt0111161")

      expect(result).toEqual({
        imdbRating: 9.3,
        imdbVotes: 2800000,
        rottenTomatoesScore: 91,
        rottenTomatoesAudience: null,
        metacriticScore: 82,
      })

      expect(fetch).toHaveBeenCalledWith(
        "http://www.omdbapi.com/?apikey=test-api-key&i=tt0111161",
      )
    })

    it("handles comma-formatted vote counts", async () => {
      const mockResponse: OMDbResponse = {
        Title: "Test Movie",
        Year: "2020",
        Rated: "PG",
        Released: "01 Jan 2020",
        Runtime: "120 min",
        Genre: "Drama",
        Director: "Test Director",
        Writer: "Test Writer",
        Actors: "Actor One, Actor Two",
        Plot: "A test plot",
        Language: "English",
        Country: "USA",
        Awards: "None",
        Poster: "N/A",
        Ratings: [],
        Metascore: "N/A",
        imdbRating: "7.5",
        imdbVotes: "1,234,567",
        imdbID: "tt1234567",
        Type: "movie",
        DVD: "N/A",
        BoxOffice: "N/A",
        Production: "N/A",
        Website: "N/A",
        Response: "True",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getOMDbRatings("tt1234567")

      expect(result?.imdbVotes).toBe(1234567)
    })

    it("handles missing ratings gracefully", async () => {
      const mockResponse: OMDbResponse = {
        Title: "Obscure Movie",
        Year: "2010",
        Rated: "N/A",
        Released: "N/A",
        Runtime: "N/A",
        Genre: "N/A",
        Director: "N/A",
        Writer: "N/A",
        Actors: "N/A",
        Plot: "N/A",
        Language: "English",
        Country: "USA",
        Awards: "N/A",
        Poster: "N/A",
        Ratings: [],
        Metascore: "N/A",
        imdbRating: "N/A",
        imdbVotes: "N/A",
        imdbID: "tt9999999",
        Type: "movie",
        DVD: "N/A",
        BoxOffice: "N/A",
        Production: "N/A",
        Website: "N/A",
        Response: "True",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getOMDbRatings("tt9999999")

      expect(result).toEqual({
        imdbRating: null,
        imdbVotes: null,
        rottenTomatoesScore: null,
        rottenTomatoesAudience: null,
        metacriticScore: null,
      })
    })

    it("returns null for invalid IMDb ID", async () => {
      const mockResponse: OMDbResponse = {
        Response: "False",
        Error: "Incorrect IMDb ID.",
        Title: "",
        Year: "",
        Rated: "",
        Released: "",
        Runtime: "",
        Genre: "",
        Director: "",
        Writer: "",
        Actors: "",
        Plot: "",
        Language: "",
        Country: "",
        Awards: "",
        Poster: "",
        Ratings: [],
        Metascore: "",
        imdbRating: "",
        imdbVotes: "",
        imdbID: "",
        Type: "",
        DVD: "",
        BoxOffice: "",
        Production: "",
        Website: "",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getOMDbRatings("tt0000000")

      expect(result).toBeNull()
    })

    it("returns null for malformed IMDb ID", async () => {
      const result = await getOMDbRatings("invalid-id")
      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })

    it("handles Rotten Tomatoes with audience score", async () => {
      const mockResponse: OMDbResponse = {
        Title: "Test Movie",
        Year: "2020",
        Rated: "PG",
        Released: "01 Jan 2020",
        Runtime: "120 min",
        Genre: "Drama",
        Director: "Test Director",
        Writer: "Test Writer",
        Actors: "Actor One",
        Plot: "Test",
        Language: "English",
        Country: "USA",
        Awards: "None",
        Poster: "N/A",
        Ratings: [
          { Source: "Rotten Tomatoes", Value: "85%/92%" }, // Critics/Audience
        ],
        Metascore: "N/A",
        imdbRating: "7.5",
        imdbVotes: "100,000",
        imdbID: "tt1111111",
        Type: "movie",
        DVD: "N/A",
        BoxOffice: "N/A",
        Production: "N/A",
        Website: "N/A",
        Response: "True",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getOMDbRatings("tt1111111")

      expect(result?.rottenTomatoesScore).toBe(85)
      expect(result?.rottenTomatoesAudience).toBe(92)
    })

    it("throws error when API key is not set", async () => {
      delete process.env.OMDB_API_KEY

      await expect(getOMDbRatings("tt0111161")).rejects.toThrow(
        "OMDB_API_KEY environment variable not set",
      )
    })

    it("returns null on API error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      const result = await getOMDbRatings("tt0111161")

      expect(result).toBeNull()
    })

    it("returns null on network error", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"))

      const result = await getOMDbRatings("tt0111161")

      expect(result).toBeNull()
    })

    it("allows custom API key parameter", async () => {
      const mockResponse: OMDbResponse = {
        Title: "Test",
        Year: "2020",
        Rated: "PG",
        Released: "01 Jan 2020",
        Runtime: "120 min",
        Genre: "Drama",
        Director: "Test",
        Writer: "Test",
        Actors: "Test",
        Plot: "Test",
        Language: "English",
        Country: "USA",
        Awards: "None",
        Poster: "N/A",
        Ratings: [],
        Metascore: "N/A",
        imdbRating: "7.0",
        imdbVotes: "1,000",
        imdbID: "tt0000001",
        Type: "movie",
        DVD: "N/A",
        BoxOffice: "N/A",
        Production: "N/A",
        Website: "N/A",
        Response: "True",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      await getOMDbRatings("tt0000001", "custom-key")

      expect(fetch).toHaveBeenCalledWith(
        "http://www.omdbapi.com/?apikey=custom-key&i=tt0000001",
      )
    })
  })
})
