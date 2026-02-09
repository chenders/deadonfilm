#!/usr/bin/env tsx
/**
 * Backfill Wikidata sitelinks for actors
 *
 * Fetches the number of Wikipedia language editions (sitelinks) for actors
 * via Wikidata SPARQL. Uses batch queries (up to 100 actors per SPARQL query)
 * for efficiency.
 *
 * Prioritizes TMDB ID lookup (P4985), falls back to Wikipedia URL resolution.
 *
 * Usage:
 *   npx tsx scripts/backfill-wikidata-sitelinks.ts              # Full backfill (missing only)
 *   npx tsx scripts/backfill-wikidata-sitelinks.ts --force       # Re-fetch all
 *   npx tsx scripts/backfill-wikidata-sitelinks.ts --limit 100   # Process first 100
 *   npx tsx scripts/backfill-wikidata-sitelinks.ts --dry-run     # Preview without writing
 *   npx tsx scripts/backfill-wikidata-sitelinks.ts --actor-id 42 # Single actor
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db.js"
import {
  fetchSitelinksBatch,
  fetchSitelinksByTmdbId,
  fetchSitelinksByWikipediaUrl,
} from "../src/lib/wikidata-sitelinks.js"

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return n
}

interface Options {
  limit?: number
  batchSize: number
  dryRun?: boolean
  force?: boolean
  actorId?: number
}

const program = new Command()
  .name("backfill-wikidata-sitelinks")
  .description("Backfill Wikidata sitelinks count for actors")
  .option("-l, --limit <n>", "Limit number of actors to process", parsePositiveInt)
  .option(
    "-b, --batch-size <n>",
    "Actors per processing iteration (SPARQL chunks internally to 100)",
    parsePositiveInt,
    500
  )
  .option("-n, --dry-run", "Preview without writing to database")
  .option("--force", "Re-fetch even if already populated")
  .option("--actor-id <n>", "Process a single actor by ID", parsePositiveInt)
  .action(async (options) => {
    await run(options)
  })

async function run(options: Options): Promise<void> {
  const pool = getPool()

  console.log("\n=== Backfill Wikidata Sitelinks ===")
  if (options.dryRun) console.log("(DRY RUN - no changes will be made)")
  if (options.force) console.log("(FORCE - re-fetching all actors)")
  if (options.actorId) console.log(`Processing single actor: ${options.actorId}`)
  if (options.limit) console.log(`Limit: ${options.limit} actors`)
  console.log(`Batch size: ${options.batchSize}`)
  console.log()

  try {
    // Build query based on options
    let whereClause = "WHERE (a.tmdb_id IS NOT NULL OR a.wikipedia_url IS NOT NULL)"
    const params: (number | null)[] = []

    if (options.actorId) {
      params.push(options.actorId)
      whereClause += ` AND a.id = $${params.length}`
    } else if (!options.force) {
      whereClause += " AND a.wikidata_sitelinks_updated_at IS NULL"
    }

    let limitClause = ""
    if (options.limit) {
      params.push(options.limit)
      limitClause = ` LIMIT $${params.length}`
    }

    const actorsResult = await pool.query<{
      id: number
      tmdb_id: number | null
      wikipedia_url: string | null
    }>(
      `SELECT a.id, a.tmdb_id, a.wikipedia_url
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
    const startTime = Date.now()

    // Single actor mode: use individual query
    if (options.actorId && actorsResult.rows.length === 1) {
      const actor = actorsResult.rows[0]
      processed++

      let sitelinks: number | null = null
      if (actor.tmdb_id) {
        sitelinks = await fetchSitelinksByTmdbId(actor.tmdb_id)
      }
      if (sitelinks === null && actor.wikipedia_url) {
        sitelinks = await fetchSitelinksByWikipediaUrl(actor.wikipedia_url)
      }

      if (sitelinks !== null) {
        console.log(`Actor ${actor.id}: ${sitelinks} sitelinks`)
        succeeded++
        if (!options.dryRun) {
          await pool.query(
            `UPDATE actors SET wikidata_sitelinks = $1, wikidata_sitelinks_updated_at = NOW() WHERE id = $2`,
            [sitelinks, actor.id]
          )
        }
      } else {
        console.log(`Actor ${actor.id}: no sitelinks data found`)
        skipped++
        if (!options.dryRun) {
          await pool.query(
            `UPDATE actors SET wikidata_sitelinks_updated_at = NOW() WHERE id = $1`,
            [actor.id]
          )
        }
      }
    } else {
      // Batch mode: process in chunks using batch SPARQL
      const batchSize = options.batchSize

      for (let i = 0; i < actorsResult.rows.length; i += batchSize) {
        const batch = actorsResult.rows.slice(i, i + batchSize)

        // Separate actors with TMDB IDs from those without
        const withTmdb = batch.filter((a) => a.tmdb_id !== null)
        const withoutTmdb = batch.filter((a) => a.tmdb_id === null && a.wikipedia_url !== null)

        // Batch fetch by TMDB ID
        const tmdbIds = withTmdb.map((a) => a.tmdb_id!)
        const batchResult =
          tmdbIds.length > 0
            ? await fetchSitelinksBatch(tmdbIds)
            : { results: new Map<number, number>(), queriedIds: new Set<number>() }

        // Build updates for this batch
        const batchUpdates: Array<{ id: number; sitelinks: number | null }> = []

        // Process actors with TMDB IDs — only include actors from successful chunks
        for (const actor of withTmdb) {
          processed++
          if (!batchResult.queriedIds.has(actor.tmdb_id!)) {
            // This actor was in a failed chunk — skip to avoid poisoning updated_at
            failed++
            continue
          }
          let sitelinks = batchResult.results.get(actor.tmdb_id!) ?? null

          // Fallback: if TMDB ID not in Wikidata P4985, try Wikipedia URL
          if (sitelinks === null && actor.wikipedia_url) {
            try {
              sitelinks = await fetchSitelinksByWikipediaUrl(actor.wikipedia_url)
            } catch {
              // Skip this actor on fallback error to avoid poisoning updated_at
              failed++
              continue
            }
          }

          if (sitelinks !== null) {
            succeeded++
          } else {
            skipped++
          }
          batchUpdates.push({ id: actor.id, sitelinks })
        }

        // Process actors without TMDB IDs (individual Wikipedia URL lookups)
        for (const actor of withoutTmdb) {
          processed++
          try {
            const sitelinks = await fetchSitelinksByWikipediaUrl(actor.wikipedia_url!)
            if (sitelinks !== null) {
              succeeded++
            } else {
              skipped++
            }
            batchUpdates.push({ id: actor.id, sitelinks })
          } catch (error) {
            failed++
            console.error(`  Error for actor ${actor.id}:`, error)
            // Skip updating this actor on fetch error to avoid poisoning updated_at
          }
        }

        // Write batch to database
        if (batchUpdates.length > 0 && !options.dryRun) {
          await batchUpdateSitelinks(pool, batchUpdates)
        }

        // Progress report
        const elapsed = (Date.now() - startTime) / 1000
        const rate = processed / elapsed
        const remaining = actorsResult.rows.length - processed
        const eta = remaining / rate
        process.stdout.write(
          `\rProcessed ${processed}/${actorsResult.rows.length} (${rate.toFixed(0)}/s, ETA ${eta.toFixed(0)}s) - Succeeded: ${succeeded}, Skipped: ${skipped}`
        )
      }
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

async function batchUpdateSitelinks(
  pool: ReturnType<typeof getPool>,
  updates: Array<{ id: number; sitelinks: number | null }>
): Promise<void> {
  await pool.query(
    `
    UPDATE actors a SET
      wikidata_sitelinks = u.sitelinks,
      wikidata_sitelinks_updated_at = NOW()
    FROM (
      SELECT unnest($1::int[]) as id,
             unnest($2::int[]) as sitelinks
    ) u
    WHERE a.id = u.id
    `,
    [updates.map((u) => u.id), updates.map((u) => u.sitelinks)]
  )
}

program.parse()
