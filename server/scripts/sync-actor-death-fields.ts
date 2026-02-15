#!/usr/bin/env tsx
/**
 * Sync deterministic death fields on the actors table.
 *
 * Populates fields that can be derived without AI:
 *   1. death_manner     — from cause_manner_mappings via normalizations
 *   2. deathday_precision — "day" for all full-date deathdates
 *   3. covid_related    — true when cause_of_death mentions covid/coronavirus
 *   4. death_categories — computed from cause_of_death text + manner
 *   5. age_at_death / expected_lifespan / years_lost — from birthday + deathday + cohort tables
 *
 * Usage:
 *   npx tsx scripts/sync-actor-death-fields.ts [--dry-run]
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db/pool.js"
import { CAUSE_CATEGORIES } from "../src/lib/cause-categories.js"
import { calculateYearsLost } from "../src/lib/mortality-stats.js"

interface Options {
  dryRun: boolean
}

// Build slug lookup from CAUSE_CATEGORIES (use slugs for the array, not keys)
const CATEGORY_ENTRIES: Array<{ slug: string; patterns: readonly string[] }> = Object.entries(
  CAUSE_CATEGORIES
)
  .filter(([key]) => key !== "other")
  .map(([, cat]) => ({ slug: cat.slug, patterns: cat.patterns }))

/**
 * Compute all matching category slugs for a cause + manner.
 * Returns every category whose patterns match (not just the first),
 * with manner-based categories (suicide/homicide/accident) prepended.
 */
export function computeCategories(cause: string | null, manner: string | null): string[] {
  const cats: string[] = []

  // Manner-based categories first
  if (manner === "suicide") cats.push("suicide")
  if (manner === "homicide") cats.push("homicide")
  if (manner === "accident") cats.push("accident")

  // Pattern-based categories
  if (cause) {
    const lower = cause.toLowerCase()
    for (const { slug, patterns } of CATEGORY_ENTRIES) {
      if (cats.includes(slug)) continue
      for (const p of patterns) {
        if (lower.includes(p.toLowerCase())) {
          cats.push(slug)
          break
        }
      }
    }
  }

  return cats.length > 0 ? cats : ["other"]
}

async function run(options: Options) {
  const pool = getPool()
  const { dryRun } = options
  const prefix = dryRun ? "[DRY RUN] " : ""

  try {
    // ---------------------------------------------------------------
    // 1. Sync death_manner from cause_manner_mappings → actors
    // ---------------------------------------------------------------
    const mannerResult = await pool.query(`
      SELECT count(*) as cnt
      FROM actors a
      JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
      JOIN cause_manner_mappings cmm ON cmm.normalized_cause = n.normalized_cause
      WHERE a.death_manner IS DISTINCT FROM cmm.manner
    `)
    const mannerCount = parseInt(mannerResult.rows[0].cnt, 10)
    console.log(`${prefix}death_manner: ${mannerCount} actors to sync from cause_manner_mappings`)

    if (!dryRun && mannerCount > 0) {
      const { rowCount } = await pool.query(`
        UPDATE actors a
        SET death_manner = cmm.manner
        FROM cause_of_death_normalizations n
        JOIN cause_manner_mappings cmm ON cmm.normalized_cause = n.normalized_cause
        WHERE a.cause_of_death = n.original_cause
          AND a.death_manner IS DISTINCT FROM cmm.manner
      `)
      console.log(`  Updated ${rowCount} actors`)
    }

    // ---------------------------------------------------------------
    // 2. Set deathday_precision = 'day' for full dates
    // ---------------------------------------------------------------
    const precisionResult = await pool.query(`
      SELECT count(*) as cnt
      FROM actors
      WHERE deathday IS NOT NULL AND deathday_precision IS NULL
    `)
    const precisionCount = parseInt(precisionResult.rows[0].cnt, 10)
    console.log(`${prefix}deathday_precision: ${precisionCount} actors to set to 'day'`)

    if (!dryRun && precisionCount > 0) {
      const { rowCount } = await pool.query(`
        UPDATE actors
        SET deathday_precision = 'day'
        WHERE deathday IS NOT NULL AND deathday_precision IS NULL
      `)
      console.log(`  Updated ${rowCount} actors`)
    }

    // ---------------------------------------------------------------
    // 3. Set covid_related from cause_of_death text
    // ---------------------------------------------------------------
    const covidResult = await pool.query(`
      SELECT count(*) as cnt
      FROM actors
      WHERE cause_of_death IS NOT NULL
        AND (covid_related IS NULL OR covid_related = false)
        AND (
          cause_of_death ILIKE '%covid%'
          OR cause_of_death ILIKE '%coronavirus%'
          OR cause_of_death ILIKE '%sars-cov%'
        )
    `)
    const covidCount = parseInt(covidResult.rows[0].cnt, 10)
    console.log(`${prefix}covid_related: ${covidCount} actors to flag`)

    if (!dryRun && covidCount > 0) {
      const { rowCount } = await pool.query(`
        UPDATE actors
        SET covid_related = true
        WHERE cause_of_death IS NOT NULL
          AND (covid_related IS NULL OR covid_related = false)
          AND (
            cause_of_death ILIKE '%covid%'
            OR cause_of_death ILIKE '%coronavirus%'
            OR cause_of_death ILIKE '%sars-cov%'
          )
      `)
      console.log(`  Updated ${rowCount} actors`)
    }

    // ---------------------------------------------------------------
    // 4. Compute death_categories from cause_of_death + manner
    // ---------------------------------------------------------------
    const catRows = await pool.query<{
      id: number
      cause_of_death: string
      death_manner: string | null
    }>(`
      SELECT id, cause_of_death, death_manner
      FROM actors
      WHERE cause_of_death IS NOT NULL
        AND (death_categories IS NULL OR death_categories = '{}')
    `)
    console.log(`${prefix}death_categories: ${catRows.rows.length} actors to compute`)

    if (!dryRun && catRows.rows.length > 0) {
      let updated = 0
      // Batch in groups of 500 for efficiency
      const batchSize = 500
      for (let i = 0; i < catRows.rows.length; i += batchSize) {
        const batch = catRows.rows.slice(i, i + batchSize)
        const cases: string[] = []
        const params: unknown[] = []
        let paramIdx = 1

        for (const row of batch) {
          const cats = computeCategories(row.cause_of_death, row.death_manner)
          cases.push(`WHEN id = $${paramIdx} THEN $${paramIdx + 1}::text[]`)
          params.push(row.id, cats)
          paramIdx += 2
        }

        const ids = batch.map((r) => r.id)
        params.push(ids)

        await pool.query(
          `UPDATE actors SET death_categories = CASE ${cases.join(" ")} END
           WHERE id = ANY($${paramIdx}::int[])`,
          params
        )
        updated += batch.length
      }
      console.log(`  Updated ${updated} actors`)
    }

    // ---------------------------------------------------------------
    // 5. Compute age_at_death, expected_lifespan, years_lost
    // ---------------------------------------------------------------
    const ageRows = await pool.query<{
      id: number
      birthday: string
      deathday: string
    }>(`
      SELECT id, birthday::text, deathday::text
      FROM actors
      WHERE birthday IS NOT NULL AND deathday IS NOT NULL
        AND (age_at_death IS NULL OR expected_lifespan IS NULL OR years_lost IS NULL)
    `)
    console.log(
      `${prefix}age_at_death/expected_lifespan/years_lost: ${ageRows.rows.length} actors to compute`
    )

    if (!dryRun && ageRows.rows.length > 0) {
      let updated = 0
      const batchSize = 500
      for (let i = 0; i < ageRows.rows.length; i += batchSize) {
        const batch = ageRows.rows.slice(i, i + batchSize)
        const cases: { id: number; age: number; lifespan: number; lost: number }[] = []

        for (const row of batch) {
          const result = await calculateYearsLost(row.birthday, row.deathday)
          if (result) {
            cases.push({
              id: row.id,
              age: result.ageAtDeath,
              lifespan: result.expectedLifespan,
              lost: result.yearsLost,
            })
          }
        }

        if (cases.length > 0) {
          const ageClauses: string[] = []
          const lifespanClauses: string[] = []
          const lostClauses: string[] = []
          const params: unknown[] = []
          let paramIdx = 1

          for (const c of cases) {
            ageClauses.push(`WHEN id = $${paramIdx} THEN $${paramIdx + 1}::int`)
            lifespanClauses.push(`WHEN id = $${paramIdx} THEN $${paramIdx + 2}::numeric`)
            lostClauses.push(`WHEN id = $${paramIdx} THEN $${paramIdx + 3}::numeric`)
            params.push(c.id, c.age, c.lifespan, c.lost)
            paramIdx += 4
          }

          const ids = cases.map((c) => c.id)
          params.push(ids)

          await pool.query(
            `UPDATE actors SET
               age_at_death = CASE ${ageClauses.join(" ")} END,
               expected_lifespan = CASE ${lifespanClauses.join(" ")} END,
               years_lost = CASE ${lostClauses.join(" ")} END
             WHERE id = ANY($${paramIdx}::int[])`,
            params
          )
          updated += cases.length
        }
      }
      console.log(`  Updated ${updated} actors`)
    }

    // ---------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------
    console.log(`\n${prefix}Done.`)
    if (dryRun) {
      console.log("Run without --dry-run to apply changes.")
    }
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

const program = new Command()
  .name("sync-actor-death-fields")
  .description(
    "Sync deterministic death fields (manner, precision, covid, categories, age/lifespan) on actors table"
  )
  .option("-n, --dry-run", "Preview changes without applying them")
  .action(async (opts: Options) => {
    await run(opts)
  })

// Guard against running during test imports
if (process.env.NODE_ENV !== "test") {
  program.parse()
}
