#!/usr/bin/env tsx
/**
 * Backfill actor DOF popularity scores
 *
 * Queues CALCULATE_ACTOR_POPULARITY jobs to process actors
 * that don't have popularity scores yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-actor-popularity.ts              # Queue all missing
 *   npx tsx scripts/backfill-actor-popularity.ts --deceased   # Only deceased actors
 *   npx tsx scripts/backfill-actor-popularity.ts --recalculate # Recalculate all
 *   npx tsx scripts/backfill-actor-popularity.ts --dry-run    # Preview only
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { queueManager } from "../src/lib/jobs/queue-manager.js"
import { JobType, JobPriority } from "../src/lib/jobs/types.js"

interface BackfillOptions {
  deceased?: boolean
  recalculate?: boolean
  batchSize?: number
  dryRun?: boolean
}

const program = new Command()
  .name("backfill-actor-popularity")
  .description("Queue jobs to calculate DOF popularity scores for actors")
  .option("--deceased", "Only process deceased actors")
  .option("--recalculate", "Recalculate all actors, not just missing scores")
  .option("-b, --batch-size <n>", "Number of actors per job", parseInt, 100)
  .option("-n, --dry-run", "Preview without queueing jobs")
  .action(async (options) => {
    await runBackfill(options)
  })

async function runBackfill(options: BackfillOptions): Promise<void> {
  const { deceased = false, recalculate = false, batchSize = 100, dryRun = false } = options

  console.log("\nBackfilling actor popularity scores...")
  if (dryRun) console.log("(DRY RUN - no jobs will be queued)\n")

  const db = getPool()

  try {
    // Initialize queue manager if not dry run
    if (!dryRun) {
      await queueManager.initialize()
    }

    // Build WHERE clause
    const conditions: string[] = []
    if (!recalculate) {
      conditions.push("dof_popularity IS NULL")
    }
    if (deceased) {
      conditions.push("deathday IS NOT NULL")
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    // Count actors to process
    const countResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM actors ${whereClause}`
    )

    const totalCount = parseInt(countResult.rows[0].count, 10)
    console.log(`Actors to process: ${totalCount.toLocaleString()}`)

    if (totalCount === 0) {
      console.log("No actors need processing.\n")
      await db.end()
      return
    }

    // Calculate number of batches
    const batchCount = Math.ceil(totalCount / batchSize)
    console.log(`Batches needed: ${batchCount} (${batchSize} per batch)`)

    if (dryRun) {
      console.log(`(Would queue ${batchCount} jobs)\n`)
      await db.end()
      return
    }

    // Get IDs in batches and queue jobs
    let offset = 0
    let jobsQueued = 0

    while (offset < totalCount) {
      const idsResult = await db.query<{ id: number }>(
        `
        SELECT id FROM actors ${whereClause}
        ORDER BY id
        LIMIT $1 OFFSET $2
        `,
        [batchSize, offset]
      )

      const ids = idsResult.rows.map((r) => r.id)

      if (ids.length === 0) break

      await queueManager.addJob(
        JobType.CALCULATE_ACTOR_POPULARITY,
        {
          actorIds: ids,
          batchSize,
          recalculateAll: recalculate,
        },
        {
          priority: JobPriority.LOW,
          createdBy: "backfill-actor-popularity",
        }
      )

      jobsQueued++
      offset += batchSize

      if (jobsQueued % 10 === 0) {
        console.log(`Queued ${jobsQueued}/${batchCount} jobs...`)
      }
    }

    console.log(`Queued ${jobsQueued} actor popularity jobs.\n`)
    console.log("Backfill complete.")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await db.end()
    if (!dryRun) {
      await queueManager.shutdown()
    }
  }
}

// Only run when executed directly
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("backfill-actor-popularity.ts")

if (isMainModule) {
  program.parse()
}
