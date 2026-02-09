#!/usr/bin/env tsx
/**
 * Backfill Wikipedia annual pageviews for actors
 *
 * Fetches trailing 12-month pageview data from the Wikimedia REST API
 * for all actors that have a wikipedia_url. At ~100 req/s, the full
 * backfill of ~8K actors takes about 80 seconds.
 *
 * Usage:
 *   npx tsx scripts/backfill-wikipedia-pageviews.ts              # Full backfill (missing only)
 *   npx tsx scripts/backfill-wikipedia-pageviews.ts --force       # Re-fetch all
 *   npx tsx scripts/backfill-wikipedia-pageviews.ts --limit 10    # Process first 10
 *   npx tsx scripts/backfill-wikipedia-pageviews.ts --dry-run     # Preview without writing
 *   npx tsx scripts/backfill-wikipedia-pageviews.ts --actor-id 42 # Single actor
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db.js"
import { fetchActorPageviews } from "../src/lib/wikipedia-pageviews.js"

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

interface Options {
  limit?: number
  dryRun?: boolean
  batchSize: number
  actorId?: number
  force?: boolean
}

const program = new Command()
  .name("backfill-wikipedia-pageviews")
  .description("Backfill Wikipedia annual pageviews for actors with wikipedia_url")
  .option("-l, --limit <n>", "Limit number of actors to process", parsePositiveInt)
  .option("-n, --dry-run", "Preview without writing to database")
  .option("-b, --batch-size <n>", "Batch size for DB writes", parsePositiveInt, 100)
  .option("--actor-id <n>", "Process a single actor by ID", parsePositiveInt)
  .option("--force", "Re-fetch even if already populated")
  .action(async (options) => {
    await run(options)
  })

async function run(options: Options): Promise<void> {
  const pool = getPool()

  console.log("\n=== Backfill Wikipedia Pageviews ===")
  if (options.dryRun) console.log("(DRY RUN - no changes will be made)")
  if (options.force) console.log("(FORCE - re-fetching all actors)")
  if (options.actorId) console.log(`Processing single actor: ${options.actorId}`)
  if (options.limit) console.log(`Limit: ${options.limit} actors`)
  console.log()

  try {
    // Build query based on options
    let whereClause = "WHERE a.wikipedia_url IS NOT NULL"
    const params: (number | null)[] = []

    if (options.actorId) {
      params.push(options.actorId)
      whereClause += ` AND a.id = $${params.length}`
    } else if (!options.force) {
      whereClause += " AND a.wikipedia_annual_pageviews IS NULL"
    }

    let limitClause = ""
    if (options.limit) {
      params.push(options.limit)
      limitClause = ` LIMIT $${params.length}`
    }

    const actorsResult = await pool.query<{
      id: number
      wikipedia_url: string
      deathday: string | null
    }>(
      `SELECT a.id, a.wikipedia_url, a.deathday
       FROM actors a
       ${whereClause}
       ORDER BY a.id
       ${limitClause}`,
      params
    )

    console.log(`Found ${actorsResult.rows.length} actors to process\n`)

    if (actorsResult.rows.length === 0) {
      console.log("Nothing to do.")
      return
    }

    let processed = 0
    let succeeded = 0
    let failed = 0
    let skipped = 0
    const batchUpdates: Array<{ id: number; pageviews: number }> = []
    const startTime = Date.now()

    for (const actor of actorsResult.rows) {
      processed++

      try {
        const pageviews = await fetchActorPageviews(actor.wikipedia_url, actor.deathday)

        if (pageviews !== null) {
          batchUpdates.push({ id: actor.id, pageviews })
          succeeded++
        } else {
          skipped++
        }
      } catch (error) {
        failed++
        console.error(`  Error for actor ${actor.id}:`, error)
      }

      // Write batch
      if (batchUpdates.length >= options.batchSize) {
        if (!options.dryRun) {
          await batchUpdatePageviews(pool, batchUpdates)
        }
        batchUpdates.length = 0
      }

      // Progress every 100 actors
      if (processed % 100 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = processed / elapsed
        const remaining = actorsResult.rows.length - processed
        const eta = remaining / rate
        process.stdout.write(
          `\rProcessed ${processed}/${actorsResult.rows.length} (${rate.toFixed(0)}/s, ETA ${eta.toFixed(0)}s)...`
        )
      }
    }

    // Final batch
    if (batchUpdates.length > 0 && !options.dryRun) {
      await batchUpdatePageviews(pool, batchUpdates)
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log("\n\n=== Summary ===")
    console.log(`Processed: ${processed}`)
    console.log(`Succeeded: ${succeeded}`)
    console.log(`Skipped (no data): ${skipped}`)
    console.log(`Failed: ${failed}`)
    console.log(`Duration: ${duration}s`)
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

async function batchUpdatePageviews(
  pool: ReturnType<typeof getPool>,
  updates: Array<{ id: number; pageviews: number }>
): Promise<void> {
  await pool.query(
    `
    UPDATE actors a SET
      wikipedia_annual_pageviews = u.pageviews,
      wikipedia_pageviews_updated_at = NOW()
    FROM (
      SELECT unnest($1::int[]) as id,
             unnest($2::int[]) as pageviews
    ) u
    WHERE a.id = u.id
    `,
    [updates.map((u) => u.id), updates.map((u) => u.pageviews)]
  )
}

program.parse()
