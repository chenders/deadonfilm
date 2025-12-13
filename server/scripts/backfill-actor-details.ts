#!/usr/bin/env tsx
/**
 * Backfill script to fetch birthday, profile_path, and popularity from TMDB
 * for actors in the actor_appearances table.
 *
 * Usage:
 *   npm run backfill:actor-details              # Backfill actors missing data
 *   npm run backfill:actor-details -- --all     # Refresh all actors
 *   npm run backfill:actor-details -- --dry-run # Preview without updating
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { getPersonDetails } from "../src/lib/tmdb.js"

const program = new Command()
  .name("backfill-actor-details")
  .description("Fetch birthday, profile_path, and popularity from TMDB for actors")
  .option("-a, --all", "Refresh all actors, not just those missing data")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .option("-l, --limit <number>", "Limit number of actors to process", parseInt)
  .action(async (options) => {
    await runBackfill(options)
  })

interface BackfillOptions {
  all?: boolean
  dryRun?: boolean
  limit?: number
}

async function runBackfill(options: BackfillOptions) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  const { all = false, dryRun = false, limit } = options

  console.log("\nBackfilling actor details from TMDB...")
  if (dryRun) console.log("(DRY RUN - no changes will be made)")
  if (all) console.log("(Refreshing ALL actors)")
  if (limit) console.log(`(Limited to ${limit} actors)`)
  console.log()

  const db = getPool()

  try {
    // Get distinct actors that need updating
    // If --all, get all actors; otherwise only those missing birthday/profile_path/popularity
    const whereClause = all
      ? "1=1"
      : "(birthday IS NULL OR profile_path IS NULL OR popularity IS NULL)"

    const limitClause = limit ? `LIMIT ${limit}` : ""

    const result = await db.query<{
      actor_tmdb_id: number
      actor_name: string
    }>(`
      SELECT DISTINCT actor_tmdb_id, actor_name
      FROM actor_appearances
      WHERE ${whereClause}
      ORDER BY actor_tmdb_id
      ${limitClause}
    `)

    console.log(`Found ${result.rows.length} actors to process\n`)

    if (result.rows.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    let updated = 0
    let skipped = 0
    let errors = 0

    for (let i = 0; i < result.rows.length; i++) {
      const actor = result.rows[i]
      const progress = `[${i + 1}/${result.rows.length}]`

      try {
        const details = await getPersonDetails(actor.actor_tmdb_id)

        if (dryRun) {
          console.log(
            `${progress} ${actor.actor_name}: birthday=${details.birthday}, profile=${details.profile_path ? "yes" : "no"}, popularity=${details.popularity}`
          )
          updated++
        } else {
          // Update all rows for this actor in actor_appearances
          const updateResult = await db.query(
            `UPDATE actor_appearances
             SET birthday = $2,
                 profile_path = $3,
                 popularity = $4
             WHERE actor_tmdb_id = $1`,
            [actor.actor_tmdb_id, details.birthday, details.profile_path, details.popularity]
          )

          console.log(
            `${progress} ${actor.actor_name}: updated ${updateResult.rowCount} rows (birthday=${details.birthday || "null"}, pop=${details.popularity?.toFixed(1)})`
          )
          updated++
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        // Check if it's a 404 (actor not found on TMDB)
        if (errorMsg.includes("404")) {
          console.log(`${progress} ${actor.actor_name}: not found on TMDB, skipping`)
          skipped++
        } else {
          console.error(`${progress} ${actor.actor_name}: ERROR - ${errorMsg}`)
          errors++
        }
      }

      // Rate limit - TMDB API has limits (around 40 requests/10 seconds)
      await new Promise((resolve) => setTimeout(resolve, 260))
    }

    console.log("\nSummary:")
    console.log(`  Updated: ${updated}`)
    console.log(`  Skipped (not on TMDB): ${skipped}`)
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
