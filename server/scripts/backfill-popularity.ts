#!/usr/bin/env tsx
/**
 * Backfill popularity scores for actors missing them.
 *
 * Usage:
 *   npx tsx scripts/backfill-popularity.ts --limit 100 --dry-run
 *   npx tsx scripts/backfill-popularity.ts --limit 1000
 *   npx tsx scripts/backfill-popularity.ts --deceased-only --limit 500
 */
import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { getPersonDetails } from "../src/lib/tmdb.js"

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

const program = new Command()
  .name("backfill-popularity")
  .description("Backfill TMDB popularity scores for actors missing them")
  .option("-l, --limit <n>", "Maximum number of actors to process", parsePositiveInt, 100)
  .option("-n, --dry-run", "Show what would be updated without making changes")
  .option(
    "-d, --deceased-only",
    "Only backfill deceased actors (prioritize death enrichment candidates)"
  )
  .option("--delay <ms>", "Delay between TMDB API calls in milliseconds", parsePositiveInt, 100)
  .action(async (options) => {
    const { limit, dryRun, deceasedOnly, delay } = options
    const db = getPool()

    try {
      // Query actors with NULL popularity
      const query = `
        SELECT id, tmdb_id, name, deathday
        FROM actors
        WHERE tmdb_id IS NOT NULL
          AND popularity IS NULL
          ${deceasedOnly ? "AND deathday IS NOT NULL" : ""}
        ORDER BY
          CASE WHEN deathday IS NOT NULL THEN 0 ELSE 1 END,
          id
        LIMIT $1
      `

      const result = await db.query<{
        id: number
        tmdb_id: number
        name: string
        deathday: string | null
      }>(query, [limit])

      console.log(`Found ${result.rows.length} actors with NULL popularity`)

      if (result.rows.length === 0) {
        console.log("Nothing to do!")
        return
      }

      if (dryRun) {
        console.log("\n--dry-run mode: showing first 20 actors that would be updated:\n")
        for (const actor of result.rows.slice(0, 20)) {
          const status = actor.deathday ? "(deceased)" : "(living)"
          console.log(`  ${actor.name} - TMDB ${actor.tmdb_id} ${status}`)
        }
        if (result.rows.length > 20) {
          console.log(`  ... and ${result.rows.length - 20} more`)
        }
        return
      }

      // Process actors
      let updated = 0
      let failed = 0
      let notFound = 0

      console.log("\nProcessing actors...\n")

      for (let i = 0; i < result.rows.length; i++) {
        const actor = result.rows[i]
        const progress = `[${i + 1}/${result.rows.length}]`

        try {
          const person = await getPersonDetails(actor.tmdb_id)

          if (person && person.popularity !== undefined) {
            await db.query(
              `UPDATE actors SET popularity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [person.popularity, actor.id]
            )
            console.log(`${progress} ${actor.name}: popularity = ${person.popularity}`)
            updated++
          } else {
            console.log(`${progress} ${actor.name}: no popularity data from TMDB`)
            notFound++
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error"
          // Check if it's a 404 (person not found on TMDB)
          if (message.includes("404") || message.includes("not found")) {
            console.log(`${progress} ${actor.name}: not found on TMDB (404)`)
            notFound++
          } else {
            console.error(`${progress} ${actor.name}: ERROR - ${message}`)
            failed++
          }
        }

        // Rate limiting
        if (i < result.rows.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }

      console.log("\n--- Summary ---")
      console.log(`Updated: ${updated}`)
      console.log(`Not found on TMDB: ${notFound}`)
      console.log(`Failed: ${failed}`)
      console.log(`Total processed: ${result.rows.length}`)

      // Show remaining count
      const remainingResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM actors WHERE tmdb_id IS NOT NULL AND popularity IS NULL ${deceasedOnly ? "AND deathday IS NOT NULL" : ""}`
      )
      const remaining = parseInt(remainingResult.rows[0].count, 10)
      if (remaining > 0) {
        console.log(`\nRemaining actors with NULL popularity: ${remaining}`)
        console.log(`Run again with --limit ${Math.min(remaining, 1000)} to continue`)
      } else {
        console.log("\nAll actors now have popularity scores!")
      }
    } finally {
      await resetPool()
    }
  })

program.parse()
