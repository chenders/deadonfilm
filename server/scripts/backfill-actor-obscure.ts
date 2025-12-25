#!/usr/bin/env tsx
/**
 * Backfill script to populate the popularity column in deceased_persons table.
 * The is_obscure column is computed automatically based on profile_path and popularity.
 *
 * An actor is considered "obscure" if:
 * - No profile photo (profile_path IS NULL)
 * - OR low popularity (< 5.0)
 *
 * Usage:
 *   npm run backfill:actor-obscure              # Backfill actors missing popularity
 *   npm run backfill:actor-obscure -- --all     # Refresh all actors
 *   npm run backfill:actor-obscure -- --dry-run # Preview without updating
 *   npm run backfill:actor-obscure -- --stats   # Show obscure statistics only
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { getPersonDetails } from "../src/lib/tmdb.js"

// Popularity threshold for obscure actors (matches Death Watch feature)
export const OBSCURE_POPULARITY_THRESHOLD = 5.0

// Rate limiting delay (TMDB allows ~40 requests/10 seconds)
const API_DELAY_MS = 260

interface BackfillOptions {
  all?: boolean
  dryRun?: boolean
  limit?: number
  stats?: boolean
}

interface ActorRow {
  tmdb_id: number
  name: string
  profile_path: string | null
  popularity: number | null
}

interface PopularityResult {
  popularity: number | null
}

const program = new Command()
  .name("backfill-actor-obscure")
  .description("Populate popularity for deceased actors to enable obscure filtering")
  .option("-a, --all", "Refresh all actors, not just those missing popularity")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .option("-l, --limit <number>", "Limit number of actors to process", parseInt)
  .option("-s, --stats", "Show obscure statistics only, without backfilling")
  .action(async (options) => {
    await runBackfill(options)
  })

async function showStats(): Promise<void> {
  const db = getPool()

  try {
    // Get overall stats
    const result = await db.query<{
      total: string
      with_popularity: string
      without_popularity: string
      obscure: string
      not_obscure: string
      no_profile: string
      low_popularity: string
    }>(`
      SELECT
        COUNT(*)::text as total,
        COUNT(popularity)::text as with_popularity,
        (COUNT(*) - COUNT(popularity))::text as without_popularity,
        COUNT(*) FILTER (WHERE is_obscure = true)::text as obscure,
        COUNT(*) FILTER (WHERE is_obscure = false)::text as not_obscure,
        COUNT(*) FILTER (WHERE profile_path IS NULL)::text as no_profile,
        COUNT(*) FILTER (WHERE COALESCE(popularity, 0) < ${OBSCURE_POPULARITY_THRESHOLD})::text as low_popularity
      FROM deceased_persons
    `)

    const stats = result.rows[0]
    const total = parseInt(stats.total, 10)
    const withPopularity = parseInt(stats.with_popularity, 10)
    const obscure = parseInt(stats.obscure, 10)
    const notObscure = parseInt(stats.not_obscure, 10)

    console.log("\n" + "=".repeat(60))
    console.log("DECEASED ACTORS OBSCURE STATISTICS")
    console.log("=".repeat(60))
    console.log(`\nTotal deceased actors: ${total.toLocaleString()}`)

    if (total === 0) {
      console.log("\nNo deceased actors in database.")
      console.log("=".repeat(60) + "\n")
      return
    }

    console.log(`\nPopularity data:`)
    console.log(
      `  With popularity:    ${withPopularity.toLocaleString()} (${((withPopularity / total) * 100).toFixed(1)}%)`
    )
    console.log(
      `  Missing popularity: ${stats.without_popularity} (${(((total - withPopularity) / total) * 100).toFixed(1)}%)`
    )
    console.log(`\nObscure classification:`)
    console.log(
      `  Obscure:     ${obscure.toLocaleString()} (${((obscure / total) * 100).toFixed(1)}%)`
    )
    console.log(
      `  Not obscure: ${notObscure.toLocaleString()} (${((notObscure / total) * 100).toFixed(1)}%)`
    )
    console.log(`\nObscure reasons:`)
    console.log(`  No profile photo:   ${stats.no_profile}`)
    console.log(`  Low popularity (<${OBSCURE_POPULARITY_THRESHOLD}): ${stats.low_popularity}`)
    console.log("=".repeat(60) + "\n")
  } finally {
    await db.end()
  }
}

/**
 * Get actor popularity from TMDB API.
 * Note: We always fetch from TMDB rather than using cached data from actor_appearances
 * because that cached data can become stale (TMDB popularity changes over time).
 */
export async function getPopularity(tmdbId: number): Promise<PopularityResult> {
  try {
    const details = await getPersonDetails(tmdbId)
    return { popularity: details.popularity }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    if (errorMsg.includes("404")) {
      // Actor not found on TMDB
      return { popularity: null }
    }
    throw error
  }
}

async function runBackfill(options: BackfillOptions): Promise<void> {
  const { all = false, dryRun = false, limit, stats = false } = options

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  // Stats-only mode
  if (stats) {
    await showStats()
    return
  }

  if (!process.env.TMDB_API_TOKEN) {
    console.error("TMDB_API_TOKEN environment variable is required")
    process.exit(1)
  }

  console.log("\nBackfilling popularity for deceased actors...")
  if (dryRun) console.log("(DRY RUN - no changes will be made)")
  if (all) console.log("(Refreshing ALL actors)")
  if (limit) console.log(`(Limited to ${limit} actors)`)
  console.log()

  const db = getPool()

  try {
    // Get actors that need updating
    const whereClause = all ? "1=1" : "popularity IS NULL"

    const params: number[] = []
    let paramIndex = 1
    const limitClause = limit ? `LIMIT $${paramIndex++}` : ""
    if (limit) params.push(limit)

    const result = await db.query<ActorRow>(
      `SELECT tmdb_id, name, profile_path, popularity
       FROM deceased_persons
       WHERE ${whereClause}
       ORDER BY tmdb_id
       ${limitClause}`,
      params
    )

    console.log(`Found ${result.rows.length} actors to process\n`)

    if (result.rows.length === 0) {
      console.log("Nothing to backfill.")
      await showStats()
      return
    }

    let updated = 0
    let skipped = 0
    let errors = 0

    for (let i = 0; i < result.rows.length; i++) {
      const actor = result.rows[i]
      const progress = `[${i + 1}/${result.rows.length}]`

      try {
        const { popularity } = await getPopularity(actor.tmdb_id)

        if (popularity === null) {
          console.log(`${progress} ${actor.name}: no popularity data found, skipping`)
          skipped++
          continue
        }

        const isObscure = actor.profile_path === null || popularity < OBSCURE_POPULARITY_THRESHOLD
        const obscureLabel = isObscure ? "obscure" : "not obscure"

        if (dryRun) {
          console.log(
            `${progress} ${actor.name}: popularity=${popularity.toFixed(1)} → ${obscureLabel}`
          )
          updated++
        } else {
          await db.query(`UPDATE deceased_persons SET popularity = $2 WHERE tmdb_id = $1`, [
            actor.tmdb_id,
            popularity,
          ])
          console.log(
            `${progress} ${actor.name}: popularity=${popularity.toFixed(1)} → ${obscureLabel}`
          )
          updated++
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        console.error(`${progress} ${actor.name}: ERROR - ${errorMsg}`)
        errors++
      } finally {
        // Rate limit - TMDB API has limits (around 40 requests/10 seconds)
        // Applied in finally block to ensure rate limiting even on errors
        await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS))
      }
    }

    console.log("\n" + "=".repeat(60))
    console.log("BACKFILL SUMMARY")
    console.log("=".repeat(60))
    console.log(`  Updated:  ${updated}`)
    console.log(`  Skipped:  ${skipped}`)
    console.log(`  Errors:   ${errors}`)
    console.log("=".repeat(60))

    // Show final stats
    if (!dryRun) {
      await showStats()
    }
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

// Only run when executed directly, not when imported for testing
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("backfill-actor-obscure.ts")

if (isMainModule) {
  program.parse()
}
