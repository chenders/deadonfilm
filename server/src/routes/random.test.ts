import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { getRandomMovie } from "./random.js"

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

describe("getRandomMovie", () => {
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let jsonSpy: ReturnType<typeof vi.fn>
  let statusSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TMDB_API_TOKEN = "test-token"

    jsonSpy = vi.fn()
    statusSpy = vi.fn().mockReturnThis()

    mockReq = {}
    mockRes = {
      json: jsonSpy as Response["json"],
      status: statusSpy as Response["status"],
    }
  })

  it("returns a random movie when TMDB returns results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: 123,
              title: "Test Movie",
              release_date: "1995-06-15",
            },
          ],
        }),
    })

    await getRandomMovie(mockReq as Request, mockRes as Response)

    expect(jsonSpy).toHaveBeenCalledWith({
      id: 123,
      title: "Test Movie",
      release_date: "1995-06-15",
    })
  })

  it("returns 404 when no movies found after retries", async () => {
    // Return empty results 3 times (all retry attempts)
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [],
        }),
    })

    await getRandomMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(404)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "No random movie found" },
    })
  })

  it("returns 500 when TMDB API fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await getRandomMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch random movie" },
    })
  })

  it("returns 500 when network error occurs", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"))

    await getRandomMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch random movie" },
    })
  })

  it("throws error when TMDB_API_TOKEN is not set", async () => {
    delete process.env.TMDB_API_TOKEN

    await getRandomMovie(mockReq as Request, mockRes as Response)

    expect(statusSpy).toHaveBeenCalledWith(500)
    expect(jsonSpy).toHaveBeenCalledWith({
      error: { message: "Failed to fetch random movie" },
    })
  })

  it("retries and succeeds on second attempt when first returns empty", async () => {
    // First call returns empty, second call returns a movie
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: 456,
                title: "Second Try Movie",
                release_date: "2000-01-01",
              },
            ],
          }),
      })

    await getRandomMovie(mockReq as Request, mockRes as Response)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(jsonSpy).toHaveBeenCalledWith({
      id: 456,
      title: "Second Try Movie",
      release_date: "2000-01-01",
    })
  })
})
