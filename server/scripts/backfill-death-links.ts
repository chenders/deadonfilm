#!/usr/bin/env tsx
/**
 * Backfill missing TMDB IDs for death page links.
 *
 * This script populates tmdb_id fields in actor_death_circumstances:
 * - last_project and posthumous_releases: looks up movies/shows by title
 * - related_celebrities: looks up actors by name
 *
 * Usage:
 *   npx tsx scripts/backfill-death-links.ts [options]
 *
 * Options:
 *   -l, --limit <n>     Limit number of records to process (default: 1000)
 *   -n, --dry-run       Preview without writing to database
 *
 * Examples:
 *   npx tsx scripts/backfill-death-links.ts --dry-run
 *   npx tsx scripts/backfill-death-links.ts --limit 100
 */

import "dotenv/config"
import { Command, InvalidArgumentError } from "commander"
import { getPool, resetPool } from "../src/lib/db.js"
import { invalidateActorCacheRequired } from "../src/lib/cache.js"
import { initRedis, closeRedis } from "../src/lib/redis.js"
import type { ProjectInfo, RelatedCelebrity } from "../src/lib/db/types.js"
import {
  lookupProject,
  lookupActor,
  getProjectTmdbId,
  setProjectTmdbId,
  getCelebrityTmdbId,
  setCelebrityTmdbId,
} from "../src/lib/death-link-backfiller.js"

export function parsePositiveInt(value: string): number {
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Must be a positive integer")
  }
  return parsed
}

interface BackfillOptions {
  limit: number
  dryRun: boolean
}

interface DeathCircumstanceRecord {
  id: number
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  last_project: ProjectInfo | null
  posthumous_releases: ProjectInfo[] | null
  related_celebrities: RelatedCelebrity[] | null
}

interface Stats {
  recordsProcessed: number
  projectsLinked: number
  celebritiesLinked: number
  errors: number
}

/**
 * Process a single project and try to fill in the tmdb_id.
 * Returns true if the project was updated.
 */
async function processProjectWithLogging(
  db: ReturnType<typeof getPool>,
  project: ProjectInfo & { tmdbId?: number | null },
  dryRun: boolean
): Promise<boolean> {
  if (getProjectTmdbId(project) !== null) {
    return false // Already has tmdb_id
  }

  const tmdbId = await lookupProject(db, project.title, project.year, project.type)
  if (tmdbId !== null) {
    if (!dryRun) {
      setProjectTmdbId(project, tmdbId)
    }
    console.log(
      `  ${dryRun ? "[DRY RUN] " : ""}Linked project: "${project.title}" (${project.year || "unknown year"}) -> tmdb_id: ${tmdbId}`
    )
    return true
  }

  return false
}

/**
 * Process a single celebrity and try to fill in the tmdb_id.
 * Returns true if the celebrity was updated.
 */
async function processCelebrityWithLogging(
  db: ReturnType<typeof getPool>,
  celebrity: RelatedCelebrity & { tmdbId?: number | null },
  dryRun: boolean
): Promise<boolean> {
  if (getCelebrityTmdbId(celebrity) !== null) {
    return false // Already has tmdb_id
  }

  const tmdbId = await lookupActor(db, celebrity.name)
  if (tmdbId !== null) {
    if (!dryRun) {
      setCelebrityTmdbId(celebrity, tmdbId)
    }
    console.log(
      `  ${dryRun ? "[DRY RUN] " : ""}Linked celebrity: "${celebrity.name}" -> tmdb_id: ${tmdbId}`
    )
    return true
  }

  return false
}

async function backfillDeathLinks(options: BackfillOptions): Promise<void> {
  const { limit, dryRun } = options

  if (!process.env.DATABASE_URL) {
    console.error("Error: DATABASE_URL environment variable is not set")
    process.exit(1)
  }

  // Check Redis availability before starting (required for cache invalidation)
  if (!dryRun) {
    const redisAvailable = await initRedis()
    if (!redisAvailable) {
      console.error("Error: Redis client not available")
      console.error("This script requires Redis for cache invalidation.")
      console.error("Either start Redis or use --dry-run to preview without cache invalidation.")
      process.exit(1)
    }
  }

  const db = getPool()

  try {
    // Find records that have projects or celebrities without tmdb_ids
    console.log("Querying death circumstances records...")
    const result = await db.query<DeathCircumstanceRecord>(
      `SELECT
         adc.id,
         adc.actor_id,
         a.name as actor_name,
         a.tmdb_id as actor_tmdb_id,
         adc.last_project,
         adc.posthumous_releases,
         adc.related_celebrities
       FROM actor_death_circumstances adc
       JOIN actors a ON a.id = adc.actor_id
       WHERE (
         adc.last_project IS NOT NULL OR
         adc.posthumous_releases IS NOT NULL OR
         adc.related_celebrities IS NOT NULL
       )
       ORDER BY adc.updated_at DESC
       LIMIT $1`,
      [limit]
    )

    const records = result.rows

    if (records.length === 0) {
      console.log("No records with projects or celebrities found.")
      return
    }

    console.log(`Found ${records.length} records with death circumstances`)
    console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`)
    console.log()

    const stats: Stats = {
      recordsProcessed: 0,
      projectsLinked: 0,
      celebritiesLinked: 0,
      errors: 0,
    }

    for (const record of records) {
      stats.recordsProcessed++
      let recordModified = false

      console.log(`[${stats.recordsProcessed}/${records.length}] Processing: ${record.actor_name}`)

      try {
        // Process last_project
        if (record.last_project) {
          const linked = await processProjectWithLogging(db, record.last_project, dryRun)
          if (linked) {
            stats.projectsLinked++
            recordModified = true
          }
        }

        // Process posthumous_releases
        if (record.posthumous_releases) {
          for (const project of record.posthumous_releases) {
            const linked = await processProjectWithLogging(db, project, dryRun)
            if (linked) {
              stats.projectsLinked++
              recordModified = true
            }
          }
        }

        // Process related_celebrities
        if (record.related_celebrities) {
          for (const celebrity of record.related_celebrities) {
            const linked = await processCelebrityWithLogging(db, celebrity, dryRun)
            if (linked) {
              stats.celebritiesLinked++
              recordModified = true
            }
          }
        }

        // Update the record if modified
        if (recordModified && !dryRun) {
          await db.query(
            `UPDATE actor_death_circumstances
             SET last_project = $2,
                 posthumous_releases = $3,
                 related_celebrities = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [
              record.id,
              record.last_project ? JSON.stringify(record.last_project) : null,
              record.posthumous_releases ? JSON.stringify(record.posthumous_releases) : null,
              record.related_celebrities ? JSON.stringify(record.related_celebrities) : null,
            ]
          )

          // Invalidate cache for this actor
          await invalidateActorCacheRequired(record.actor_id)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error"
        console.error(`  Error processing ${record.actor_name}: ${message}`)
        stats.errors++
      }
    }

    console.log()
    console.log("=".repeat(50))
    console.log("Complete!")
    console.log(`  Records processed: ${stats.recordsProcessed}`)
    console.log(`  Projects linked: ${stats.projectsLinked}`)
    console.log(`  Celebrities linked: ${stats.celebritiesLinked}`)
    console.log(`  Errors: ${stats.errors}`)
    if (dryRun) {
      console.log("  (Dry run - no changes made)")
    }
  } finally {
    await closeRedis()
    await resetPool()
  }
}

// Only run if executed directly (not imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  const program = new Command()
    .name("backfill-death-links")
    .description(
      "Backfill missing TMDB IDs for death page links (projects and related celebrities)"
    )
    .option("-l, --limit <number>", "Limit number of records to process", parsePositiveInt, 1000)
    .option("-n, --dry-run", "Preview without writing to database")
    .action(async (options) => {
      await backfillDeathLinks({
        limit: options.limit,
        dryRun: options.dryRun || false,
      })
    })

  program.parse()
}
