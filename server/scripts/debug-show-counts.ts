#!/usr/bin/env tsx
import "dotenv/config"
import { getPool } from "../src/lib/db.js"

async function main() {
  const db = getPool()
  const showId = 4087

  const totalAppearances = await db.query(
    "SELECT COUNT(DISTINCT actor_tmdb_id) as total FROM actor_show_appearances WHERE show_tmdb_id = $1",
    [showId]
  )
  console.log("Total unique actors in appearances table:", totalAppearances.rows[0].total)

  const actorsInTable = await db.query(
    "SELECT COUNT(*) as total FROM actors WHERE tmdb_id IN (SELECT DISTINCT actor_tmdb_id FROM actor_show_appearances WHERE show_tmdb_id = $1)",
    [showId]
  )
  console.log("Of those, found in actors table:", actorsInTable.rows[0].total)

  const deceased = await db.query(
    "SELECT COUNT(*) as total FROM actors WHERE deathday IS NOT NULL AND tmdb_id IN (SELECT DISTINCT actor_tmdb_id FROM actor_show_appearances WHERE show_tmdb_id = $1)",
    [showId]
  )
  console.log("Deceased actors:", deceased.rows[0].total)

  const living = await db.query(
    "SELECT COUNT(*) as total FROM actors WHERE deathday IS NULL AND tmdb_id IN (SELECT DISTINCT actor_tmdb_id FROM actor_show_appearances WHERE show_tmdb_id = $1)",
    [showId]
  )
  console.log("Living actors:", living.rows[0].total)

  // Check what the API route actually queries
  const showRow = await db.query("SELECT * FROM shows WHERE tmdb_id = $1", [showId])
  console.log("\nShow deceased_count from shows table:", showRow.rows[0]?.deceased_count)
  console.log("Show cast_count from shows table:", showRow.rows[0]?.cast_count)

  await db.end()
}

main().catch(console.error)
