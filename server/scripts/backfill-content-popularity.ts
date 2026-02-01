#!/usr/bin/env tsx
/**
 * Backfill content (movies/shows) DOF popularity scores
 *
 * Queues CALCULATE_CONTENT_POPULARITY jobs to process movies and shows
 * that don't have popularity scores yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-content-popularity.ts                 # Queue movies
 *   npx tsx scripts/backfill-content-popularity.ts --shows         # Queue shows
 *   npx tsx scripts/backfill-content-popularity.ts --all           # Queue both
 *   npx tsx scripts/backfill-content-popularity.ts --recalculate   # Recalculate all
 *   npx tsx scripts/backfill-content-popularity.ts --dry-run       # Preview only
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { queueManager } from "../src/lib/jobs/queue-manager.js"
import { JobType, JobPriority } from "../src/lib/jobs/types.js"

interface BackfillOptions {
  shows?: boolean
  all?: boolean
  recalculate?: boolean
  batchSize?: number
  dryRun?: boolean
}

const program = new Command()
  .name("backfill-content-popularity")
  .description("Queue jobs to calculate DOF popularity scores for movies/shows")
  .option("--shows", "Process shows instead of movies")
  .option("--all", "Process both movies and shows")
  .option("--recalculate", "Recalculate all content, not just missing scores")
  .option("-b, --batch-size <n>", "Number of items per job", parseInt, 100)
  .option("-n, --dry-run", "Preview without queueing jobs")
  .action(async (options) => {
    await runBackfill(options)
  })

async function runBackfill(options: BackfillOptions): Promise<void> {
  const {
    shows = false,
    all = false,
    recalculate = false,
    batchSize = 100,
    dryRun = false,
  } = options

  console.log("\nBackfilling content popularity scores...")
  if (dryRun) console.log("(DRY RUN - no jobs will be queued)\n")

  const db = getPool()

  try {
    // Initialize queue manager if not dry run
    if (!dryRun) {
      await queueManager.initialize()
    }

    const entityTypes: Array<"movie" | "show"> = all
      ? ["movie", "show"]
      : shows
        ? ["show"]
        : ["movie"]

    for (const entityType of entityTypes) {
      const table = entityType === "movie" ? "movies" : "shows"

      // Count items to process
      const countResult = await db.query<{ count: string }>(
        `
        SELECT COUNT(*) as count FROM ${table}
        ${!recalculate ? "WHERE dof_popularity IS NULL" : ""}
        `
      )

      const totalCount = parseInt(countResult.rows[0].count, 10)
      console.log(
        `${entityType === "movie" ? "Movies" : "Shows"} to process: ${totalCount.toLocaleString()}`
      )

      if (totalCount === 0) {
        console.log(`  No ${entityType}s need processing.\n`)
        continue
      }

      // Calculate number of batches
      const batchCount = Math.ceil(totalCount / batchSize)
      console.log(`  Batches needed: ${batchCount} (${batchSize} per batch)`)

      if (dryRun) {
        console.log(`  (Would queue ${batchCount} jobs)\n`)
        continue
      }

      // Get IDs in batches and queue jobs
      let offset = 0
      let jobsQueued = 0

      while (offset < totalCount) {
        const idsResult = await db.query<{ tmdb_id: number }>(
          `
          SELECT tmdb_id FROM ${table}
          ${!recalculate ? "WHERE dof_popularity IS NULL" : ""}
          ORDER BY tmdb_id
          LIMIT $1 OFFSET $2
          `,
          [batchSize, offset]
        )

        const ids = idsResult.rows.map((r) => r.tmdb_id)

        if (ids.length === 0) break

        await queueManager.addJob(
          JobType.CALCULATE_CONTENT_POPULARITY,
          {
            entityType,
            entityIds: ids,
            batchSize,
            recalculateAll: recalculate,
          },
          {
            priority: JobPriority.LOW,
            createdBy: "backfill-content-popularity",
          }
        )

        jobsQueued++
        offset += batchSize

        if (jobsQueued % 10 === 0) {
          console.log(`  Queued ${jobsQueued}/${batchCount} jobs...`)
        }
      }

      console.log(`  Queued ${jobsQueued} ${entityType} jobs.\n`)
    }

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
  process.argv[1]?.endsWith("backfill-content-popularity.ts")

if (isMainModule) {
  program.parse()
}
