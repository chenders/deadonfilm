import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Pool } from "pg"

// Mock the dependencies
vi.mock("../src/lib/db.js", () => ({
  getPool: vi.fn(),
}))

import { getPool } from "../src/lib/db.js"

describe("check-recent-deaths-db script", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("successfully queries for future and recent deaths", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 123, name: "Actor One", deathday: "2024-01-15" },
          { id: 2, tmdb_id: 456, name: "Actor Two", deathday: "2024-01-14" },
        ],
      })

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(getPool).toHaveBeenCalledOnce()
    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT COUNT(*) as count FROM actors WHERE deathday > CURRENT_DATE"
    )
    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("handles zero future deaths", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      })

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith("Actors with future death dates:", "0")

    consoleLogSpy.mockRestore()
  })

  it("handles multiple future deaths", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: "5" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      })

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith("Actors with future death dates:", "5")

    consoleLogSpy.mockRestore()
  })

  it("handles empty recent deaths list", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      })

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("calls db.end in finally block on success", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery.mockResolvedValueOnce({ rows: [{ count: "0" }] }).mockResolvedValueOnce({ rows: [] })

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("calls db.end in finally block even on error", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery.mockRejectedValue(new Error("Database error"))

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).rejects.toThrow("Database error")

    expect(mockEnd).toHaveBeenCalledOnce()
  })

  it("uses correct column name (deathday not death_date)", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      })

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    // Verify all queries use 'deathday' column
    const allCalls = mockQuery.mock.calls.flat()
    allCalls.forEach((call) => {
      if (typeof call === "string") {
        expect(call).not.toContain("death_date")
        if (call.includes("death")) {
          expect(call).toContain("deathday")
        }
      }
    })
  })

  it("displays recent deaths in correct format", async () => {
    const mockQuery = vi.fn()
    const mockEnd = vi.fn().mockResolvedValue(undefined)
    const mockPool = { query: mockQuery, end: mockEnd } as unknown as Pool

    vi.mocked(getPool).mockReturnValue(mockPool)

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ count: "0" }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, tmdb_id: 123, name: "Actor One", deathday: "2024-01-15" },
          { id: 2, tmdb_id: 456, name: "Actor Two", deathday: "2024-01-14" },
        ],
      })

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const { default: main } = await import("./check-recent-deaths-db.js?t=" + Date.now())

    await expect(main()).resolves.toBeUndefined()

    expect(consoleLogSpy).toHaveBeenCalledWith("\nMost recent deaths in database:")
    expect(consoleLogSpy).toHaveBeenCalledWith("  1. Actor One - 2024-01-15")
    expect(consoleLogSpy).toHaveBeenCalledWith("  2. Actor Two - 2024-01-14")

    consoleLogSpy.mockRestore()
  })
})
