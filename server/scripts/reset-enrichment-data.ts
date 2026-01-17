#!/usr/bin/env tsx
/**
 * Reset death enrichment data so actors can be re-processed.
 *
 * This script finds actors who have been previously enriched (have both
 * has_detailed_death_info set AND entries in actor_death_info_history) and
 * resets their enrichment data so they can be run through the new enrichment version.
 *
 * Usage:
 *   npx tsx server/scripts/reset-enrichment-data.ts              # Reset all eligible actors
 *   npx tsx server/scripts/reset-enrichment-data.ts --dry-run    # Preview without changes
 *   npx tsx server/scripts/reset-enrichment-data.ts --tmdb-id 3026  # Reset specific actor
 */

import "dotenv/config"
import { Command } from "commander"
import pg from "pg"

const { Pool } = pg

interface AffectedActor {
  id: number
  name: string
  tmdb_id: number | null
  has_detailed_death_info: boolean
  history_count: number
}

interface ResetOptions {
  dryRun?: boolean
  tmdbId?: number
}

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("Must be a positive integer")
  }
  return n
}

const program = new Command()
  .name("reset-enrichment-data")
  .description("Reset death enrichment data so actors can be re-processed")
  .option("-n, --dry-run", "Preview changes without making them")
  .option(
    "-t, --tmdb-id <id>",
    "Reset only the actor with this TMDB ID (e.g., 3026)",
    parsePositiveInt
  )
  .action(async (options: ResetOptions) => {
    await runReset(options)
  })

async function runReset(options: ResetOptions) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  try {
    // When --tmdb-id is provided, find that specific actor (even without history)
    // Otherwise, find actors with has_detailed_death_info NOT NULL AND entries in actor_death_info_history
    let findQuery: string
    let queryParams: (string | number)[] = []

    if (options.tmdbId) {
      // For specific actor, reset even if no history exists
      findQuery = `
        SELECT
          a.id,
          a.name,
          a.tmdb_id,
          a.has_detailed_death_info,
          COALESCE(COUNT(h.id), 0)::integer as history_count
        FROM actors a
        LEFT JOIN actor_death_info_history h ON h.actor_id = a.id
        WHERE a.tmdb_id = $1
        GROUP BY a.id, a.name, a.tmdb_id, a.has_detailed_death_info
      `
      queryParams = [options.tmdbId]
    } else {
      findQuery = `
        SELECT
          a.id,
          a.name,
          a.tmdb_id,
          a.has_detailed_death_info,
          COUNT(h.id)::integer as history_count
        FROM actors a
        INNER JOIN actor_death_info_history h ON h.actor_id = a.id
        WHERE a.has_detailed_death_info IS NOT NULL
        GROUP BY a.id, a.name, a.tmdb_id, a.has_detailed_death_info
        ORDER BY a.name
      `
    }

    const result = await pool.query<AffectedActor>(findQuery, queryParams)
    const actors = result.rows

    if (options.tmdbId && actors.length === 0) {
      console.error(`No actor found with TMDB ID: ${options.tmdbId}`)
      process.exit(1)
    }

    const modeLabel = options.tmdbId ? ` for TMDB ID ${options.tmdbId}` : ""
    console.log(
      `Found ${actors.length} actor(s) to reset${modeLabel}${options.dryRun ? " (dry run)" : ""}\n`
    )

    if (actors.length === 0) {
      console.log("No actors need resetting. Done!")
      return
    }

    // Show affected actors
    if (options.tmdbId) {
      // Single actor mode - show full details
      const actor = actors[0]
      console.log(`Actor to reset:`)
      console.log(`  Name: ${actor.name}`)
      console.log(`  ID: ${actor.id}`)
      console.log(`  TMDB ID: ${actor.tmdb_id}`)
      console.log(`  Has detailed death info: ${actor.has_detailed_death_info}`)
      console.log(`  History entries: ${actor.history_count}`)
    } else {
      // Batch mode - show sample
      const sampleSize = Math.min(10, actors.length)
      console.log(`Sample of affected actors (showing ${sampleSize} of ${actors.length}):`)
      for (let i = 0; i < sampleSize; i++) {
        const actor = actors[i]
        console.log(`  - ${actor.name} (id: ${actor.id}, history entries: ${actor.history_count})`)
      }
      if (actors.length > sampleSize) {
        console.log(`  ... and ${actors.length - sampleSize} more`)
      }
    }
    console.log()

    if (options.dryRun) {
      console.log("Dry run complete - no changes made")
      console.log("\nWould perform the following actions:")
      console.log(`  - Set has_detailed_death_info = NULL for ${actors.length} actors`)
      console.log(`  - Set enriched_at = NULL for ${actors.length} actors`)
      console.log(`  - Set enrichment_source = NULL for ${actors.length} actors`)
      console.log(`  - Set enrichment_version = NULL for ${actors.length} actors`)
      console.log(`  - Delete actor_death_info_history entries for these actors`)
      console.log(`  - Delete actor_death_circumstances records for these actors`)
      return
    }

    // Get actor IDs for the queries
    const actorIds = actors.map((a) => a.id)

    // Execute all changes in a transaction
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // 1. Reset actors table columns
      const updateResult = await client.query(
        `UPDATE actors SET
          has_detailed_death_info = NULL,
          enriched_at = NULL,
          enrichment_source = NULL,
          enrichment_version = NULL
        WHERE id = ANY($1)`,
        [actorIds]
      )
      console.log(`Updated ${updateResult.rowCount} actors`)

      // 2. Delete from actor_death_info_history
      const historyResult = await client.query(
        "DELETE FROM actor_death_info_history WHERE actor_id = ANY($1)",
        [actorIds]
      )
      console.log(`Deleted ${historyResult.rowCount} history entries`)

      // 3. Delete from actor_death_circumstances
      const circumstancesResult = await client.query(
        "DELETE FROM actor_death_circumstances WHERE actor_id = ANY($1)",
        [actorIds]
      )
      console.log(`Deleted ${circumstancesResult.rowCount} circumstances records`)

      await client.query("COMMIT")
      console.log("\nReset complete!")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

program.parse()
