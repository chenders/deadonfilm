#!/usr/bin/env tsx
/**
 * Backfill script to fetch missing profile photos from TMDB for deceased actors.
 *
 * Usage:
 *   npm run backfill:profiles
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { getPersonDetails } from "../src/lib/tmdb.js"

const program = new Command()
  .name("backfill-profile-paths")
  .description("Fetch missing profile photos from TMDB for deceased actors")
  .action(async () => {
    await runBackfill()
  })

async function runBackfill() {
  // Check required environment variables
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  console.log("\nBackfilling missing profile photos for deceased actors...\n")

  const db = getPool()

  try {
    // Get all deceased persons missing profile_path
    const result = await db.query<{
      tmdb_id: number
      name: string
    }>(`
      SELECT tmdb_id, name
      FROM deceased_persons
      WHERE profile_path IS NULL
      ORDER BY deathday DESC
    `)

    console.log(`Found ${result.rows.length} actors missing profile photos\n`)

    if (result.rows.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    let updated = 0
    let notAvailable = 0
    let errors = 0

    for (let i = 0; i < result.rows.length; i++) {
      const person = result.rows[i]
      console.log(`  [${i + 1}/${result.rows.length}] ${person.name}...`)

      try {
        const details = await getPersonDetails(person.tmdb_id)

        if (details.profile_path) {
          await db.query(
            `UPDATE deceased_persons
             SET profile_path = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE tmdb_id = $1`,
            [person.tmdb_id, details.profile_path]
          )
          console.log(`    -> Found: ${details.profile_path}`)
          updated++
        } else {
          console.log(`    -> No photo available on TMDB`)
          notAvailable++
        }
      } catch (error) {
        console.error(`    -> Error: ${error}`)
        errors++
      }

      // Rate limit - TMDB API has limits (around 40 requests/10 seconds)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }

    console.log("\nSummary:")
    console.log(`  Updated: ${updated}`)
    console.log(`  No photo on TMDB: ${notAvailable}`)
    console.log(`  Errors: ${errors}`)
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

program.parse()
