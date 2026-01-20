import { describe, it, expect, vi, beforeEach } from "vitest"
import { getTraktStats, getTrending, getTraktRating } from "./trakt.js"
import type { TraktStats, TraktTrendingItem } from "./trakt.js"

// Mock fetch globally
global.fetch = vi.fn()

describe("Trakt.tv API Client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TRAKT_API_KEY = "test-api-key"
  })

  describe("getTraktStats", () => {
    it("successfully fetches movie stats", async () => {
      const mockStats: TraktStats = {
        watchers: 123456,
        plays: 234567,
        collectors: 45678,
        votes: 12345,
        comments: 567,
        lists: 890,
        rating: 8.15432,
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockStats,
      } as Response)

      const result = await getTraktStats("movie", "tt0111161")

      expect(result).toEqual(mockStats)
      expect(fetch).toHaveBeenCalledWith(
        "https://api.trakt.tv/movies/tt0111161/stats",
        expect.objectContaining({
          headers: expect.objectContaining({
            "trakt-api-key": "test-api-key",
            "trakt-api-version": "2",
          }),
        }),
      )
    })

    it("successfully fetches show stats using TheTVDB ID", async () => {
      const mockStats: TraktStats = {
        watchers: 50000,
        plays: 100000,
        collectors: 10000,
        votes: 5000,
        comments: 100,
        lists: 200,
        rating: 7.5,
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockStats,
      } as Response)

      const result = await getTraktStats("show", "121361")

      expect(result).toEqual(mockStats)
      expect(fetch).toHaveBeenCalledWith(
        "https://api.trakt.tv/shows/121361/stats",
        expect.any(Object),
      )
    })

    it("returns null for movie with invalid IMDb ID format", async () => {
      const result = await getTraktStats("movie", "invalid-id")
      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })

    it("returns null for show with invalid TheTVDB ID format", async () => {
      const result = await getTraktStats("show", "tt0111161") // Wrong format for show
      expect(result).toBeNull()
      expect(fetch).not.toHaveBeenCalled()
    })

    it("returns null when content not found (404)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)

      const result = await getTraktStats("movie", "tt9999999")

      expect(result).toBeNull()
    })

    it("returns null on API error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      const result = await getTraktStats("movie", "tt0111161")

      expect(result).toBeNull()
    })

    it("returns null on network error", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"))

      const result = await getTraktStats("movie", "tt0111161")

      expect(result).toBeNull()
    })

    it("throws error when API key is not set", async () => {
      delete process.env.TRAKT_API_KEY

      await expect(getTraktStats("movie", "tt0111161")).rejects.toThrow(
        "TRAKT_API_KEY environment variable not set",
      )
    })

    it("allows custom API key parameter", async () => {
      const mockStats: TraktStats = {
        watchers: 1000,
        plays: 2000,
        collectors: 300,
        votes: 400,
        comments: 50,
        lists: 60,
        rating: 7.0,
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockStats,
      } as Response)

      await getTraktStats("movie", "tt0000001", "custom-key")

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "trakt-api-key": "custom-key",
          }),
        }),
      )
    })
  })

  describe("getTrending", () => {
    it("successfully fetches trending movies", async () => {
      const mockTrending: TraktTrendingItem[] = [
        {
          watchers: 500,
          movie: {
            title: "Test Movie",
            year: 2024,
            ids: {
              trakt: 123,
              slug: "test-movie-2024",
              imdb: "tt1234567",
              tmdb: 456,
            },
          },
        },
        {
          watchers: 400,
          movie: {
            title: "Another Movie",
            year: 2023,
            ids: {
              trakt: 789,
              slug: "another-movie-2023",
              imdb: "tt7654321",
              tmdb: 321,
            },
          },
        },
      ]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTrending,
      } as Response)

      const result = await getTrending("movie")

      expect(result).toEqual(mockTrending)
      expect(fetch).toHaveBeenCalledWith(
        "https://api.trakt.tv/movies/trending?limit=100",
        expect.any(Object),
      )
    })

    it("successfully fetches trending shows", async () => {
      const mockTrending: TraktTrendingItem[] = [
        {
          watchers: 1000,
          show: {
            title: "Test Show",
            year: 2024,
            ids: {
              trakt: 111,
              slug: "test-show-2024",
              imdb: "tt1111111",
              tmdb: 222,
              tvdb: 333,
            },
          },
        },
      ]

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTrending,
      } as Response)

      const result = await getTrending("show", 50)

      expect(result).toEqual(mockTrending)
      expect(fetch).toHaveBeenCalledWith(
        "https://api.trakt.tv/shows/trending?limit=50",
        expect.any(Object),
      )
    })

    it("returns empty array on error", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response)

      const result = await getTrending("movie")

      expect(result).toEqual([])
    })

    it("returns empty array on network error", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"))

      const result = await getTrending("show")

      expect(result).toEqual([])
    })
  })

  describe("getTraktRating", () => {
    it("successfully gets movie rating", async () => {
      const mockStats: TraktStats = {
        watchers: 100000,
        plays: 200000,
        collectors: 30000,
        votes: 45000,
        comments: 500,
        lists: 1000,
        rating: 8.5,
      }

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockStats,
      } as Response)

      const result = await getTraktRating("movie", "tt0111161")

      expect(result).toEqual({
        rating: 8.5,
        votes: 45000,
      })
    })

    it("returns null when stats not found", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response)

      const result = await getTraktRating("movie", "tt9999999")

      expect(result).toBeNull()
    })
  })
})
