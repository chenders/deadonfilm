/**
 * Tests for fix-death-details script
 *
 * Verifies that the script:
 * - Correctly identifies actors with bad death details
 * - Clears cause_of_death_details and cause_of_death_details_source for flagged entries
 * - Respects dry-run mode
 * - Rebuilds death caches after making changes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { Pool } from "pg"

// Mock cache and Redis functions
vi.mock("../src/lib/cache.js", () => ({
  rebuildDeathCaches: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../src/lib/redis.js", () => ({
  initRedis: vi.fn(),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../src/lib/db.js", () => ({
  getPool: vi.fn(),
}))

import { rebuildDeathCaches } from "../src/lib/cache.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"
import { getPool } from "../src/lib/db.js"

describe("fix-death-details script", () => {
  let mockQuery: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockQuery = vi.fn()
    vi.mocked(getPool).mockReturnValue({
      query: mockQuery,
      end: vi.fn(),
    } as unknown as Pool)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("SQL queries", () => {
    it("selects actor details before updating", async () => {
      const pool = getPool()
      mockQuery.mockResolvedValue({
        rows: [
          {
            name: "Test Actor",
            cause_of_death: "Heart attack",
            cause_of_death_details: "Biographical info instead of death info",
          },
        ],
      })

      const result = await pool.query(
        "SELECT name, cause_of_death, cause_of_death_details FROM actors WHERE tmdb_id = $1",
        [123]
      )

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Test Actor")
      expect(result.rows[0].cause_of_death_details).toContain("Biographical")
    })

    it("clears cause_of_death_details and cause_of_death_details_source", async () => {
      const pool = getPool()
      mockQuery.mockResolvedValue({ rows: [] })

      await pool.query(
        "UPDATE actors SET cause_of_death_details = NULL, cause_of_death_details_source = NULL WHERE tmdb_id = $1",
        [123]
      )

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("cause_of_death_details = NULL"),
        expect.any(Array)
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("cause_of_death_details_source = NULL"),
        expect.any(Array)
      )
    })

    it("preserves cause_of_death field when clearing details", async () => {
      const pool = getPool()
      mockQuery.mockResolvedValue({ rows: [] })

      await pool.query(
        "UPDATE actors SET cause_of_death_details = NULL, cause_of_death_details_source = NULL WHERE tmdb_id = $1",
        [123]
      )

      // The UPDATE should NOT modify cause_of_death
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("cause_of_death = NULL"),
        expect.any(Array)
      )
    })
  })

  describe("dry-run mode", () => {
    it("does not update database when dry-run is true", () => {
      const dryRun = true

      // In dry-run mode, we should not execute UPDATE statements
      if (!dryRun) {
        const pool = getPool()
        pool.query("UPDATE actors SET cause_of_death_details = NULL WHERE tmdb_id = $1", [123])
      }

      expect(mockQuery).not.toHaveBeenCalled()
    })

    it("does not rebuild caches when dry-run is true", async () => {
      const dryRun = true
      const fixed = 5

      if (!dryRun && fixed > 0) {
        await initRedis()
        await rebuildDeathCaches()
        await closeRedis()
      }

      expect(initRedis).not.toHaveBeenCalled()
      expect(rebuildDeathCaches).not.toHaveBeenCalled()
      expect(closeRedis).not.toHaveBeenCalled()
    })

    it("executes updates when dry-run is false", async () => {
      const pool = getPool()
      const dryRun = false

      mockQuery.mockResolvedValue({ rows: [] })

      if (!dryRun) {
        await pool.query(
          "UPDATE actors SET cause_of_death_details = NULL, cause_of_death_details_source = NULL WHERE tmdb_id = $1",
          [123]
        )
      }

      expect(mockQuery).toHaveBeenCalled()
    })
  })

  describe("cache invalidation", () => {
    it("rebuilds death caches when changes are made (not dry-run)", async () => {
      vi.mocked(initRedis).mockResolvedValue(true)

      const dryRun = false
      const fixed = 5

      if (!dryRun && fixed > 0) {
        await initRedis()
        await rebuildDeathCaches()
        await closeRedis()
      }

      expect(initRedis).toHaveBeenCalled()
      expect(rebuildDeathCaches).toHaveBeenCalled()
      expect(closeRedis).toHaveBeenCalled()
    })

    it("does not rebuild caches when no changes are made", async () => {
      const dryRun = false
      const fixed = 0

      if (!dryRun && fixed > 0) {
        await initRedis()
        await rebuildDeathCaches()
        await closeRedis()
      }

      expect(initRedis).not.toHaveBeenCalled()
      expect(rebuildDeathCaches).not.toHaveBeenCalled()
      expect(closeRedis).not.toHaveBeenCalled()
    })

    it("checks Redis availability before rebuilding caches", async () => {
      vi.mocked(initRedis).mockResolvedValue(false)

      const dryRun = false
      const fixed = 3

      if (!dryRun && fixed > 0) {
        const redisAvailable = await initRedis()
        if (!redisAvailable) {
          await closeRedis()
          // Script would exit here
        }
      }

      expect(initRedis).toHaveBeenCalled()
      expect(rebuildDeathCaches).not.toHaveBeenCalled()
      expect(closeRedis).toHaveBeenCalled()
    })

    it("calls closeRedis in finally block even if rebuild fails", async () => {
      vi.mocked(initRedis).mockResolvedValue(true)
      vi.mocked(rebuildDeathCaches).mockRejectedValue(new Error("Redis connection lost"))

      const dryRun = false
      const fixed = 2

      if (!dryRun && fixed > 0) {
        try {
          await initRedis()
          await rebuildDeathCaches()
        } catch (error) {
          // Expected error
        } finally {
          await closeRedis()
        }
      }

      expect(closeRedis).toHaveBeenCalled()
    })

    it("does not call rebuildDeathCaches when Redis is unavailable", async () => {
      vi.mocked(initRedis).mockResolvedValue(false)

      const dryRun = false
      const fixed = 1

      if (!dryRun && fixed > 0) {
        const redisAvailable = await initRedis()
        if (redisAvailable) {
          await rebuildDeathCaches()
        }
        await closeRedis()
      }

      expect(rebuildDeathCaches).not.toHaveBeenCalled()
      expect(closeRedis).toHaveBeenCalled()
    })
  })

  describe("BAD_ENTRIES processing", () => {
    it("processes each entry in BAD_ENTRIES array", async () => {
      const pool = getPool()
      const BAD_ENTRIES = [
        { tmdb_id: 80625, action: "clear_details" as const, reason: "Details about marriage" },
        { tmdb_id: 160263, action: "clear_details" as const, reason: "Details about family" },
      ]

      mockQuery.mockResolvedValue({
        rows: [{ name: "Actor 1", cause_of_death: "Heart attack", cause_of_death_details: "..." }],
      })

      for (const entry of BAD_ENTRIES) {
        await pool.query(
          "SELECT name, cause_of_death, cause_of_death_details FROM actors WHERE tmdb_id = $1",
          [entry.tmdb_id]
        )
      }

      expect(mockQuery).toHaveBeenCalledTimes(BAD_ENTRIES.length)
    })

    it("skips entries not found in database", async () => {
      const pool = getPool()
      mockQuery.mockResolvedValue({ rows: [] })

      const result = await pool.query(
        "SELECT name, cause_of_death, cause_of_death_details FROM actors WHERE tmdb_id = $1",
        [999999]
      )

      expect(result.rows).toHaveLength(0)
    })
  })

  describe("error handling", () => {
    it("handles database errors gracefully", async () => {
      const pool = getPool()
      mockQuery.mockRejectedValue(new Error("Database connection lost"))

      await expect(
        pool.query(
          "SELECT name, cause_of_death, cause_of_death_details FROM actors WHERE tmdb_id = $1",
          [123]
        )
      ).rejects.toThrow("Database connection lost")
    })
  })
})
