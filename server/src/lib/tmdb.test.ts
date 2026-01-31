import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// We need to mock fetch before importing the module
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Import after mocking
import {
  getPersonChanges,
  getMovieChanges,
  getAllChangedPersonIds,
  getAllChangedMovieIds,
  getMovieAlternativeTitles,
  getMovieDetails,
} from "./tmdb.js"

describe("TMDB Changes API", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Set the required environment variable
    process.env.TMDB_API_TOKEN = "test-token"
    // Mock console to keep test output clean
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.TMDB_API_TOKEN
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe("getPersonChanges", () => {
    it("fetches person changes with correct parameters", async () => {
      const mockResponse = {
        results: [{ id: 123, adult: false }],
        page: 1,
        total_pages: 1,
        total_results: 1,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await getPersonChanges("2024-01-01", "2024-01-14", 1)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.themoviedb.org/3/person/changes?start_date=2024-01-01&end_date=2024-01-14&page=1",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it("throws error when API returns non-OK status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Invalid API key"),
      })

      await expect(getPersonChanges("2024-01-01", "2024-01-14")).rejects.toThrow(
        "TMDB API error: 401 Unauthorized"
      )
    })
  })

  describe("getMovieChanges", () => {
    it("fetches movie changes with correct parameters", async () => {
      const mockResponse = {
        results: [{ id: 456, adult: false }],
        page: 1,
        total_pages: 1,
        total_results: 1,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await getMovieChanges("2024-01-01", "2024-01-14", 2)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.themoviedb.org/3/movie/changes?start_date=2024-01-01&end_date=2024-01-14&page=2",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
    })
  })

  describe("getAllChangedPersonIds", () => {
    it("returns all IDs from a single page", async () => {
      const mockResponse = {
        results: [
          { id: 1, adult: false },
          { id: 2, adult: false },
          { id: 3, adult: false },
        ],
        page: 1,
        total_pages: 1,
        total_results: 3,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await getAllChangedPersonIds("2024-01-01", "2024-01-14", 0)

      expect(result).toEqual([1, 2, 3])
    })

    it("paginates through multiple pages", async () => {
      const page1Response = {
        results: [
          { id: 1, adult: false },
          { id: 2, adult: false },
        ],
        page: 1,
        total_pages: 2,
        total_results: 4,
      }

      const page2Response = {
        results: [
          { id: 3, adult: false },
          { id: 4, adult: false },
        ],
        page: 2,
        total_pages: 2,
        total_results: 4,
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page2Response),
        })

      const result = await getAllChangedPersonIds("2024-01-01", "2024-01-14", 0)

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result).toEqual([1, 2, 3, 4])
    })

    it("handles empty results", async () => {
      const mockResponse = {
        results: [],
        page: 1,
        total_pages: 0,
        total_results: 0,
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await getAllChangedPersonIds("2024-01-01", "2024-01-14", 0)

      expect(result).toEqual([])
    })

    it("stops at page 500 limit when total_pages exceeds 500", async () => {
      // Mock 500 pages of results, but claim there are 600 total pages
      const mockPage = (page: number) => ({
        results: [{ id: page, adult: false }],
        page,
        total_pages: 600,
        total_results: 12000,
      })

      // Mock pages 1-500
      for (let i = 1; i <= 500; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage(i)),
        })
      }

      const result = await getAllChangedPersonIds("2024-01-01", "2024-01-14", 0)

      // Should have fetched exactly 500 pages, not 600
      expect(mockFetch).toHaveBeenCalledTimes(500)
      expect(result).toHaveLength(500)
      expect(result[0]).toBe(1)
      expect(result[499]).toBe(500)
    })
  })

  describe("getAllChangedMovieIds", () => {
    it("returns all IDs from multiple pages", async () => {
      const page1Response = {
        results: [{ id: 100, adult: false }],
        page: 1,
        total_pages: 2,
        total_results: 2,
      }

      const page2Response = {
        results: [{ id: 200, adult: false }],
        page: 2,
        total_pages: 2,
        total_results: 2,
      }

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page1Response),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(page2Response),
        })

      const result = await getAllChangedMovieIds("2024-01-01", "2024-01-14", 0)

      expect(result).toEqual([100, 200])
    })

    it("stops at page 500 limit when total_pages exceeds 500", async () => {
      // Mock pages with total_pages > 500
      const mockPage = (page: number) => ({
        results: [{ id: page + 1000, adult: false }],
        page,
        total_pages: 700,
        total_results: 14000,
      })

      // Mock pages 1-500
      for (let i = 1; i <= 500; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockPage(i)),
        })
      }

      const result = await getAllChangedMovieIds("2024-01-01", "2024-01-14", 0)

      // Should have fetched exactly 500 pages, not 700
      expect(mockFetch).toHaveBeenCalledTimes(500)
      expect(result).toHaveLength(500)
      expect(result[0]).toBe(1001)
      expect(result[499]).toBe(1500)
    })
  })
})

describe("TMDB Changes API - Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TMDB_API_TOKEN = "test-token"
  })

  afterEach(() => {
    delete process.env.TMDB_API_TOKEN
  })

  it("throws when TMDB_API_TOKEN is not set", async () => {
    delete process.env.TMDB_API_TOKEN

    await expect(getPersonChanges("2024-01-01", "2024-01-14")).rejects.toThrow(
      "TMDB_API_TOKEN environment variable is not set"
    )
  })

  it("propagates network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    await expect(getPersonChanges("2024-01-01", "2024-01-14")).rejects.toThrow("Network error")
  })
})

describe("TMDB Movie Alternative Titles", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TMDB_API_TOKEN = "test-token"
  })

  afterEach(() => {
    delete process.env.TMDB_API_TOKEN
  })

  describe("getMovieAlternativeTitles", () => {
    it("fetches alternative titles with correct URL", async () => {
      const mockResponse = {
        id: 550,
        titles: [
          { iso_3166_1: "FR", title: "Le Club de la bagarre", type: "" },
          { iso_3166_1: "DE", title: "Fight Club", type: "" },
        ],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await getMovieAlternativeTitles(550)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.themoviedb.org/3/movie/550/alternative_titles",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      )
      expect(result).toEqual(mockResponse)
      expect(result.titles).toHaveLength(2)
    })
  })

  describe("getMovieDetails with original_title", () => {
    it("returns movie details including original_title", async () => {
      const mockResponse = {
        id: 550,
        title: "Fight Club",
        original_title: "Fight Club",
        release_date: "1999-10-15",
        poster_path: "/poster.jpg",
        overview: "A movie about fighting.",
        runtime: 139,
        genres: [{ id: 18, name: "Drama" }],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await getMovieDetails(550)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.themoviedb.org/3/movie/550?language=en-US",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      )
      expect(result.original_title).toBe("Fight Club")
      expect(result.title).toBe("Fight Club")
    })

    it("returns different original_title for foreign films", async () => {
      const mockResponse = {
        id: 123,
        title: "Seven Samurai",
        original_title: "七人の侍",
        release_date: "1954-04-26",
        poster_path: "/poster.jpg",
        overview: "A classic samurai film.",
        runtime: 207,
        genres: [{ id: 28, name: "Action" }],
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })

      const result = await getMovieDetails(123)

      expect(result.title).toBe("Seven Samurai")
      expect(result.original_title).toBe("七人の侍")
    })
  })
})
