#!/usr/bin/env tsx
/**
 * Backfill OMDb ratings for movies and shows using job queue
 *
 * This script queues OMDb rating fetch jobs for all content with IMDb IDs.
 * Jobs are processed asynchronously by the worker process.
 *
 * Features:
 * - Non-blocking - quickly queues all jobs and exits
 * - Automatic retry logic handled by BullMQ
 * - Rate limiting handled by worker
 * - Progress monitoring via admin UI
 *
 * Usage:
 *   npm run backfill:omdb -- [options]
 *
 * Options:
 *   -l, --limit <n>           Process only N items
 *   --movies-only             Only backfill movies
 *   --shows-only              Only backfill shows
 *   -n, --dry-run             Preview without queueing jobs
 *   --min-popularity <n>      Skip items below popularity threshold
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
    throw new InvalidArgumentError(
      "Must be one of: low, normal, high, critical"
    )
  }

  return priorityMap[normalized]
}

interface BackfillOptions {
  limit?: number
  moviesOnly?: boolean
  showsOnly?: boolean
  dryRun?: boolean
  minPopularity?: number
  priority: JobPriority
}

interface MovieInfo {
  tmdb_id: number
  title: string
  imdb_id: string
  popularity: number | null
}

interface ShowInfo {
  tmdb_id: number
  name: string
  imdb_id: string
  popularity: number | null
}

const program = new Command()
  .name("backfill-omdb-ratings")
  .description("Queue OMDb ratings fetch jobs for movies and shows")
  .option("-l, --limit <n>", "Process only N items", parsePositiveInt)
  .option("--movies-only", "Only backfill movies")
  .option("--shows-only", "Only backfill shows")
  .option("-n, --dry-run", "Preview without queueing jobs")
  .option(
    "--min-popularity <n>",
    "Skip items below popularity threshold",
    parseNonNegativeFloat
  )
  .option(
    "--priority <level>",
    "Job priority: low, normal, high, critical (default: low)",
    parsePriority,
    JobPriority.LOW
  )

program.parse()

const options = program.opts<BackfillOptions>()

async function queueMovieJobs(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean,
  priority: JobPriority
): Promise<number> {
  const db = getPool()

  const conditions: string[] = ["imdb_id IS NOT NULL", "omdb_updated_at IS NULL"]

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
    SELECT tmdb_id, title, imdb_id, popularity
    FROM movies
    WHERE ${conditions.join("\n      AND ")}
    ORDER BY popularity DESC NULLS LAST
    ${limitClause}
  `

  const result = await db.query<MovieInfo>(query, params)
  const movies = result.rows

  console.log(`\nFound ${movies.length} movies to queue`)

  if (dryRun) {
    console.log("\nPreview (first 10 movies):")
    for (const movie of movies.slice(0, 10)) {
      console.log(
        `  - ${movie.title} (${movie.imdb_id}) [popularity: ${movie.popularity?.toFixed(1) ?? "N/A"}]`
      )
    }
    if (movies.length > 10) {
      console.log(`  ... and ${movies.length - 10} more`)
    }
    return 0
  }

  let queued = 0
  for (const movie of movies) {
    await queueManager.addJob(
      JobType.FETCH_OMDB_RATINGS,
      {
        entityType: "movie",
        entityId: movie.tmdb_id,
        imdbId: movie.imdb_id,
      },
      {
        priority,
        createdBy: "backfill-omdb-ratings",
      }
    )
    queued++

    if (queued % 100 === 0) {
      console.log(`  Queued ${queued}/${movies.length} movies...`)
    }
  }

  return queued
}

async function queueShowJobs(
  limit: number | undefined,
  minPopularity: number | undefined,
  dryRun: boolean,
  priority: JobPriority
): Promise<number> {
  const db = getPool()

  const conditions: string[] = ["imdb_id IS NOT NULL", "omdb_updated_at IS NULL"]

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
    SELECT tmdb_id, name, imdb_id, popularity
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
        `  - ${show.name} (${show.imdb_id}) [popularity: ${show.popularity?.toFixed(1) ?? "N/A"}]`
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
      JobType.FETCH_OMDB_RATINGS,
      {
        entityType: "show",
        entityId: show.tmdb_id,
        imdbId: show.imdb_id,
      },
      {
        priority,
        createdBy: "backfill-omdb-ratings",
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
    console.log("🎬 OMDb Ratings Backfill - Job Queue Version")
    console.log("=" .repeat(50))
    console.log(`Dry run: ${options.dryRun ? "YES" : "NO"}`)
    console.log(`Limit: ${options.limit || "unlimited"}`)
    console.log(`Min popularity: ${options.minPopularity || "none"}`)
    console.log(`Movies only: ${options.moviesOnly ? "YES" : "NO"}`)
    console.log(`Shows only: ${options.showsOnly ? "YES" : "NO"}`)
    console.log(`Priority: ${JobPriority[options.priority]} (${options.priority})`)

    // Initialize queue manager
    await queueManager.initialize()

    let totalQueued = 0

    // Queue movie jobs
    if (!options.showsOnly) {
      const moviesQueued = await queueMovieJobs(
        options.limit,
        options.minPopularity,
        options.dryRun || false,
        options.priority
      )
      totalQueued += moviesQueued
    }

    // Queue show jobs
    if (!options.moviesOnly) {
      const showsQueued = await queueShowJobs(
        options.limit,
        options.minPopularity,
        options.dryRun || false,
        options.priority
      )
      totalQueued += showsQueued
    }

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
