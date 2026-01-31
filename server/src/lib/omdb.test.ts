import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getOMDbRatings,
  parseBoxOffice,
  parseAwards,
  parseTotalSeasons,
  searchOMDbByTitle,
  searchOMDb,
} from "./omdb.js"
import type { OMDbResponse, OMDbSearchResponse } from "./omdb.js"

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
        boxOfficeCents: 2876718900,
        awardsWins: null,
        awardsNominations: null,
        totalSeasons: null,
      })

      expect(fetch).toHaveBeenCalledWith("https://www.omdbapi.com/?apikey=test-api-key&i=tt0111161")
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
        boxOfficeCents: null,
        awardsWins: null,
        awardsNominations: null,
        totalSeasons: null,
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
        "OMDB_API_KEY environment variable not set"
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

      expect(fetch).toHaveBeenCalledWith("https://www.omdbapi.com/?apikey=custom-key&i=tt0000001")
    })

    it("includes extended metrics for movies", async () => {
      const mockResponse: OMDbResponse = {
        Title: "Award Winning Movie",
        Year: "2020",
        Rated: "PG-13",
        Released: "01 Jan 2020",
        Runtime: "150 min",
        Genre: "Drama",
        Director: "Test",
        Writer: "Test",
        Actors: "Test",
        Plot: "Test",
        Language: "English",
        Country: "USA",
        Awards: "Won 7 Oscars. 90 wins & 100 nominations",
        Poster: "N/A",
        Ratings: [],
        Metascore: "N/A",
        imdbRating: "8.5",
        imdbVotes: "500,000",
        imdbID: "tt2222222",
        Type: "movie",
        DVD: "N/A",
        BoxOffice: "$150,000,000",
        Production: "N/A",
        Website: "N/A",
        Response: "True",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getOMDbRatings("tt2222222")

      expect(result?.boxOfficeCents).toBe(15000000000)
      expect(result?.awardsWins).toBe(90)
      expect(result?.awardsNominations).toBe(100)
      expect(result?.totalSeasons).toBeNull()
    })

    it("includes extended metrics for TV series", async () => {
      const mockResponse: OMDbResponse = {
        Title: "Award Winning Series",
        Year: "2015-2023",
        Rated: "TV-MA",
        Released: "01 Jan 2015",
        Runtime: "60 min",
        Genre: "Drama",
        Director: "N/A",
        Writer: "Test",
        Actors: "Test",
        Plot: "Test",
        Language: "English",
        Country: "USA",
        Awards: "Won 3 Emmys. 45 wins & 200 nominations",
        Poster: "N/A",
        Ratings: [],
        Metascore: "N/A",
        imdbRating: "8.8",
        imdbVotes: "1,000,000",
        imdbID: "tt3333333",
        Type: "series",
        DVD: "N/A",
        BoxOffice: "N/A",
        Production: "N/A",
        Website: "N/A",
        totalSeasons: "8",
        Response: "True",
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await getOMDbRatings("tt3333333")

      expect(result?.boxOfficeCents).toBeNull()
      expect(result?.awardsWins).toBe(45)
      expect(result?.awardsNominations).toBe(200)
      expect(result?.totalSeasons).toBe(8)
    })
  })
})

describe("parseBoxOffice", () => {
  it("parses valid box office values to cents", () => {
    expect(parseBoxOffice("$58,300,000")).toBe(5830000000)
    expect(parseBoxOffice("$1,000,000")).toBe(100000000)
    expect(parseBoxOffice("$100")).toBe(10000)
    expect(parseBoxOffice("$0")).toBe(0)
  })

  it("handles values without commas", () => {
    expect(parseBoxOffice("$1000000")).toBe(100000000)
    expect(parseBoxOffice("$500")).toBe(50000)
  })

  it("returns null for N/A", () => {
    expect(parseBoxOffice("N/A")).toBeNull()
  })

  it("returns null for empty or undefined values", () => {
    expect(parseBoxOffice("")).toBeNull()
    expect(parseBoxOffice(null as unknown as string)).toBeNull()
    expect(parseBoxOffice(undefined as unknown as string)).toBeNull()
  })

  it("returns null for invalid formats", () => {
    expect(parseBoxOffice("unknown")).toBeNull()
    expect(parseBoxOffice("abc")).toBeNull()
    expect(parseBoxOffice("$-100")).toBeNull()
  })

  it("returns null for partial-parse cases like $100M", () => {
    // These would previously parse as 100 cents due to parseInt partial parsing
    expect(parseBoxOffice("$100M")).toBeNull()
    expect(parseBoxOffice("$50 million")).toBeNull()
    expect(parseBoxOffice("$1.5B")).toBeNull()
  })
})

describe("parseAwards", () => {
  it("parses full awards string with wins and nominations", () => {
    expect(parseAwards("Won 7 Oscars. 90 wins & 100 nominations")).toEqual({
      wins: 90,
      nominations: 100,
    })
  })

  it("parses Emmy awards format", () => {
    expect(parseAwards("Won 2 Emmys. 45 wins & 200 nominations total")).toEqual({
      wins: 45,
      nominations: 200,
    })
  })

  it("parses simple wins and nominations format", () => {
    expect(parseAwards("1 win & 2 nominations")).toEqual({
      wins: 1,
      nominations: 2,
    })
  })

  it("parses singular forms", () => {
    expect(parseAwards("1 win & 1 nomination")).toEqual({
      wins: 1,
      nominations: 1,
    })
  })

  it("parses wins only", () => {
    expect(parseAwards("10 wins")).toEqual({
      wins: 10,
      nominations: null,
    })
  })

  it("parses nominations only", () => {
    expect(parseAwards("5 nominations")).toEqual({
      wins: null,
      nominations: 5,
    })
  })

  it("returns nulls for N/A", () => {
    expect(parseAwards("N/A")).toEqual({
      wins: null,
      nominations: null,
    })
  })

  it("returns nulls for empty values", () => {
    expect(parseAwards("")).toEqual({
      wins: null,
      nominations: null,
    })
    expect(parseAwards(null as unknown as string)).toEqual({
      wins: null,
      nominations: null,
    })
  })

  it("handles case variations", () => {
    expect(parseAwards("50 WINS & 100 NOMINATIONS")).toEqual({
      wins: 50,
      nominations: 100,
    })
    expect(parseAwards("50 Wins & 100 Nominations")).toEqual({
      wins: 50,
      nominations: 100,
    })
  })

  it("handles complex award strings", () => {
    // Real example from OMDB
    expect(parseAwards("Won 6 Oscars. Another 80 wins & 123 nominations.")).toEqual({
      wins: 80,
      nominations: 123,
    })
  })
})

describe("parseTotalSeasons", () => {
  it("parses valid season counts", () => {
    expect(parseTotalSeasons("8")).toBe(8)
    expect(parseTotalSeasons("1")).toBe(1)
    expect(parseTotalSeasons("25")).toBe(25)
  })

  it("returns null for N/A", () => {
    expect(parseTotalSeasons("N/A")).toBeNull()
  })

  it("returns null for empty values", () => {
    expect(parseTotalSeasons("")).toBeNull()
    expect(parseTotalSeasons(null as unknown as string)).toBeNull()
    expect(parseTotalSeasons(undefined as unknown as string)).toBeNull()
  })

  it("returns null for invalid values", () => {
    expect(parseTotalSeasons("abc")).toBeNull()
    expect(parseTotalSeasons("-1")).toBeNull()
  })

  it("returns null for partial-parse cases", () => {
    // These would previously parse as numbers due to parseInt partial parsing
    expect(parseTotalSeasons("8 seasons")).toBeNull()
    expect(parseTotalSeasons("10+")).toBeNull()
    expect(parseTotalSeasons("5-6")).toBeNull()
  })

  it("handles zero seasons", () => {
    expect(parseTotalSeasons("0")).toBe(0)
  })

  it("handles whitespace around valid numbers", () => {
    expect(parseTotalSeasons(" 8 ")).toBe(8)
    expect(parseTotalSeasons("  12  ")).toBe(12)
  })
})

describe("searchOMDbByTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OMDB_API_KEY = "test-api-key"
  })

  it("successfully finds movie by exact title", async () => {
    const mockResponse: OMDbResponse = {
      Title: "The Matrix",
      Year: "1999",
      Rated: "R",
      Released: "31 Mar 1999",
      Runtime: "136 min",
      Genre: "Action, Sci-Fi",
      Director: "The Wachowskis",
      Writer: "The Wachowskis",
      Actors: "Keanu Reeves, Laurence Fishburne",
      Plot: "A computer hacker learns about the true nature of reality.",
      Language: "English",
      Country: "USA",
      Awards: "Won 4 Oscars",
      Poster: "https://example.com/poster.jpg",
      Ratings: [],
      Metascore: "73",
      imdbRating: "8.7",
      imdbVotes: "2,000,000",
      imdbID: "tt0133093",
      Type: "movie",
      DVD: "N/A",
      BoxOffice: "$171,479,930",
      Production: "N/A",
      Website: "N/A",
      Response: "True",
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const result = await searchOMDbByTitle("The Matrix", 1999)

    expect(result).toEqual({
      Title: "The Matrix",
      Year: "1999",
      imdbID: "tt0133093",
      Type: "movie",
      Poster: "https://example.com/poster.jpg",
    })

    expect(fetch).toHaveBeenCalledWith(
      "https://www.omdbapi.com/?apikey=test-api-key&t=The+Matrix&type=movie&y=1999"
    )
  })

  it("returns null when movie not found", async () => {
    const mockResponse: OMDbResponse = {
      Response: "False",
      Error: "Movie not found!",
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

    const result = await searchOMDbByTitle("Nonexistent Movie 12345")

    expect(result).toBeNull()
  })

  it("works without year parameter", async () => {
    const mockResponse: OMDbResponse = {
      Title: "Crash",
      Year: "2004",
      Rated: "R",
      Released: "06 May 2005",
      Runtime: "112 min",
      Genre: "Crime, Drama",
      Director: "Paul Haggis",
      Writer: "Paul Haggis, Bobby Moresco",
      Actors: "Sandra Bullock, Don Cheadle",
      Plot: "Los Angeles citizens with interrelated lives.",
      Language: "English",
      Country: "USA",
      Awards: "Won 3 Oscars",
      Poster: "https://example.com/poster.jpg",
      Ratings: [],
      Metascore: "69",
      imdbRating: "7.7",
      imdbVotes: "450,000",
      imdbID: "tt0375679",
      Type: "movie",
      DVD: "N/A",
      BoxOffice: "$54,580,300",
      Production: "N/A",
      Website: "N/A",
      Response: "True",
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await searchOMDbByTitle("Crash")

    expect(fetch).toHaveBeenCalledWith(
      "https://www.omdbapi.com/?apikey=test-api-key&t=Crash&type=movie"
    )
  })

  it("throws error when API key is not set", async () => {
    delete process.env.OMDB_API_KEY

    await expect(searchOMDbByTitle("The Matrix")).rejects.toThrow(
      "OMDB_API_KEY environment variable not set"
    )
  })

  it("returns null on API error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const result = await searchOMDbByTitle("The Matrix")

    expect(result).toBeNull()
  })
})

describe("searchOMDb", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OMDB_API_KEY = "test-api-key"
  })

  it("successfully returns multiple search results", async () => {
    const mockResponse: OMDbSearchResponse = {
      Search: [
        { Title: "Crash", Year: "2004", imdbID: "tt0375679", Type: "movie", Poster: "N/A" },
        { Title: "Crash", Year: "1996", imdbID: "tt0115964", Type: "movie", Poster: "N/A" },
        { Title: "Crash", Year: "2019-", imdbID: "tt8802966", Type: "series", Poster: "N/A" },
      ],
      totalResults: "42",
      Response: "True",
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const results = await searchOMDb("Crash")

    expect(results).toHaveLength(3)
    expect(results[0].imdbID).toBe("tt0375679")
    expect(results[1].imdbID).toBe("tt0115964")
  })

  it("returns empty array when no results found", async () => {
    const mockResponse: OMDbSearchResponse = {
      Response: "False",
      Error: "Movie not found!",
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const results = await searchOMDb("Nonexistent Movie 12345")

    expect(results).toEqual([])
  })

  it("includes year parameter when provided", async () => {
    const mockResponse: OMDbSearchResponse = {
      Search: [{ Title: "Crash", Year: "2004", imdbID: "tt0375679", Type: "movie", Poster: "N/A" }],
      totalResults: "1",
      Response: "True",
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await searchOMDb("Crash", 2004)

    expect(fetch).toHaveBeenCalledWith(
      "https://www.omdbapi.com/?apikey=test-api-key&s=Crash&type=movie&y=2004"
    )
  })

  it("supports series type", async () => {
    const mockResponse: OMDbSearchResponse = {
      Search: [
        {
          Title: "Breaking Bad",
          Year: "2008-2013",
          imdbID: "tt0903747",
          Type: "series",
          Poster: "N/A",
        },
      ],
      totalResults: "1",
      Response: "True",
    }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    await searchOMDb("Breaking Bad", undefined, "series")

    expect(fetch).toHaveBeenCalledWith(
      "https://www.omdbapi.com/?apikey=test-api-key&s=Breaking+Bad&type=series"
    )
  })

  it("throws error when API key is not set", async () => {
    delete process.env.OMDB_API_KEY

    await expect(searchOMDb("Matrix")).rejects.toThrow("OMDB_API_KEY environment variable not set")
  })

  it("returns empty array on API error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const results = await searchOMDb("Matrix")

    expect(results).toEqual([])
  })
})
