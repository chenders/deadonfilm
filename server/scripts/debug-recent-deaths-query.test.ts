import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Pool } from "pg"

// Mock the dependencies
vi.mock("../src/lib/db.js", () => ({
  getPool: vi.fn(),
}))

vi.mock("../src/lib/db/deaths-discovery.js", () => ({
  getRecentDeaths: vi.fn(),
}))

import { getPool } from "../src/lib/db.js"
import { getRecentDeaths } from "../src/lib/db/deaths-discovery.js"

describe("debug-recent-deaths-query script", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("successfully runs queries and displays results", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    // Mock database results
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 123, name: "Actor One", deathday: "2024-01-15", is_obscure: false },
          { id: 2, tmdb_id: 456, name: "Actor Two", deathday: "2024-01-14", is_obscure: true },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ movie_count: 5, episode_count: 20 }],
      })
      .mockResolvedValueOnce({
        rows: [{ movie_count: 1, episode_count: 5 }],
      })

    vi.mocked(getRecentDeaths).mockResolvedValue([
      { id: 1, tmdb_id: 123, name: "Actor One", deathday: "2024-01-15" },
    ] as any)

    const { default: main } = await import("./debug-recent-deaths-query.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(getPool).toHaveBeenCalledOnce()
    expect(mockQuery).toHaveBeenCalledTimes(3) // Initial query + 2 appearance count queries
    expect(getRecentDeaths).toHaveBeenCalledWith(10)
    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("correctly identifies actors meeting appearance threshold", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 123, name: "Actor One", deathday: "2024-01-15", is_obscure: false },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ movie_count: 2, episode_count: 0 }], // Meets threshold with movies
      })

    vi.mocked(getRecentDeaths).mockResolvedValue([])

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./debug-recent-deaths-query.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✅ MEETS"))

    consoleLogSpy.mockRestore()
  })

  it("correctly identifies actors below appearance threshold", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 123, name: "Actor One", deathday: "2024-01-15", is_obscure: false },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ movie_count: 1, episode_count: 5 }], // Below threshold
      })

    vi.mocked(getRecentDeaths).mockResolvedValue([])

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./debug-recent-deaths-query.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("❌ BELOW"))

    consoleLogSpy.mockRestore()
  })

  it("calls db.end in finally block on success", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery.mockResolvedValue({ rows: [] })
    vi.mocked(getRecentDeaths).mockResolvedValue([])

    const { default: main } = await import("./debug-recent-deaths-query.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("calls db.end in finally block even on error", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery.mockRejectedValue(new Error("Database error"))

    const { default: main } = await import("./debug-recent-deaths-query.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("Database error")

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("handles empty result sets", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery.mockResolvedValue({ rows: [] })
    vi.mocked(getRecentDeaths).mockResolvedValue([])

    const { default: main } = await import("./debug-recent-deaths-query.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("uses correct appearance count threshold (2 movies OR 10 episodes)", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 123, name: "Actor One", deathday: "2024-01-15", is_obscure: false },
          { id: 2, tmdb_id: 456, name: "Actor Two", deathday: "2024-01-14", is_obscure: false },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ movie_count: 0, episode_count: 10 }], // Meets threshold with episodes
      })
      .mockResolvedValueOnce({
        rows: [{ movie_count: 2, episode_count: 0 }], // Meets threshold with movies
      })

    vi.mocked(getRecentDeaths).mockResolvedValue([])

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./debug-recent-deaths-query.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    // Both should meet threshold
    const calls = consoleLogSpy.mock.calls.map((call) => call.join(" "))
    const meetsCount = calls.filter((call) => call.includes("✅ MEETS")).length
    expect(meetsCount).toBe(2)

    consoleLogSpy.mockRestore()
  })
})
