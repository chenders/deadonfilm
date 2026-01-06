#!/usr/bin/env tsx
import "dotenv/config"
import { getPool, resetPool } from "../src/lib/db.js"

async function main() {
  const db = getPool()

  console.log("Clearing all death-related fields for deceased actors...")

  const result = await db.query(`
    UPDATE actors SET
      cause_of_death = NULL,
      cause_of_death_details = NULL,
      cause_of_death_source = NULL,
      cause_of_death_details_source = NULL,
      cause_of_death_checked_at = NULL,
      death_manner = NULL,
      death_categories = NULL,
      covid_related = NULL,
      strange_death = NULL,
      has_detailed_death_info = NULL
    WHERE deathday IS NOT NULL
  `)
  console.log(`Updated ${result.rowCount} actors`)

  console.log("Deleting actor_death_circumstances records...")
  const deleteResult = await db.query("DELETE FROM actor_death_circumstances")
  console.log(`Deleted ${deleteResult.rowCount} circumstances records`)

  await resetPool()
  console.log("Done!")
}

main().catch(console.error)
