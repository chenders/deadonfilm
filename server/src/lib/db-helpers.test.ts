import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getActorsIfAvailable, saveDeceasedToDb } from "./db-helpers.js"
import * as db from "./db.js"

vi.mock("./db.js", () => ({
  getActors: vi.fn(),
  batchUpsertActors: vi.fn(),
}))

describe("db-helpers", () => {
  const originalEnv = process.env.DATABASE_URL

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DATABASE_URL = "postgres://test"
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = originalEnv
    }
  })

  describe("getActorsIfAvailable", () => {
    it("returns empty map when DATABASE_URL is not set", async () => {
      delete process.env.DATABASE_URL

      const result = await getActorsIfAvailable([1, 2, 3])

      expect(result).toEqual(new Map())
      expect(db.getActors).not.toHaveBeenCalled()
    })

    it("returns actors from database when available", async () => {
      const mockActors = new Map([
        [1, { id: 1, tmdb_id: 1, name: "Actor 1" }],
        [2, { id: 2, tmdb_id: 2, name: "Actor 2" }],
      ])
      vi.mocked(db.getActors).mockResolvedValue(mockActors as never)

      const result = await getActorsIfAvailable([1, 2])

      expect(result).toEqual(mockActors)
      expect(db.getActors).toHaveBeenCalledWith([1, 2])
    })

    it("returns empty map on database error", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      vi.mocked(db.getActors).mockRejectedValue(new Error("DB connection failed"))

      const result = await getActorsIfAvailable([1, 2])

      expect(result).toEqual(new Map())
      expect(consoleSpy).toHaveBeenCalledWith("Database read error:", expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe("saveDeceasedToDb", () => {
    it("does nothing when DATABASE_URL is not set", () => {
      delete process.env.DATABASE_URL

      saveDeceasedToDb([{ tmdb_id: 1, name: "Actor", deathday: "2020-01-01" }])

      expect(db.batchUpsertActors).not.toHaveBeenCalled()
    })

    it("calls batchUpsertActors with persons", () => {
      vi.mocked(db.batchUpsertActors).mockResolvedValue(undefined as never)
      const persons = [
        { tmdb_id: 1, name: "Actor 1", deathday: "2020-01-01" },
        { tmdb_id: 2, name: "Actor 2", deathday: "2021-02-15" },
      ]

      saveDeceasedToDb(persons)

      expect(db.batchUpsertActors).toHaveBeenCalledWith(persons)
    })

    it("logs error on database failure", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      const error = new Error("DB write failed")
      vi.mocked(db.batchUpsertActors).mockRejectedValue(error)

      saveDeceasedToDb([{ tmdb_id: 1, name: "Actor", deathday: "2020-01-01" }])

      // Wait for the promise rejection to be handled
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(consoleSpy).toHaveBeenCalledWith("Database write error:", error)
      consoleSpy.mockRestore()
    })
  })
})
