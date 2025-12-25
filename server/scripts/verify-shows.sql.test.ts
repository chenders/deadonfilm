/**
 * SQL integration tests for verify-shows.ts
 *
 * These tests use PGlite to validate SQL queries against an in-memory PostgreSQL
 * database. This catches SQL syntax errors (like GROUP BY issues) that mock-based
 * tests would miss.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import {
  getTestDb,
  closeTestDb,
  resetTestDb,
  insertShow,
  insertActorAppearance,
  insertDeceasedPerson,
} from "../src/test/pglite-helper.js"
import type { PGlite } from "@electric-sql/pglite"

// Type definitions for query results
interface CastCountRow {
  tmdb_id: number
  name: string
  stored_count: number
  actual_count: number
}

interface DeceasedFlagRow {
  actor_tmdb_id: number
  show_tmdb_id: number
  actor_name: string
}

interface MortalityRow {
  tmdb_id: number
  name: string
}

let db: PGlite

beforeAll(async () => {
  db = await getTestDb()
})

afterAll(async () => {
  await closeTestDb()
})

beforeEach(async () => {
  await resetTestDb()
})

describe("verify-shows SQL queries", () => {
  describe("findCastCountMismatches query", () => {
    // This is the exact SQL from verify-shows.ts findCastCountMismatches
    const query = `
      SELECT
        s.tmdb_id,
        s.name,
        COALESCE(s.cast_count, 0)::int as stored_count,
        COUNT(DISTINCT saa.actor_tmdb_id)::int as actual_count
      FROM shows s
      LEFT JOIN show_actor_appearances saa ON s.tmdb_id = saa.show_tmdb_id
      GROUP BY s.tmdb_id, s.name, s.cast_count, s.popularity
      HAVING COALESCE(s.cast_count, 0) != COUNT(DISTINCT saa.actor_tmdb_id)
      ORDER BY s.popularity DESC NULLS LAST
    `

    it("executes without SQL errors", async () => {
      // The query should execute without throwing
      const result = await db.query<CastCountRow>(query)
      expect(result.rows).toEqual([])
    })

    it("finds shows where cast_count doesn't match actual appearances", async () => {
      // Insert a show with cast_count = 10
      await insertShow(db, {
        tmdb_id: 1,
        name: "Test Show",
        popularity: 50,
        cast_count: 10,
      })

      // Insert only 5 actor appearances
      for (let i = 1; i <= 5; i++) {
        await insertActorAppearance(db, {
          actor_tmdb_id: i,
          show_tmdb_id: 1,
          actor_name: `Actor ${i}`,
        })
      }

      const result = await db.query<CastCountRow>(query)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].tmdb_id).toBe(1)
      expect(result.rows[0].stored_count).toBe(10)
      expect(result.rows[0].actual_count).toBe(5)
    })

    it("does not return shows where counts match", async () => {
      await insertShow(db, {
        tmdb_id: 1,
        name: "Matching Show",
        popularity: 50,
        cast_count: 3,
      })

      for (let i = 1; i <= 3; i++) {
        await insertActorAppearance(db, {
          actor_tmdb_id: i,
          show_tmdb_id: 1,
          actor_name: `Actor ${i}`,
        })
      }

      const result = await db.query<CastCountRow>(query)
      expect(result.rows).toHaveLength(0)
    })

    it("orders by popularity DESC", async () => {
      await insertShow(db, { tmdb_id: 1, name: "Low Pop", popularity: 10, cast_count: 5 })
      await insertShow(db, { tmdb_id: 2, name: "High Pop", popularity: 100, cast_count: 5 })
      await insertShow(db, { tmdb_id: 3, name: "Mid Pop", popularity: 50, cast_count: 5 })

      // No appearances, so all have mismatch
      const result = await db.query<CastCountRow>(query)
      expect(result.rows).toHaveLength(3)
      expect(result.rows[0].name).toBe("High Pop")
      expect(result.rows[1].name).toBe("Mid Pop")
      expect(result.rows[2].name).toBe("Low Pop")
    })
  })

  describe("findDeceasedCountMismatches query", () => {
    // This is the exact SQL from verify-shows.ts findDeceasedCountMismatches
    const query = `
      SELECT
        s.tmdb_id,
        s.name,
        COALESCE(s.deceased_count, 0)::int as stored_count,
        COUNT(DISTINCT CASE WHEN saa.is_deceased THEN saa.actor_tmdb_id END)::int as actual_count
      FROM shows s
      LEFT JOIN show_actor_appearances saa ON s.tmdb_id = saa.show_tmdb_id
      GROUP BY s.tmdb_id, s.name, s.deceased_count, s.popularity
      HAVING COALESCE(s.deceased_count, 0) != COUNT(DISTINCT CASE WHEN saa.is_deceased THEN saa.actor_tmdb_id END)
      ORDER BY s.popularity DESC NULLS LAST
    `

    it("executes without SQL errors", async () => {
      // The query should execute without throwing
      const result = await db.query<CastCountRow>(query)
      expect(result.rows).toEqual([])
    })

    it("finds shows where deceased_count doesn't match actual deceased appearances", async () => {
      await insertShow(db, {
        tmdb_id: 1,
        name: "Test Show",
        popularity: 50,
        deceased_count: 5,
      })

      // Insert 2 deceased and 3 living actors
      for (let i = 1; i <= 5; i++) {
        await insertActorAppearance(db, {
          actor_tmdb_id: i,
          show_tmdb_id: 1,
          actor_name: `Actor ${i}`,
          is_deceased: i <= 2,
        })
      }

      const result = await db.query<CastCountRow>(query)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].tmdb_id).toBe(1)
      expect(result.rows[0].stored_count).toBe(5)
      expect(result.rows[0].actual_count).toBe(2)
    })

    it("does not return shows where deceased counts match", async () => {
      await insertShow(db, {
        tmdb_id: 1,
        name: "Matching Show",
        popularity: 50,
        deceased_count: 2,
      })

      await insertActorAppearance(db, {
        actor_tmdb_id: 1,
        show_tmdb_id: 1,
        actor_name: "Actor 1",
        is_deceased: true,
      })
      await insertActorAppearance(db, {
        actor_tmdb_id: 2,
        show_tmdb_id: 1,
        actor_name: "Actor 2",
        is_deceased: true,
      })
      await insertActorAppearance(db, {
        actor_tmdb_id: 3,
        show_tmdb_id: 1,
        actor_name: "Actor 3",
        is_deceased: false,
      })

      const result = await db.query<CastCountRow>(query)
      expect(result.rows).toHaveLength(0)
    })
  })

  describe("findDeceasedFlagIssues query - should_be_true", () => {
    // This is the exact SQL from verify-shows.ts findDeceasedFlagIssues
    const query = `
      SELECT DISTINCT saa.actor_tmdb_id, saa.show_tmdb_id, saa.actor_name
      FROM show_actor_appearances saa
      INNER JOIN deceased_persons dp ON saa.actor_tmdb_id = dp.tmdb_id
      WHERE saa.is_deceased = false
    `

    it("executes without SQL errors", async () => {
      const result = await db.query<DeceasedFlagRow>(query)
      expect(result.rows).toEqual([])
    })

    it("finds actors who should be marked deceased but aren't", async () => {
      await insertShow(db, { tmdb_id: 1, name: "Test Show", popularity: 50 })

      // Add a deceased person
      await insertDeceasedPerson(db, {
        tmdb_id: 100,
        name: "Deceased Actor",
        deathday: "2020-01-01",
      })

      // Add appearance with is_deceased = false (incorrect)
      await insertActorAppearance(db, {
        actor_tmdb_id: 100,
        show_tmdb_id: 1,
        actor_name: "Deceased Actor",
        is_deceased: false,
      })

      const result = await db.query<DeceasedFlagRow>(query)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].actor_tmdb_id).toBe(100)
    })
  })

  describe("findDeceasedFlagIssues query - should_be_false", () => {
    // This is the exact SQL from verify-shows.ts findDeceasedFlagIssues
    const query = `
      SELECT DISTINCT saa.actor_tmdb_id, saa.show_tmdb_id, saa.actor_name
      FROM show_actor_appearances saa
      LEFT JOIN deceased_persons dp ON saa.actor_tmdb_id = dp.tmdb_id
      WHERE saa.is_deceased = true AND dp.tmdb_id IS NULL
    `

    it("executes without SQL errors", async () => {
      const result = await db.query<DeceasedFlagRow>(query)
      expect(result.rows).toEqual([])
    })

    it("finds actors marked deceased who aren't in deceased_persons", async () => {
      await insertShow(db, { tmdb_id: 1, name: "Test Show", popularity: 50 })

      // Add appearance with is_deceased = true but no deceased_persons record
      await insertActorAppearance(db, {
        actor_tmdb_id: 200,
        show_tmdb_id: 1,
        actor_name: "Living Actor",
        is_deceased: true,
      })

      const result = await db.query<DeceasedFlagRow>(query)
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].actor_tmdb_id).toBe(200)
    })
  })

  describe("findMissingMortality query", () => {
    // This is the exact SQL from verify-shows.ts findMissingMortality
    const query = `
      SELECT s.tmdb_id, s.name
      FROM shows s
      WHERE (s.mortality_surprise_score IS NULL OR s.expected_deaths IS NULL)
      ORDER BY s.popularity DESC NULLS LAST
    `

    it("executes without SQL errors", async () => {
      const result = await db.query<MortalityRow>(query)
      expect(result.rows).toEqual([])
    })

    it("finds shows missing mortality stats", async () => {
      await insertShow(db, {
        tmdb_id: 1,
        name: "Complete Show",
        popularity: 50,
        expected_deaths: 5.5,
        mortality_surprise_score: 0.5,
      })
      await insertShow(db, {
        tmdb_id: 2,
        name: "Missing Expected Deaths",
        popularity: 40,
        mortality_surprise_score: 0.5,
      })
      await insertShow(db, {
        tmdb_id: 3,
        name: "Missing Curse Score",
        popularity: 30,
        expected_deaths: 5.5,
      })
      await insertShow(db, {
        tmdb_id: 4,
        name: "Missing Both",
        popularity: 20,
      })

      const result = await db.query<MortalityRow>(query)
      expect(result.rows).toHaveLength(3)
      // Ordered by popularity DESC
      expect(result.rows[0].name).toBe("Missing Expected Deaths")
      expect(result.rows[1].name).toBe("Missing Curse Score")
      expect(result.rows[2].name).toBe("Missing Both")
    })
  })

  describe("query with phase filter", () => {
    // Test that queries with WHERE clause for phase work correctly
    const queryWithPhase = `
      SELECT
        s.tmdb_id,
        s.name,
        COALESCE(s.cast_count, 0)::int as stored_count,
        COUNT(DISTINCT saa.actor_tmdb_id)::int as actual_count
      FROM shows s
      LEFT JOIN show_actor_appearances saa ON s.tmdb_id = saa.show_tmdb_id
      WHERE s.popularity >= $1 AND s.popularity < $2
      GROUP BY s.tmdb_id, s.name, s.cast_count, s.popularity
      HAVING COALESCE(s.cast_count, 0) != COUNT(DISTINCT saa.actor_tmdb_id)
      ORDER BY s.popularity DESC NULLS LAST
    `

    it("filters by popularity range", async () => {
      await insertShow(db, { tmdb_id: 1, name: "Popular", popularity: 60, cast_count: 5 })
      await insertShow(db, { tmdb_id: 2, name: "Standard", popularity: 25, cast_count: 5 })
      await insertShow(db, { tmdb_id: 3, name: "Obscure", popularity: 5, cast_count: 5 })

      // Query for standard phase (10-50)
      const result = await db.query<CastCountRow>(queryWithPhase, [10, 50])
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Standard")
    })
  })

  describe("query with LIMIT", () => {
    const queryWithLimit = `
      SELECT
        s.tmdb_id,
        s.name,
        COALESCE(s.cast_count, 0)::int as stored_count,
        COUNT(DISTINCT saa.actor_tmdb_id)::int as actual_count
      FROM shows s
      LEFT JOIN show_actor_appearances saa ON s.tmdb_id = saa.show_tmdb_id
      GROUP BY s.tmdb_id, s.name, s.cast_count, s.popularity
      HAVING COALESCE(s.cast_count, 0) != COUNT(DISTINCT saa.actor_tmdb_id)
      ORDER BY s.popularity DESC NULLS LAST
      LIMIT $1
    `

    it("limits results correctly", async () => {
      for (let i = 1; i <= 10; i++) {
        await insertShow(db, {
          tmdb_id: i,
          name: `Show ${i}`,
          popularity: i * 10,
          cast_count: 5,
        })
      }

      const result = await db.query<CastCountRow>(queryWithLimit, [3])
      expect(result.rows).toHaveLength(3)
      // Should be the top 3 by popularity
      expect(result.rows[0].name).toBe("Show 10")
      expect(result.rows[1].name).toBe("Show 9")
      expect(result.rows[2].name).toBe("Show 8")
    })
  })
})

describe("SQL syntax regression tests", () => {
  describe("GROUP BY must include all ORDER BY columns", () => {
    it("rejects query with ORDER BY column not in GROUP BY", async () => {
      // This is the BROKEN query that was missing s.popularity in GROUP BY
      const brokenQuery = `
        SELECT
          s.tmdb_id,
          s.name,
          COALESCE(s.cast_count, 0)::int as stored_count,
          COUNT(DISTINCT saa.actor_tmdb_id)::int as actual_count
        FROM shows s
        LEFT JOIN show_actor_appearances saa ON s.tmdb_id = saa.show_tmdb_id
        GROUP BY s.tmdb_id, s.name, s.cast_count
        HAVING COALESCE(s.cast_count, 0) != COUNT(DISTINCT saa.actor_tmdb_id)
        ORDER BY s.popularity DESC NULLS LAST
      `

      await expect(db.query<CastCountRow>(brokenQuery)).rejects.toThrow(
        /must appear in the GROUP BY clause/
      )
    })

    it("accepts query with ORDER BY column in GROUP BY", async () => {
      // This is the FIXED query with s.popularity in GROUP BY
      const fixedQuery = `
        SELECT
          s.tmdb_id,
          s.name,
          COALESCE(s.cast_count, 0)::int as stored_count,
          COUNT(DISTINCT saa.actor_tmdb_id)::int as actual_count
        FROM shows s
        LEFT JOIN show_actor_appearances saa ON s.tmdb_id = saa.show_tmdb_id
        GROUP BY s.tmdb_id, s.name, s.cast_count, s.popularity
        HAVING COALESCE(s.cast_count, 0) != COUNT(DISTINCT saa.actor_tmdb_id)
        ORDER BY s.popularity DESC NULLS LAST
      `

      // Should not throw
      const result = await db.query<CastCountRow>(fixedQuery)
      expect(result.rows).toBeDefined()
    })
  })
})
