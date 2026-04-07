#!/usr/bin/env tsx
/**
 * Backfill place_of_birth from TMDB API for all actors.
 *
 * Fetches person details from TMDB and stores place_of_birth in the actors table.
 * Once complete, the actor route can use the stored value instead of calling TMDB
 * on every page load.
 *
 * Usage:
 *   cd server && npx tsx scripts/backfill-place-of-birth.ts [--limit N] [--dry-run]
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { Pool } from "pg"

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0)
    throw new InvalidArgumentError("Must be positive integer")
  return n
}

const program = new Command()
  .name("backfill-place-of-birth")
  .description("Backfill place_of_birth from TMDB API for actors missing it")
  .option("-n, --limit <n>", "Max actors to process", parsePositiveInt)
  .option("--dry-run", "Preview without updating")
  .option("--batch-size <n>", "Actors per batch", parsePositiveInt, 50)
  .action(async (opts) => {
    await run(opts)
  })

interface Options {
  limit?: number
  dryRun?: boolean
  batchSize: number
}

async function run(options: Options): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const tmdbToken = process.env.TMDB_API_TOKEN

  if (!tmdbToken) {
    console.error("TMDB_API_TOKEN is required")
    process.exitCode = 1
    return
  }

  try {
    // Find actors with tmdb_id but no place_of_birth
    const countResult = await pool.query(
      "SELECT COUNT(*) as cnt FROM actors WHERE tmdb_id IS NOT NULL AND place_of_birth IS NULL"
    )
    const total = parseInt(countResult.rows[0]?.cnt ?? "0", 10)
    const limit = options.limit ?? total
    console.log(`Found ${total} actors without place_of_birth (processing ${limit})`)

    if (options.dryRun) {
      console.log("Dry run — no updates will be made")
    }

    let processed = 0
    let updated = 0
    let errors = 0

    while (processed < limit) {
      const batchSize = Math.min(options.batchSize, limit - processed)
      const batch = await pool.query<{ id: number; tmdb_id: number; name: string }>(
        `SELECT id, tmdb_id, name FROM actors
         WHERE tmdb_id IS NOT NULL AND place_of_birth IS NULL
         ORDER BY dof_popularity DESC NULLS LAST
         LIMIT $1`,
        [batchSize]
      )

      if (batch.rows.length === 0) break

      for (const actor of batch.rows) {
        try {
          const response = await fetch(`https://api.themoviedb.org/3/person/${actor.tmdb_id}`, {
            headers: { Authorization: `Bearer ${tmdbToken}` },
            signal: AbortSignal.timeout(10000),
          })

          if (!response.ok) {
            console.warn(`  TMDB ${response.status} for ${actor.name} (tmdb_id: ${actor.tmdb_id})`)
            errors++
            // Still mark as processed to avoid infinite loop — set to empty string
            if (!options.dryRun) {
              await pool.query("UPDATE actors SET place_of_birth = '' WHERE id = $1", [actor.id])
            }
            continue
          }

          const data = (await response.json()) as { place_of_birth: string | null }
          const placeOfBirth = data.place_of_birth || ""

          if (!options.dryRun) {
            await pool.query("UPDATE actors SET place_of_birth = $1 WHERE id = $2", [
              placeOfBirth,
              actor.id,
            ])
          }

          updated++
          if (updated % 100 === 0) {
            console.log(`  Processed ${updated}/${limit} (${errors} errors)`)
          }

          // Rate limit: TMDB allows ~40 req/s, be conservative
          await new Promise((resolve) => setTimeout(resolve, 50))
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.warn(`  Error for ${actor.name}: ${msg}`)
          errors++
        }

        processed++
        if (processed >= limit) break
      }
    }

    console.log(`\nDone: ${updated} updated, ${errors} errors, ${processed} processed`)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

program.parse()
