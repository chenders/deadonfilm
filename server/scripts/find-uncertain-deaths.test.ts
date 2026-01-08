import { describe, it, expect, vi, beforeEach } from "vitest"
import { UNCERTAINTY_PATTERNS, findUncertainDeaths } from "./find-uncertain-deaths.js"
import * as db from "../src/lib/db.js"

vi.mock("../src/lib/db.js", () => ({
  getPool: vi.fn(),
  resetPool: vi.fn(),
}))

describe("find-uncertain-deaths", () => {
  describe("UNCERTAINTY_PATTERNS", () => {
    it("contains expected uncertainty phrases", () => {
      expect(UNCERTAINTY_PATTERNS).toContain("cannot verify")
      expect(UNCERTAINTY_PATTERNS).toContain("cannot confirm")
      expect(UNCERTAINTY_PATTERNS).toContain("still alive")
      expect(UNCERTAINTY_PATTERNS).toContain("unable to verify")
    })

    it("has reasonable number of patterns", () => {
      expect(UNCERTAINTY_PATTERNS.length).toBeGreaterThan(10)
      expect(UNCERTAINTY_PATTERNS.length).toBeLessThan(50)
    })

    it("all patterns are lowercase for case-insensitive matching", () => {
      for (const pattern of UNCERTAINTY_PATTERNS) {
        expect(pattern).toBe(pattern.toLowerCase())
      }
    })
  })

  describe("findUncertainDeaths", () => {
    let mockQuery: ReturnType<typeof vi.fn>
    let consoleSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      vi.clearAllMocks()
      mockQuery = vi.fn()
      vi.mocked(db.getPool).mockReturnValue({ query: mockQuery } as unknown as ReturnType<
        typeof db.getPool
      >)
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    })

    it("queries database with regex pattern of all uncertainty phrases", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await findUncertainDeaths()

      expect(mockQuery).toHaveBeenCalledTimes(1)
      const [query, params] = mockQuery.mock.calls[0]
      expect(query).toContain("~* $1")
      expect(params[0]).toContain("cannot verify")
      expect(params[0]).toContain("|")
    })

    it("handles empty result set", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await findUncertainDeaths()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Found 0 actors"))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SUMMARY: 0 actors"))
    })

    it("outputs actor details for results found", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            actor_id: 123,
            name: "Test Actor",
            tmdb_id: 456,
            deathday: "2024-01-15",
            circumstances: "I cannot verify that this person has died.",
            rumored_circumstances: null,
            additional_context: null,
            raw_response: null,
          },
        ],
      })

      await findUncertainDeaths()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Found 1 actors"))
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Actor: Test Actor (ID: 123, TMDB: 456)")
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Recorded deathday: 2024-01-15")
      )
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("cannot verify"))
    })

    it("handles multiple matched fields in a single row", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            actor_id: 789,
            name: "Another Actor",
            tmdb_id: 111,
            deathday: "2023-06-20",
            circumstances: "The actor is still alive according to sources.",
            rumored_circumstances: "Cannot confirm any death information.",
            additional_context: "This person may be incorrect in the database.",
            raw_response: null,
          },
        ],
      })

      await findUncertainDeaths()

      // Should report matches from multiple fields
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Circumstances contains:"))
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Rumored circumstances contains:")
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Additional context contains:")
      )
    })

    it("cleans up database connection after execution", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] })

      await findUncertainDeaths()

      expect(db.resetPool).toHaveBeenCalledTimes(1)
    })

    it("cleans up database connection even on error", async () => {
      mockQuery.mockRejectedValueOnce(new Error("Database error"))

      await expect(findUncertainDeaths()).rejects.toThrow("Database error")

      expect(db.resetPool).toHaveBeenCalledTimes(1)
    })

    it("handles multiple actors in results", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            actor_id: 1,
            name: "Actor One",
            tmdb_id: 100,
            deathday: "2024-01-01",
            circumstances: "Cannot verify death",
            rumored_circumstances: null,
            additional_context: null,
            raw_response: null,
          },
          {
            actor_id: 2,
            name: "Actor Two",
            tmdb_id: 200,
            deathday: "2024-02-02",
            circumstances: "Still alive according to reports",
            rumored_circumstances: null,
            additional_context: null,
            raw_response: null,
          },
        ],
      })

      await findUncertainDeaths()

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Found 2 actors"))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Actor One"))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Actor Two"))
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("SUMMARY: 2 actors"))
    })
  })
})
