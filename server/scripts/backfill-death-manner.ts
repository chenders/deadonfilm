#!/usr/bin/env tsx
import "dotenv/config" // MUST be first import
import { Command } from "commander"
import pg from "pg"
import { VALID_NOTABLE_FACTORS, isViolentDeath } from "../src/lib/death-sources/claude-cleanup.js"

const { Pool } = pg

/**
 * Backfill death_manner for enriched actors missing it.
 *
 * Infers death_manner from notable_factors (plus manual overrides) for 293 v2.0.0
 * actors enriched before Feb 6 when manner wasn't persisted.
 *
 * Also:
 * - Derives violent_death from the inferred death_manner
 * - Removes non-standard notable_factors tags (respiratory, neurological, self-inflicted)
 *
 * Usage:
 *   npx tsx scripts/backfill-death-manner.ts --dry-run
 *   npx tsx scripts/backfill-death-manner.ts
 */

/**
 * Manual overrides for actors whose manner can't be inferred from notable_factors.
 * Keyed by actor name for readability; looked up by actor.id at runtime to avoid
 * false matches on non-unique names. The buildManualOverrideMap() function resolves
 * names to IDs from the query results.
 */
const MANUAL_MANNER_OVERRIDES_BY_NAME: Record<string, "natural" | "accident" | "undetermined"> = {
  "Christopher Allport": "accident", // avalanche
  "Colin Clive": "natural", // tuberculosis
  "Heather O'Rourke": "natural", // septic shock
  "Jim Morrison": "undetermined", // heart failure, suspicious circumstances
  "Maya Deren": "natural", // cerebral hemorrhage
  "Rock Hudson": "natural", // AIDS
  "William Holden": "accident", // accidental fall
}

/**
 * Build an ID-keyed override map from the query results.
 * Only includes actors that appear in both the override list and the query results.
 */
function buildManualOverrideMap(
  actors: Array<{ id: number; name: string }>
): Map<number, "natural" | "accident" | "undetermined"> {
  const map = new Map<number, "natural" | "accident" | "undetermined">()
  for (const actor of actors) {
    const manner = MANUAL_MANNER_OVERRIDES_BY_NAME[actor.name]
    if (manner) {
      map.set(actor.id, manner)
    }
  }
  return map
}

type DeathManner = "natural" | "accident" | "suicide" | "homicide" | "undetermined"

/**
 * Infer death_manner from notable_factors array.
 * Returns null if no inference can be made.
 */
function inferMannerFromFactors(factors: string[]): DeathManner | null {
  const has = (tag: string) => factors.includes(tag)

  if (has("homicide") || has("assassination")) return "homicide"
  if (has("suicide") && !has("homicide") && !has("assassination")) return "suicide"

  const accidentTags = [
    "vehicle_crash",
    "plane_crash",
    "drowning",
    "fire",
    "fall",
    "electrocution",
    "workplace_accident",
    "on_set",
  ]
  if (
    accidentTags.some((t) => has(t)) &&
    !has("suicide") &&
    !has("homicide") &&
    !has("assassination")
  ) {
    return "accident"
  }

  if (
    has("overdose") &&
    !has("suicide") &&
    !has("homicide") &&
    !has("assassination") &&
    !accidentTags.some((t) => has(t))
  ) {
    return "accident"
  }

  if (
    has("natural_causes") &&
    !has("homicide") &&
    !has("assassination") &&
    !has("suicide") &&
    !accidentTags.some((t) => has(t)) &&
    !has("overdose")
  ) {
    return "natural"
  }

  return null
}

interface ActorRow {
  id: number
  name: string
  death_manner: string | null
  violent_death: boolean | null
  notable_factors: string[] | null
  cause_of_death: string | null
}

async function runBackfill(options: { dryRun?: boolean }) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // 1. Find enriched actors missing death_manner
    const result = await pool.query<ActorRow>(
      `SELECT
        a.id,
        a.name,
        a.death_manner,
        a.violent_death,
        a.cause_of_death,
        adc.notable_factors
      FROM actors a
      JOIN actor_death_circumstances adc ON adc.actor_id = a.id
      WHERE adc.enriched_at IS NOT NULL
        AND a.death_manner IS NULL
      ORDER BY a.name`
    )

    const actors = result.rows
    console.log(`Found ${actors.length} enriched actors missing death_manner\n`)

    if (actors.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    // Build ID-keyed override map from query results
    const manualOverrides = buildManualOverrideMap(actors)

    let inferred = 0
    let manual = 0
    let unresolved = 0
    let violentUpdated = 0
    const mannerCounts: Record<string, number> = {}

    for (const actor of actors) {
      const factors = actor.notable_factors || []

      // Try manual override first (keyed by actor.id for uniqueness)
      let manner: DeathManner | null = null
      if (manualOverrides.has(actor.id)) {
        manner = manualOverrides.get(actor.id)!
        manual++
      } else {
        manner = inferMannerFromFactors(factors)
        if (manner) {
          inferred++
        } else {
          unresolved++
          console.log(
            `  ? ${actor.name} - could not infer (factors: [${factors.join(", ")}], cause: ${actor.cause_of_death || "null"})`
          )
          continue
        }
      }

      mannerCounts[manner] = (mannerCounts[manner] || 0) + 1
      const violent = isViolentDeath(manner) ?? false
      const violentChanged = actor.violent_death !== violent

      if (violentChanged) {
        violentUpdated++
      }

      if (options.dryRun) {
        const violentStr = violentChanged
          ? ` (violent_death: ${actor.violent_death} → ${violent})`
          : ""
        console.log(`  ${actor.name}: ${manner}${violentStr}`)
      } else {
        await pool.query(
          `UPDATE actors
           SET death_manner = $1,
               violent_death = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [manner, violent, actor.id]
        )
      }
    }

    // 2. Fix non-standard notable_factors tags
    // Only fetch rows that contain at least one tag NOT in the valid set
    console.log(`\n--- Fixing non-standard notable_factors ---`)
    const validTagsArray = Array.from(VALID_NOTABLE_FACTORS)
    const invalidTagsResult = await pool.query<{
      actor_id: number
      actor_name: string
      notable_factors: string[]
    }>(
      `SELECT adc.actor_id, a.name AS actor_name, adc.notable_factors
       FROM actor_death_circumstances adc
       JOIN actors a ON a.id = adc.actor_id
       WHERE adc.notable_factors IS NOT NULL
         AND adc.notable_factors != '{}'
         AND NOT adc.notable_factors <@ $1::text[]`,
      [validTagsArray]
    )

    let tagsFixed = 0
    for (const row of invalidTagsResult.rows) {
      const invalidTags = row.notable_factors.filter((f) => !VALID_NOTABLE_FACTORS.has(f))
      if (invalidTags.length === 0) continue

      const validTags = row.notable_factors.filter((f) => VALID_NOTABLE_FACTORS.has(f))
      tagsFixed++

      if (options.dryRun) {
        console.log(
          `  ${row.actor_name}: removing [${invalidTags.join(", ")}], keeping [${validTags.join(", ")}]`
        )
      } else {
        await pool.query(
          `UPDATE actor_death_circumstances
           SET notable_factors = $1,
               updated_at = NOW()
           WHERE actor_id = $2`,
          [validTags.length > 0 ? validTags : null, row.actor_id]
        )
        console.log(`  Fixed ${row.actor_name}: removed [${invalidTags.join(", ")}]`)
      }
    }

    // 3. Fix violent_death alignment for actors who already have death_manner
    console.log(`\n--- Aligning violent_death with death_manner ---`)
    const misalignedResult = await pool.query<{
      id: number
      name: string
      death_manner: string
      violent_death: boolean | null
    }>(
      `SELECT a.id, a.name, a.death_manner, a.violent_death
       FROM actors a
       WHERE a.death_manner IS NOT NULL
         AND (
           a.violent_death IS NULL
           OR a.violent_death != (a.death_manner IN ('homicide', 'suicide', 'accident'))
         )`
    )

    let violentAligned = 0
    for (const row of misalignedResult.rows) {
      const shouldBeViolent = isViolentDeath(row.death_manner) ?? false
      violentAligned++

      if (options.dryRun) {
        console.log(
          `  ${row.name}: violent_death ${row.violent_death} → ${shouldBeViolent} (manner: ${row.death_manner})`
        )
      } else {
        await pool.query(`UPDATE actors SET violent_death = $1, updated_at = NOW() WHERE id = $2`, [
          shouldBeViolent,
          row.id,
        ])
      }
    }

    // Summary
    console.log(`\n--- Summary ---`)
    console.log(`Death manner backfill:`)
    console.log(`  Inferred from notable_factors: ${inferred}`)
    console.log(`  Manual overrides: ${manual}`)
    console.log(`  Unresolved: ${unresolved}`)
    console.log(`  violent_death updated: ${violentUpdated}`)
    console.log(`\n  Manner breakdown:`)
    for (const [manner, count] of Object.entries(mannerCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${manner}: ${count}`)
    }
    console.log(`\nNotable factors cleanup:`)
    console.log(`  Actors with invalid tags fixed: ${tagsFixed}`)
    console.log(`\nViolent death alignment:`)
    console.log(`  Actors realigned: ${violentAligned}`)

    if (options.dryRun) {
      console.log(`\nDry run complete - no changes made`)
    }
  } catch (error) {
    console.error("Fatal error:", error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

const program = new Command()
  .name("backfill-death-manner")
  .description(
    "Backfill death_manner from notable_factors for enriched actors, fix non-standard tags, and align violent_death"
  )
  .option("-n, --dry-run", "Preview changes without updating database")
  .action(async (options: { dryRun?: boolean }) => {
    await runBackfill(options)
  })

program.parse()
