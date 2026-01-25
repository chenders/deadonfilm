#!/usr/bin/env tsx
/**
 * Check database for recent deaths and future deaths.
 */
import { getPool } from "../src/lib/db.js"

async function main() {
  const db = getPool()

  try {
    // Check for future deaths
    const futureResult = await db.query(
      "SELECT COUNT(*) as count FROM actors WHERE deathday > CURRENT_DATE"
    )
    console.log("Actors with future death dates:", futureResult.rows[0].count)

    // Check most recent deaths
    const recentResult = await db.query(
      `SELECT id, tmdb_id, name, deathday
       FROM actors
       WHERE deathday IS NOT NULL
       ORDER BY deathday DESC
       LIMIT 10`
    )
    console.log("\nMost recent deaths in database:")
    recentResult.rows.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} - ${r.deathday}`)
    })
  } finally {
    await db.end()
  }
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
