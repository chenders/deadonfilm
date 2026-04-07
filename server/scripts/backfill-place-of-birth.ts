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
  .action(async (opts) => {
    await run(opts)
  })

interface Options {
  limit?: number
  dryRun?: boolean
}

async function run(options: Options): Promise<void> {
  const tmdbToken = process.env.TMDB_API_TOKEN
  const databaseUrl = process.env.DATABASE_URL

  if (!tmdbToken) {
    console.error("TMDB_API_TOKEN is required")
    process.exitCode = 1
    return
  }

  if (!databaseUrl) {
    console.error("DATABASE_URL is required")
    process.exitCode = 1
    return
  }

  const pool = new Pool({ connectionString: databaseUrl })

  try {
    // Select all candidate IDs up front to avoid re-querying the same rows in dry-run mode
    const query = options.limit
      ? {
          text: `SELECT id, tmdb_id, name FROM actors
                 WHERE tmdb_id IS NOT NULL AND place_of_birth IS NULL
                 ORDER BY dof_popularity DESC NULLS LAST
                 LIMIT $1`,
          values: [options.limit],
        }
      : {
          text: `SELECT id, tmdb_id, name FROM actors
                 WHERE tmdb_id IS NOT NULL AND place_of_birth IS NULL
                 ORDER BY dof_popularity DESC NULLS LAST`,
          values: [],
        }
    const candidates = await pool.query<{ id: number; tmdb_id: number; name: string }>(query)

    console.log(`Found ${candidates.rows.length} actors without place_of_birth`)

    if (options.dryRun) {
      console.log("Dry run — no updates will be made")
    }

    let updated = 0
    let skipped = 0
    let errors = 0

    for (const actor of candidates.rows) {
      try {
        const response = await fetch(`https://api.themoviedb.org/3/person/${actor.tmdb_id}`, {
          headers: { Authorization: `Bearer ${tmdbToken}` },
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          console.warn(`  TMDB ${response.status} for ${actor.name} (tmdb_id: ${actor.tmdb_id})`)
          errors++
          continue
        }

        const data = (await response.json()) as { place_of_birth: string | null }

        if (!data.place_of_birth) {
          skipped++
          continue
        }

        if (options.dryRun) {
          console.log(`  ${actor.name}: ${data.place_of_birth}`)
        } else {
          await pool.query("UPDATE actors SET place_of_birth = $1 WHERE id = $2", [
            data.place_of_birth,
            actor.id,
          ])
        }

        updated++
        if (updated % 100 === 0) {
          console.log(`  Processed ${updated}/${candidates.rows.length} (${errors} errors)`)
        }

        // Rate limit: TMDB allows ~40 req/s, be conservative
        await new Promise((resolve) => setTimeout(resolve, 50))
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`  Error for ${actor.name}: ${msg}`)
        errors++
      }
    }

    console.log(`\nDone: ${updated} updated, ${skipped} skipped (no TMDB data), ${errors} errors`)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

program.parse()
