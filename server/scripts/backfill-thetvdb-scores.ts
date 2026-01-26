#!/usr/bin/env tsx
/**
 * Backfill TheTVDB scores for TV shows using job queue
 *
 * This script queues TheTVDB score fetch jobs for all shows with TheTVDB IDs.
 * Jobs are processed asynchronously by the worker process.
 *
 * Features:
 * - Non-blocking - quickly queues all jobs and exits
 * - Automatic retry logic handled by BullMQ
 * - Rate limiting handled by worker
 * - Progress monitoring via admin UI
 *
 * Usage:
 *   npm run backfill:thetvdb-scores -- [options]
 *
 * Options:
 *   -l, --limit <n>           Process only N shows
 *   -n, --dry-run             Preview without queueing jobs
 *   --min-popularity <n>      Skip shows below popularity threshold
 *   --priority <level>        Job priority: low, normal, high, critical (default: low)
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool } from "../src/lib/db/pool.js"
import { queueManager } from "../src/lib/jobs/queue-manager.js"
import { JobType, JobPriority } from "../src/lib/jobs/types.js"

export function parsePositiveInt(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  const parsed = parseInt(value, 10)
  if (parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

export function parseNonNegativeFloat(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n < 0) {
    throw new InvalidArgumentError("Must be non-negative number")
  }
  return n
}

function parsePriority(value: string): JobPriority {
  const priorityMap: Record<string, JobPriority> = {
    low: JobPriority.LOW,
    normal: JobPriority.NORMAL,
    high: JobPriority.HIGH,
    critical: JobPriority.CRITICAL,
  }

  const normalized = value.toLowerCase()
  if (!(normalized in priorityMap)) {
    throw new InvalidArgumentError("Must be one of: low, normal, high, critical")
  }

  return priorityMap[normalized]
}

interface BackfillOptions {
  limit?: number
  dryRun?: boolean
  minPopularity?: number
  priority: JobPriority
}

interface ShowInfo {
  tmdb_id: number
  name: string
  thetvdb_id: number
  popularity: number | null
}

const program = new Command()
  .name("backfill-thetvdb-scores")
  .description("Queue TheTVDB score fetch jobs for TV shows")
  .option("-l, --limit <n>", "Process only N shows", parsePositiveInt)
  .option("-n, --dry-run", "Preview without queueing jobs")
  .option("--min-popularity <n>", "Skip shows below popularity threshold", parseNonNegativeFloat)
  .option(
    "--priority <level>",
    "Job priority: low, normal, high, critical (default: low)",
    parsePriority,
    JobPriority.LOW
  )

program.parse()

const options = program.opts<BackfillOptions>()

async function queueShowJobs(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean,
  priority: JobPriority
): Promise<number> {
  const db = getPool()

  const conditions: string[] = ["thetvdb_id IS NOT NULL", "thetvdb_updated_at IS NULL"]

  const params: number[] = []
  let paramIndex = 1

  if (minPopularity !== undefined) {
    conditions.push(`popularity >= $${paramIndex}`)
    params.push(minPopularity)
    paramIndex += 1
  }

  let limitClause = ""
  if (limit !== undefined) {
    limitClause = `LIMIT $${paramIndex}`
    params.push(limit)
    paramIndex += 1
  }

  const query = `
    SELECT tmdb_id, name, thetvdb_id, popularity
    FROM shows
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

  const result = await db.query<ShowInfo>(query, params)
  const shows = result.rows

  console.log(`\nFound ${shows.length} shows to queue`)

  if (dryRun) {
    console.log("\nPreview (first 10 shows):")
    for (const show of shows.slice(0, 10)) {
      console.log(
        `  - ${show.name} (TheTVDB ${show.thetvdb_id}) [popularity: ${show.popularity?.toFixed(1) ?? "N/A"}]`
      )
    }
    if (shows.length > 10) {
      console.log(`  ... and ${shows.length - 10} more`)
    }
    return 0
  }

  let queued = 0
  for (const show of shows) {
    await queueManager.addJob(
      JobType.FETCH_THETVDB_SCORES,
      {
        entityType: "show",
        entityId: show.tmdb_id,
        thetvdbId: show.thetvdb_id,
      },
      {
        priority,
        createdBy: "backfill-thetvdb-scores",
      }
    )
    queued++

    if (queued % 100 === 0) {
      console.log(`  Queued ${queued}/${shows.length} shows...`)
    }
  }

  return queued
}

async function run(options: BackfillOptions) {
  const pool = getPool()

  try {
    console.log("📺 TheTVDB Scores Backfill - Job Queue Version")
    console.log("=".repeat(50))
    console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
    console.log(`Limit: ${options.limit || "unlimited"}`)
    console.log(`Min popularity: ${options.minPopularity || "none"}`)
    console.log(`Priority: ${JobPriority[options.priority]} (${options.priority})`)

    // Initialize queue manager
    await queueManager.initialize()

    const totalQueued = await queueShowJobs(
      options.limit,
      options.minPopularity,
      options.dryRun || false,
      options.priority
    )

    // Print summary
    console.log("\n")
    console.log("=".repeat(50))
    console.log("📊 Summary")
    console.log("=".repeat(50))
    console.log(`Total jobs queued: ${totalQueued}`)

    if (options.dryRun) {
      console.log("\n⚠️  DRY RUN - No jobs were queued")
    } else {
      console.log("\n✅ Jobs have been queued successfully!")
      console.log("\nMonitor progress:")
      console.log("  - Admin UI: http://localhost:5173/admin/jobs")
      console.log("  - Bull Board: http://localhost:5173/admin/bull-board")
      console.log("\nNote: Make sure the worker process is running:")
      console.log("  cd server && npm run worker")
    }

    // Shutdown queue manager
    await queueManager.shutdown()
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

run(options)
