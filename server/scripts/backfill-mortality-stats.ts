#!/usr/bin/env tsx
/**
 * Backfill script to populate age_at_death, expected_lifespan, and years_lost
 * for existing deceased actors.
 *
 * Uses birth-year-specific cohort life expectancy from US SSA Actuarial Study No. 120.
 *
 * Usage:
 *   npm run backfill:mortality         # Only update records with NULL values
 *   npm run backfill:mortality -- --all  # Update ALL records (recalculate)
 *
 * The --all flag is useful after changing the life expectancy calculation method.
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { calculateYearsLost } from "../src/lib/mortality-stats.js"

const program = new Command()
  .name("backfill-mortality-stats")
  .description("Backfill mortality statistics for deceased actors")
  .option("-a, --all", "Update ALL records (recalculate), not just NULL values")
  .action(async (options: { all?: boolean }) => {
    await runBackfill(options.all ?? false)
  })

async function runBackfill(updateAll: boolean) {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  console.log("\nBackfilling mortality statistics for deceased persons...")
  console.log(`Mode: ${updateAll ? "ALL records (recalculate)" : "Only NULL values"}\n`)

  const db = getPool()

  try {
    // Get deceased persons that need backfilling
    // Cast dates to text to get string format for the calculation function
    const whereClause = updateAll ? "" : "AND age_at_death IS NULL"
    const result = await db.query<{
      tmdb_id: number
      name: string
      birthday: string | null
      deathday: string
    }>(`
      SELECT tmdb_id, name, birthday::text, deathday::text
      FROM actors
      WHERE birthday IS NOT NULL
        ${whereClause}
      ORDER BY tmdb_id
    `)

    console.log(`Found ${result.rows.length} records to backfill\n`)

    if (result.rows.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    let updated = 0
    let skipped = 0

    for (let i = 0; i < result.rows.length; i++) {
      const person = result.rows[i]
      console.log(`  [${i + 1}/${result.rows.length}] ${person.name}...`)

      try {
        const mortalityStats = await calculateYearsLost(person.birthday, person.deathday)

        if (mortalityStats) {
          await db.query(
            `UPDATE actors
             SET age_at_death = $2,
                 expected_lifespan = $3,
                 years_lost = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE tmdb_id = $1`,
            [
              person.tmdb_id,
              mortalityStats.ageAtDeath,
              mortalityStats.expectedLifespan,
              mortalityStats.yearsLost,
            ]
          )
          // Format the output with clear language
          const yearsLost = mortalityStats.yearsLost
          const lifeDescription =
            yearsLost > 0
              ? `${yearsLost.toFixed(1)} years early`
              : yearsLost < 0
                ? `${Math.abs(yearsLost).toFixed(1)} years longer than expected`
                : `around expected age`
          console.log(
            `    -> Age ${mortalityStats.ageAtDeath} (expected ${mortalityStats.expectedLifespan.toFixed(1)}), ${lifeDescription}`
          )
          updated++
        } else {
          console.log(`    -> (could not calculate - missing data)`)
          skipped++
        }
      } catch (error) {
        console.error(`    Error: ${error}`)
        skipped++
      }
    }

    console.log("\nSummary:")
    console.log(`  Updated: ${updated}`)
    console.log(`  Skipped: ${skipped}`)
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

program.parse()
