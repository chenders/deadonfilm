#!/usr/bin/env tsx
/**
 * Backfill actor awards from Wikidata
 *
 * Fetches award wins and nominations for actors who have a TMDB ID
 * but no awards data yet. Stores results as JSONB in the actors table.
 *
 * Usage:
 *   npx tsx scripts/backfill-actor-awards.ts                    # Backfill all missing
 *   npx tsx scripts/backfill-actor-awards.ts --limit 50         # Process first 50
 *   npx tsx scripts/backfill-actor-awards.ts --batch-size 100   # Larger batches
 *   npx tsx scripts/backfill-actor-awards.ts --dry-run          # Preview only
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import {
  fetchActorAwardsBatch,
  calculateActorAwardsScore,
  type ActorAwardsData,
} from "../src/lib/wikidata-awards.js"

interface BackfillOptions {
  batchSize: number
  limit?: number
  dryRun?: boolean
}

const program = new Command()
  .name("backfill-actor-awards")
  .description("Backfill actor awards data from Wikidata")
  .option("-b, --batch-size <n>", "TMDB IDs per SPARQL batch", parseInt, 500)
  .option("-l, --limit <n>", "Max actors to process", parseInt)
  .option("-n, --dry-run", "Preview without updating database")
  .action(async (options) => {
    await runBackfill(options)
  })

async function runBackfill(options: BackfillOptions): Promise<void> {
  const { batchSize, limit, dryRun } = options
  const pool = getPool()

  console.log("\n=== Backfill Actor Awards ===")
  if (dryRun) console.log("(DRY RUN - no changes will be made)")
  console.log(`Batch size: ${batchSize}`)
  if (limit) console.log(`Limit: ${limit}`)
  console.log()

  try {
    // Get actors with TMDB ID but no awards data
    const limitClause = limit ? `LIMIT ${limit}` : ""
    const actorsResult = await pool.query<{
      id: number
      tmdb_id: number
    }>(`
      SELECT id, tmdb_id
      FROM actors
      WHERE tmdb_id IS NOT NULL
        AND actor_awards_updated_at IS NULL
      ORDER BY id
      ${limitClause}
    `)

    console.log(`Found ${actorsResult.rows.length} actors without awards data`)

    if (actorsResult.rows.length === 0 || dryRun) {
      if (dryRun && actorsResult.rows.length > 0) {
        console.log(`(Would fetch awards for ${actorsResult.rows.length} actors)`)
      }
      return
    }

    let refreshed = 0
    let withAwards = 0

    for (let i = 0; i < actorsResult.rows.length; i += batchSize) {
      const batch = actorsResult.rows.slice(i, i + batchSize)
      const tmdbIds = batch.map((a) => a.tmdb_id)

      const batchResult = await fetchActorAwardsBatch(tmdbIds)

      const batchUpdates: Array<{ id: number; awardsData: ActorAwardsData | null }> = []

      for (const actor of batch) {
        if (!batchResult.queriedIds.has(actor.tmdb_id)) continue

        const awardsData = batchResult.results.get(actor.tmdb_id) ?? null

        // Pre-compute the score and store it in the JSONB
        if (awardsData) {
          awardsData.totalScore = calculateActorAwardsScore(awardsData)
          withAwards++
        }

        batchUpdates.push({ id: actor.id, awardsData })
      }

      // Write batch to database
      if (batchUpdates.length > 0) {
        await pool.query(
          `
          UPDATE actors a SET
            actor_awards_data = u.awards_data::jsonb,
            actor_awards_updated_at = NOW()
          FROM (
            SELECT unnest($1::int[]) as id,
                   unnest($2::text[]) as awards_data
          ) u
          WHERE a.id = u.id
          `,
          [
            batchUpdates.map((u) => u.id),
            batchUpdates.map((u) => (u.awardsData ? JSON.stringify(u.awardsData) : null)),
          ]
        )
        refreshed += batchUpdates.length
      }

      process.stdout.write(
        `\rProcessed ${refreshed}/${actorsResult.rows.length} actors (${withAwards} with awards)...`
      )
    }

    console.log(
      `\rProcessed ${refreshed} actors, ${withAwards} had recognized awards    `
    )
    console.log("\nBackfill complete.")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

program.parse()
