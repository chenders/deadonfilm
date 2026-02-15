#!/usr/bin/env tsx
/**
 * One-off fix for actors with death_manner='undetermined' but manner-specific
 * categories (homicide, suicide, accident) in death_categories.
 *
 * This inconsistency was caused by the sync script overwriting Claude's
 * context-aware manner determination with generic cause-text-based mappings
 * that default to 'undetermined' for ambiguous causes.
 *
 * For each mismatched actor:
 * 1. Sets death_manner to the manner-like category value
 * 2. Recomputes death_categories with the corrected manner
 * 3. Updates violent_death boolean
 *
 * Usage:
 *   npx tsx scripts/fix-manner-category-mismatch.ts [--dry-run]
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db/pool.js"
import { computeCategories } from "./sync-actor-death-fields.js"
import { isViolentDeath } from "../src/lib/death-sources/claude-cleanup.js"

interface Options {
  dryRun: boolean
}

const MANNER_SLUGS = ["homicide", "suicide", "accident"] as const

const FIND_MISMATCHED = `
  SELECT id, name, death_manner, death_categories, cause_of_death
  FROM actors
  WHERE death_manner = 'undetermined'
    AND (
      'homicide' = ANY(death_categories)
      OR 'suicide' = ANY(death_categories)
      OR 'accident' = ANY(death_categories)
    )
  ORDER BY name
`

async function run(options: Options) {
  const pool = getPool()
  const { dryRun } = options
  const prefix = dryRun ? "[DRY RUN] " : ""

  try {
    const { rows } = await pool.query<{
      id: number
      name: string
      death_manner: string
      death_categories: string[]
      cause_of_death: string | null
    }>(FIND_MISMATCHED)

    console.log(`${prefix}Found ${rows.length} actors with manner/category mismatch\n`)

    if (rows.length === 0) {
      console.log("Nothing to fix.")
      return
    }

    let updated = 0
    for (const row of rows) {
      // Determine correct manner from categories
      const correctManner = MANNER_SLUGS.find((m) => row.death_categories.includes(m))
      if (!correctManner) continue

      // Recompute categories with corrected manner
      const newCategories = computeCategories(row.cause_of_death, correctManner)
      const violentDeath = isViolentDeath(correctManner)

      console.log(
        `${prefix}${row.name} (id=${row.id}): ` +
          `manner: undetermined → ${correctManner}, ` +
          `categories: [${row.death_categories.join(", ")}] → [${newCategories.join(", ")}], ` +
          `violent_death: ${violentDeath}`
      )

      if (!dryRun) {
        await pool.query(
          `UPDATE actors
           SET death_manner = $1, death_categories = $2, violent_death = $3, updated_at = NOW()
           WHERE id = $4`,
          [correctManner, newCategories, violentDeath, row.id]
        )
      }
      updated++
    }

    console.log(`\n${prefix}Updated ${updated} actors.`)
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
  .name("fix-manner-category-mismatch")
  .description(
    "Fix actors with undetermined manner but manner-specific categories (one-off data fix)"
  )
  .option("-n, --dry-run", "Preview changes without applying them")
  .action(async (opts: Options) => {
    await run(opts)
  })

program.parse()
