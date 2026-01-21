#!/usr/bin/env tsx
/**
 * Backfill script to fetch birthday, profile_path, and popularity from TMDB
 * for actors in the database.
 *
 * Features:
 * - Exponential backoff retry logic (max 3 attempts)
 * - Marks permanently failed items after 3 attempts
 * - Classifies errors as permanent (404, 400, 401) vs transient (500, 503, timeouts)
 * - Respects rate limits with 260ms delay between requests
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
import { isPermanentError } from "../src/lib/backfill-utils.js"

const RATE_LIMIT_DELAY_MS = 260

const program = new Command()
  .name("backfill-actor-details")
  .description("Fetch birthday, profile_path, and popularity from TMDB for actors")
  .option("-a, --all", "Refresh all actors, not just those missing data")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .option("-l, --limit <number>", "Limit number of actors to process", parseInt)
  .option(
    "--max-consecutive-failures <number>",
    "Stop processing after N consecutive failures (circuit breaker)",
    parseInt,
    3
  )
  .action(async (options) => {
    await runBackfill(options)
  })

interface BackfillOptions {
  all?: boolean
  dryRun?: boolean
  limit?: number
  maxConsecutiveFailures?: number
}

interface ActorInfo {
  tmdb_id: number
  name: string
  details_fetch_attempts: number
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

  const { all = false, dryRun = false, limit, maxConsecutiveFailures = 3 } = options

  console.log("\nBackfilling actor details from TMDB...")
  if (dryRun) console.log("(DRY RUN - no changes will be made)")
  if (all) console.log("(Refreshing ALL actors)")
  if (limit) console.log(`(Limited to ${limit} actors)`)
  console.log()

  const db = getPool()

  try {
    // Get actors that need updating with retry logic
    const conditions = [
      "tmdb_id IS NOT NULL",
      "details_permanently_failed = false",
      "details_fetch_attempts < 3",
      `(
        details_last_fetch_attempt IS NULL
        OR details_last_fetch_attempt < NOW() - INTERVAL '1 hour' * POWER(2, details_fetch_attempts)
      )`,
    ]

    if (!all) {
      conditions.push("(birthday IS NULL OR profile_path IS NULL)")
    }

    const params: number[] = []
    let paramIndex = 1
    const limitClause = limit ? `LIMIT $${paramIndex++}` : ""
    if (limit) params.push(limit)

    const result = await db.query<ActorInfo>(
      `
      SELECT tmdb_id, name, details_fetch_attempts
      FROM actors
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY popularity DESC NULLS LAST, tmdb_id
      ${limitClause}
    `,
      params
    )

    console.log(`Found ${result.rows.length} actors to process\n`)

    if (result.rows.length === 0) {
      console.log("Nothing to backfill. Done!")
      return
    }

    let updated = 0
    let permanentlyFailed = 0
    let errors = 0
    let consecutiveFailures = 0

    for (let i = 0; i < result.rows.length; i++) {
      const actor = result.rows[i]
      const attemptNum = actor.details_fetch_attempts + 1
      const retryLabel = attemptNum > 1 ? ` (retry ${attemptNum})` : ""
      const progress = `[${i + 1}/${result.rows.length}]`

      try {
        const details = await getPersonDetails(actor.tmdb_id)

        if (dryRun) {
          console.log(
            `${progress} ${actor.name}: birthday=${details.birthday}, profile=${details.profile_path ? "yes" : "no"}, popularity=${details.popularity}${retryLabel}`
          )
          updated++
        } else {
          // Update actors table
          await db.query(
            `UPDATE actors
             SET birthday = $2,
                 profile_path = $3,
                 popularity = $4,
                 details_fetch_attempts = 0,
                 details_last_fetch_attempt = NULL,
                 details_fetch_error = NULL
             WHERE tmdb_id = $1`,
            [actor.tmdb_id, details.birthday, details.profile_path, details.popularity]
          )

          // Also update actor_appearances table for consistency
          await db.query(
            `UPDATE actor_appearances
             SET birthday = $2,
                 profile_path = $3,
                 popularity = $4
             WHERE actor_tmdb_id = $1`,
            [actor.tmdb_id, details.birthday, details.profile_path, details.popularity]
          )

          console.log(
            `${progress} ${actor.name}: updated (birthday=${details.birthday || "null"}, pop=${details.popularity?.toFixed(1)})${retryLabel}`
          )
          updated++
          consecutiveFailures = 0 // Reset circuit breaker on success
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        const permanent = isPermanentError(error)

        if (permanent) {
          console.log(`${progress} ${actor.name}: not found on TMDB${retryLabel}`)
        } else {
          console.error(`${progress} ${actor.name}: ERROR - ${errorMsg}${retryLabel}`)
        }

        errors++
        consecutiveFailures++

        // Circuit breaker: stop if too many consecutive failures (API likely down)
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.error(
            `\n❌ Circuit breaker tripped: ${consecutiveFailures} consecutive failures detected`
          )
          console.error(
            "   The TMDB API may be experiencing an outage. Stopping to prevent futile requests."
          )
          console.error(
            `   Processed ${i + 1}/${result.rows.length} actors before stopping (${updated} updated, ${errors} errors)\n`
          )

          await db.end()
          process.exit(2) // Exit code 2 indicates circuit breaker trip
        }

        if (!dryRun) {
          const willMarkPermanent = permanent || attemptNum >= 3

          await db.query(
            `UPDATE actors
             SET details_fetch_attempts = $1,
                 details_last_fetch_attempt = NOW(),
                 details_fetch_error = $2,
                 details_permanently_failed = $3
             WHERE tmdb_id = $4`,
            [attemptNum, errorMsg.substring(0, 500), willMarkPermanent, actor.tmdb_id]
          )

          if (willMarkPermanent) permanentlyFailed++
        }
      }

      // Rate limit - apply after both success and error to respect API limits
      if (i < result.rows.length - 1) {
        await delay(RATE_LIMIT_DELAY_MS)
      }
    }

    console.log("\nSummary:")
    console.log(`  Updated: ${updated}`)
    console.log(`  Errors: ${errors}`)
    if (permanentlyFailed > 0) {
      console.log(`  Permanently failed: ${permanentlyFailed}`)
    }
    console.log("\nDone!")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

program.parse()
