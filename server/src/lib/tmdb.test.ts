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
  searchTVShows,
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

describe("searchTVShows", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TMDB_API_TOKEN = "test-token"
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    delete process.env.TMDB_API_TOKEN
    consoleErrorSpy.mockRestore()
  })

  const makePage = (
    shows: Array<{ id: number; original_language: string; origin_country: string[] }>
  ) => ({
    page: 1,
    results: shows.map((s) => ({
      id: s.id,
      name: `Show ${s.id}`,
      overview: "",
      first_air_date: "2000-01-01",
      poster_path: null,
      backdrop_path: null,
      genre_ids: [],
      popularity: 50,
      origin_country: s.origin_country,
      original_language: s.original_language,
    })),
    total_pages: 1,
    total_results: shows.length,
  })

  it("includes non-US English-language shows", async () => {
    const page = makePage([
      { id: 815, original_language: "en", origin_country: ["GB"] },
      { id: 1400, original_language: "en", origin_country: ["US"] },
    ])
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(page) })

    const result = await searchTVShows("test")

    const ids = result.results.map((s) => s.id)
    expect(ids).toContain(815)
    expect(ids).toContain(1400)
  })

  it("excludes non-English shows", async () => {
    const page = makePage([
      { id: 1, original_language: "en", origin_country: ["GB"] },
      { id: 2, original_language: "de", origin_country: ["DE"] },
      { id: 3, original_language: "ja", origin_country: ["JP"] },
    ])
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(page) })

    const result = await searchTVShows("test")

    expect(result.results).toHaveLength(1)
    expect(result.results[0].id).toBe(1)
  })

  it("deduplicates shows across pages", async () => {
    const page1 = makePage([
      { id: 100, original_language: "en", origin_country: ["US"] },
      { id: 200, original_language: "en", origin_country: ["GB"] },
    ])
    const page2 = makePage([
      { id: 200, original_language: "en", origin_country: ["GB"] },
      { id: 300, original_language: "en", origin_country: ["AU"] },
    ])
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page1) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(page2) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(makePage([])) })

    const result = await searchTVShows("test")

    const ids = result.results.map((s) => s.id)
    expect(ids).toEqual([100, 200, 300])
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
