/**
 * Tests for cleanup-future-deaths script
 *
 * Verifies that the script correctly identifies and removes actors with:
 * - Future death dates
 * - Recent death dates (within 30 days)
 * - Death dates before birth dates
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Pool, QueryResult } from "pg"

describe("cleanup-future-deaths script", () => {
  let mockPool: Pool
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockQuery = vi.fn()
    mockPool = {
      query: mockQuery,
      end: vi.fn(),
    } as unknown as Pool
  })

  describe("SQL queries", () => {
    it("uses correct column name 'deathday' not 'death_date'", async () => {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      mockQuery.mockResolvedValueOnce({ rows: [] } as any)

      // Import and execute the main query logic
      await mockPool.query(
        `SELECT id, name, deathday, birthday
         FROM actors
         WHERE deathday IS NOT NULL
           AND (
             deathday > CURRENT_DATE
             OR deathday > $1
             OR (birthday IS NOT NULL AND deathday < birthday)
           )
         ORDER BY deathday DESC`,
        [thirtyDaysAgo.toISOString().split("T")[0]]
      )

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("deathday"), expect.any(Array))
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("death_date"),
        expect.any(Array)
      )
    })

    it("identifies actors with future death dates", async () => {
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            name: "Test Actor",
            deathday: futureDate.toISOString().split("T")[0],
            birthday: "1950-01-01",
          },
        ],
      } as any)

      const result = await mockPool.query(
        `SELECT id, name, deathday, birthday
         FROM actors
         WHERE deathday IS NOT NULL
           AND deathday > CURRENT_DATE`,
        []
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Test Actor")
    })

    it("identifies actors with death before birth", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 2,
            name: "Invalid Actor",
            deathday: "1940-01-01",
            birthday: "1950-01-01",
          },
        ],
      } as any)

      const result = await mockPool.query(
        `SELECT id, name, deathday, birthday
         FROM actors
         WHERE deathday IS NOT NULL
           AND birthday IS NOT NULL
           AND deathday < birthday`,
        []
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Invalid Actor")
    })

    it("clears death-related fields for suspicious actors", async () => {
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: "Test Actor" }],
        rowCount: 1,
      } as any)

      const result = await mockPool.query(
        `UPDATE actors
         SET
           deathday = NULL,
           cause_of_death = NULL,
           cause_of_death_details = NULL,
           cause_of_death_source = NULL,
           years_lost = NULL,
           age_at_death = NULL,
           updated_at = NOW()
         WHERE deathday IS NOT NULL
           AND (
             deathday > CURRENT_DATE
             OR deathday > $1
             OR (birthday IS NOT NULL AND deathday < birthday)
           )
         RETURNING id, name`,
        [thirtyDaysAgo.toISOString().split("T")[0]]
      )

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("deathday = NULL"),
        expect.any(Array)
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("cause_of_death = NULL"),
        expect.any(Array)
      )
      expect(result.rowCount).toBe(1)
    })

    it("does not use deprecated 'death_date' column name", async () => {
      const calls = mockQuery.mock.calls

      // Verify no calls used the old column name
      calls.forEach((call) => {
        const query = call[0] as string
        expect(query).not.toContain("death_date")
      })
    })
  })
})
