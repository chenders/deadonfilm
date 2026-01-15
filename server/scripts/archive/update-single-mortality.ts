#!/usr/bin/env tsx
/**
 * Update mortality stats for a single person by TMDB ID
 *
 * Usage:
 *   npx tsx scripts/update-single-mortality.ts <tmdbId>
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../../src/lib/db.js"
import { calculateYearsLost } from "../../src/lib/mortality-stats.js"

function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

const program = new Command()
  .name("update-single-mortality")
  .description("Update mortality stats for a single person by TMDB ID")
  .argument("<tmdbId>", "TMDB person ID", parsePositiveInt)
  .action(async (tmdbId: number) => {
    await runUpdate(tmdbId)
  })

async function runUpdate(tmdbId: number) {
  const db = getPool()

  const result = await db.query<{
    tmdb_id: number
    name: string
    birthday: string | null
    deathday: string
  }>(
    `
    SELECT tmdb_id, name, birthday::text, deathday::text
    FROM actors
    WHERE tmdb_id = $1 AND deathday IS NOT NULL
  `,
    [tmdbId]
  )

  if (result.rows.length === 0) {
    console.error(`Person with TMDB ID ${tmdbId} not found`)
    await db.end()
    process.exit(1)
  }

  const person = result.rows[0]
  console.log(`Found: ${person.name}`)
  console.log(`  Birthday: ${person.birthday}`)
  console.log(`  Deathday: ${person.deathday}`)

  if (!person.birthday) {
    console.error("  No birthday on record - cannot calculate")
    await db.end()
    process.exit(1)
  }

  const stats = await calculateYearsLost(person.birthday, person.deathday)

  if (stats) {
    await db.query(
      `UPDATE actors
       SET age_at_death = $2, expected_lifespan = $3, years_lost = $4, updated_at = CURRENT_TIMESTAMP
       WHERE tmdb_id = $1`,
      [person.tmdb_id, stats.ageAtDeath, stats.expectedLifespan, stats.yearsLost]
    )
    console.log("\nUpdated!")
    console.log(`  Age at death: ${stats.ageAtDeath}`)
    console.log(`  Expected lifespan: ${stats.expectedLifespan.toFixed(1)}`)
    console.log(`  Years lost: ${stats.yearsLost.toFixed(1)}`)
  } else {
    console.error("Could not calculate mortality stats")
  }

  await db.end()
}

program.parse()
