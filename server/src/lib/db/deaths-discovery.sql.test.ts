/**
 * SQL integration tests for deaths-discovery.ts suicide filter
 *
 * These tests use PGlite to validate the SQL filtering logic correctly excludes
 * suicides like "suicide by gunshot wound" when showSelfInflicted=false, even when
 * those deaths match other category patterns (e.g., homicide's "gunshot wound").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { getTestDb, closeTestDb, resetTestDb, insertActor } from "../../test/pglite-helper.js"
import type { PGlite } from "@electric-sql/pglite"
import { UNNATURAL_DEATH_CATEGORIES } from "./deaths-discovery.js"
import type { UnnaturalDeathCategory } from "./types.js"

// Helper functions that mirror the logic in deaths-discovery.ts
function escapeSqlLikePattern(pattern: string): string {
  return pattern.replace(/'/g, "''")
}

function buildCategoryCondition(patterns: readonly string[]): string {
  return patterns
    .map((p) => {
      const escaped = escapeSqlLikePattern(p.toLowerCase())
      return `LOWER(COALESCE(cause_of_death, '') || ' ' || COALESCE(cause_of_death_details, '')) LIKE '%${escaped}%'`
    })
    .join(" OR ")
}

function getAllUnnaturalPatterns(): string {
  const conditions = Object.values(UNNATURAL_DEATH_CATEGORIES)
    .map((cat) => `(${buildCategoryCondition(cat.patterns)})`)
    .join(" OR ")
  return conditions
}

function getNonSuicideUnnaturalPatterns(): string {
  const conditions = Object.entries(UNNATURAL_DEATH_CATEGORIES)
    .filter(([key]) => key !== "suicide")
    .map(([, cat]) => `(${buildCategoryCondition(cat.patterns)})`)
    .join(" OR ")
  return conditions
}

function getSuicidePatterns(): string {
  return buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.suicide.patterns)
}

interface ActorRow {
  tmdb_id: number
  name: string
  cause_of_death: string | null
  cause_of_death_details: string | null
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

describe("suicide filter SQL logic", () => {
  describe("suicide exclusion when showSelfInflicted=false", () => {
    it("excludes 'suicide by gunshot wound' from homicide results", async () => {
      // Insert test actors
      await insertActor(db, {
        tmdb_id: 1,
        name: "Suicide Gunshot Actor",
        deathday: "2020-01-01",
        cause_of_death: "suicide by gunshot wound",
      })
      await insertActor(db, {
        tmdb_id: 2,
        name: "Homicide Gunshot Actor",
        deathday: "2020-01-02",
        cause_of_death: "gunshot wound",
        cause_of_death_details: "murdered during robbery",
      })
      await insertActor(db, {
        tmdb_id: 3,
        name: "Living Actor",
        deathday: null,
      })

      // Query with homicide filter + suicide exclusion (simulates showSelfInflicted=false)
      const homicideCondition = buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.homicide.patterns)
      const suicideExclusion = `AND NOT (${getSuicidePatterns()})`

      const query = `
        SELECT tmdb_id, name, cause_of_death, cause_of_death_details
        FROM actors
        WHERE (${homicideCondition}) ${suicideExclusion} AND is_obscure = false
        ORDER BY tmdb_id
      `

      const result = await db.query<ActorRow>(query)

      // Should only return the actual homicide, not the suicide by gunshot
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Homicide Gunshot Actor")
    })

    it("excludes 'suicide by drug overdose' from overdose results", async () => {
      await insertActor(db, {
        tmdb_id: 1,
        name: "Suicide Overdose Actor",
        deathday: "2020-01-01",
        cause_of_death: "suicide by drug overdose",
      })
      await insertActor(db, {
        tmdb_id: 2,
        name: "Accidental Overdose Actor",
        deathday: "2020-01-02",
        cause_of_death: "drug overdose",
        cause_of_death_details: "accidental fentanyl overdose",
      })

      const overdoseCondition = buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.overdose.patterns)
      const suicideExclusion = `AND NOT (${getSuicidePatterns()})`

      const query = `
        SELECT tmdb_id, name, cause_of_death, cause_of_death_details
        FROM actors
        WHERE (${overdoseCondition}) ${suicideExclusion} AND is_obscure = false
        ORDER BY tmdb_id
      `

      const result = await db.query<ActorRow>(query)

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Accidental Overdose Actor")
    })

    it("excludes all suicide patterns from 'all' category results", async () => {
      // Insert various unnatural death actors
      await insertActor(db, {
        tmdb_id: 1,
        name: "Suicide Actor",
        deathday: "2020-01-01",
        cause_of_death: "suicide",
      })
      await insertActor(db, {
        tmdb_id: 2,
        name: "Self-Inflicted Actor",
        deathday: "2020-01-02",
        cause_of_death: "self-inflicted gunshot wound",
      })
      await insertActor(db, {
        tmdb_id: 3,
        name: "Took Own Life Actor",
        deathday: "2020-01-03",
        cause_of_death_details: "took his own life after depression",
      })
      await insertActor(db, {
        tmdb_id: 4,
        name: "Car Accident Actor",
        deathday: "2020-01-04",
        cause_of_death: "car accident",
      })
      await insertActor(db, {
        tmdb_id: 5,
        name: "Drug Overdose Actor",
        deathday: "2020-01-05",
        cause_of_death: "drug overdose",
      })

      // Query all unnatural deaths without suicides
      const nonSuicideCondition = getNonSuicideUnnaturalPatterns()
      const suicideExclusion = `AND NOT (${getSuicidePatterns()})`

      const query = `
        SELECT tmdb_id, name, cause_of_death, cause_of_death_details
        FROM actors
        WHERE (${nonSuicideCondition}) ${suicideExclusion} AND is_obscure = false
        ORDER BY tmdb_id
      `

      const result = await db.query<ActorRow>(query)

      // Should only return non-suicide deaths
      expect(result.rows).toHaveLength(2)
      expect(result.rows.map((r) => r.name)).toEqual(["Car Accident Actor", "Drug Overdose Actor"])
    })
  })

  describe("suicide inclusion when showSelfInflicted=true", () => {
    it("includes suicides when showSelfInflicted=true", async () => {
      await insertActor(db, {
        tmdb_id: 1,
        name: "Suicide Gunshot Actor",
        deathday: "2020-01-01",
        cause_of_death: "suicide by gunshot wound",
      })
      await insertActor(db, {
        tmdb_id: 2,
        name: "Homicide Gunshot Actor",
        deathday: "2020-01-02",
        cause_of_death: "gunshot wound",
      })

      // Query all unnatural deaths with suicides included
      const allCondition = getAllUnnaturalPatterns()

      const query = `
        SELECT tmdb_id, name, cause_of_death
        FROM actors
        WHERE (${allCondition}) AND is_obscure = false
        ORDER BY tmdb_id
      `

      const result = await db.query<ActorRow>(query)

      // Should return both
      expect(result.rows).toHaveLength(2)
      expect(result.rows.map((r) => r.name)).toEqual([
        "Suicide Gunshot Actor",
        "Homicide Gunshot Actor",
      ])
    })
  })

  describe("edge cases", () => {
    it("handles cause_of_death_details containing suicide pattern", async () => {
      await insertActor(db, {
        tmdb_id: 1,
        name: "Details Suicide Actor",
        deathday: "2020-01-01",
        cause_of_death: "gunshot wound",
        cause_of_death_details: "died by suicide using a firearm",
      })
      await insertActor(db, {
        tmdb_id: 2,
        name: "Pure Homicide Actor",
        deathday: "2020-01-02",
        cause_of_death: "gunshot wound",
        cause_of_death_details: "shot during home invasion",
      })

      const homicideCondition = buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.homicide.patterns)
      const suicideExclusion = `AND NOT (${getSuicidePatterns()})`

      const query = `
        SELECT tmdb_id, name, cause_of_death, cause_of_death_details
        FROM actors
        WHERE (${homicideCondition}) ${suicideExclusion} AND is_obscure = false
        ORDER BY tmdb_id
      `

      const result = await db.query<ActorRow>(query)

      // Should exclude the one with suicide in details
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Pure Homicide Actor")
    })

    it("handles case-insensitive matching", async () => {
      await insertActor(db, {
        tmdb_id: 1,
        name: "Upper Case Suicide",
        deathday: "2020-01-01",
        cause_of_death: "SUICIDE BY GUNSHOT",
      })
      await insertActor(db, {
        tmdb_id: 2,
        name: "Mixed Case Self-Inflicted",
        deathday: "2020-01-02",
        cause_of_death: "Self-Inflicted Wound",
      })

      const homicideCondition = buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.homicide.patterns)
      const suicideExclusion = `AND NOT (${getSuicidePatterns()})`

      const query = `
        SELECT tmdb_id, name
        FROM actors
        WHERE (${homicideCondition}) ${suicideExclusion} AND is_obscure = false
      `

      const result = await db.query<ActorRow>(query)

      // Both should be excluded due to suicide patterns (case-insensitive)
      expect(result.rows).toHaveLength(0)
    })

    it("handles null cause_of_death fields", async () => {
      await insertActor(db, {
        tmdb_id: 1,
        name: "Null Cause Actor",
        deathday: "2020-01-01",
        cause_of_death: null,
        cause_of_death_details: null,
      })
      await insertActor(db, {
        tmdb_id: 2,
        name: "Real Homicide Actor",
        deathday: "2020-01-02",
        cause_of_death: "gunshot wound",
      })

      const allCondition = getAllUnnaturalPatterns()

      const query = `
        SELECT tmdb_id, name
        FROM actors
        WHERE (${allCondition}) AND is_obscure = false
        ORDER BY tmdb_id
      `

      const result = await db.query<ActorRow>(query)

      // Should only return the one with actual cause of death
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].name).toBe("Real Homicide Actor")
    })
  })
})

describe("category count queries", () => {
  it("correctly categorizes deaths", async () => {
    await insertActor(db, {
      tmdb_id: 1,
      name: "Suicide Actor",
      deathday: "2020-01-01",
      cause_of_death: "suicide",
    })
    await insertActor(db, {
      tmdb_id: 2,
      name: "Accident Actor",
      deathday: "2020-01-02",
      cause_of_death: "car accident",
    })
    await insertActor(db, {
      tmdb_id: 3,
      name: "Overdose Actor",
      deathday: "2020-01-03",
      cause_of_death: "drug overdose",
    })
    await insertActor(db, {
      tmdb_id: 4,
      name: "Homicide Actor",
      deathday: "2020-01-04",
      cause_of_death: "gunshot wound",
    })
    await insertActor(db, {
      tmdb_id: 5,
      name: "Fire Actor",
      deathday: "2020-01-05",
      cause_of_death: "house fire",
    })

    // Category count query from deaths-discovery.ts
    const query = `
      SELECT
        CASE
          WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.suicide.patterns)} THEN 'suicide'
          WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.accident.patterns)} THEN 'accident'
          WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.overdose.patterns)} THEN 'overdose'
          WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.homicide.patterns)} THEN 'homicide'
          WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.other.patterns)} THEN 'other'
        END as category,
        COUNT(*) as count
      FROM actors
      WHERE (${getAllUnnaturalPatterns()}) AND is_obscure = false
      GROUP BY category
      ORDER BY category
    `

    const result = await db.query<{ category: UnnaturalDeathCategory; count: string }>(query)

    const counts: Record<string, number> = {}
    for (const row of result.rows) {
      counts[row.category] = parseInt(row.count, 10)
    }

    expect(counts.suicide).toBe(1)
    expect(counts.accident).toBe(1)
    expect(counts.overdose).toBe(1)
    expect(counts.homicide).toBe(1)
    expect(counts.other).toBe(1)
  })
})
