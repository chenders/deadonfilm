#!/usr/bin/env tsx
/**
 * Debug why getRecentDeaths returns old data.
 */
import { getPool } from "../src/lib/db.js"
import { getRecentDeaths } from "../src/lib/db/deaths-discovery.js"

async function main() {
  const db = getPool()

  try {
    // Get the actual most recent deaths from the database without filters
    console.log("Most recent deaths in database (no filters):")
    const allRecent = await db.query(
      `SELECT id, tmdb_id, name, deathday, is_obscure
       FROM actors
       WHERE deathday IS NOT NULL
       ORDER BY deathday DESC
       LIMIT 10`
    )
    allRecent.rows.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} - ${r.deathday} (obscure: ${r.is_obscure})`)
    })

    // Check appearance counts for the top 10
    console.log("\nAppearance counts for top 10:")
    for (const actor of allRecent.rows) {
      const counts = await db.query(
        `SELECT
           COUNT(DISTINCT ama.movie_tmdb_id) as movie_count,
           COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) as episode_count
         FROM actors a
         LEFT JOIN actor_movie_appearances ama ON ama.actor_id = a.id
         LEFT JOIN actor_show_appearances asa ON asa.actor_id = a.id
         WHERE a.id = $1
         GROUP BY a.id`,
        [actor.id]
      )
      const c = counts.rows[0]
      const meetsThreshold = c.movie_count >= 2 || c.episode_count >= 10
      console.log(
        `  ${actor.name}: ${c.movie_count} movies, ${c.episode_count} episodes - ${meetsThreshold ? "✅ MEETS" : "❌ BELOW"} threshold`
      )
    }

    // Now get what getRecentDeaths actually returns
    console.log("\nWhat getRecentDeaths(10) returns:")
    const filtered = await getRecentDeaths(10)
    filtered.forEach((r, i) => {
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
