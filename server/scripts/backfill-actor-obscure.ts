#!/usr/bin/env tsx
/**
 * Backfill script to calculate and update the is_obscure column in the actors table.
 *
 * An actor is considered NOT obscure if ANY of these conditions are true:
 * - Has appeared in a movie with popularity >= 20 (hit film)
 * - Has appeared in a TV show with popularity >= 20 (hit show)
 * - Has 3+ English movies with popularity >= 5 (established in English film market)
 * - Has 3+ English TV shows with popularity >= 5 (established in English TV market)
 * - Has 10+ movies total (prolific film actor)
 * - Has 50+ TV episodes total (prolific TV actor)
 *
 * Usage:
 *   npm run backfill:actor-obscure              # Update all actors
 *   npm run backfill:actor-obscure -- --dry-run # Preview without updating
 *   npm run backfill:actor-obscure -- --stats   # Show obscure statistics only
 */

import { withNewRelicTransaction } from "../src/lib/newrelic-cli.js"
import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"

// Thresholds for obscurity detection
export const THRESHOLDS = {
  HIT_MOVIE_POPULARITY: 20,
  HIT_SHOW_POPULARITY: 20,
  ENGLISH_CONTENT_POPULARITY: 5,
  MIN_ENGLISH_MOVIES: 3,
  MIN_ENGLISH_SHOWS: 3,
  MIN_TOTAL_MOVIES: 10,
  MIN_TOTAL_EPISODES: 50,
}

interface BackfillOptions {
  dryRun?: boolean
  stats?: boolean
}

interface StatsRow {
  total: string
  obscure: string
  not_obscure: string
  hit_movie: string
  hit_show: string
  english_movies: string
  english_shows: string
  prolific_movies: string
  prolific_tv: string
}

const program = new Command()
  .name("backfill-actor-obscure")
  .description("Calculate and update is_obscure for all actors based on movie/TV appearances")
  .option("-n, --dry-run", "Preview changes without updating the database")
  .option("-s, --stats", "Show obscure statistics only, without backfilling")
  .action(async (options) => {
    await withNewRelicTransaction("backfill-actor-obscure", async (recordMetrics) => {
      const result = await runBackfill(options)
      if (result) {
        recordMetrics({
          recordsProcessed: result.totalProcessed,
          recordsUpdated: result.totalUpdated,
        })
      }
    })
  })

async function showStats(closePool = true): Promise<void> {
  const db = getPool()

  try {
    const result = await db.query<StatsRow>(
      `
      WITH actor_metrics AS (
        SELECT
          a.tmdb_id,
          COALESCE(ma.max_movie_pop, 0) as max_movie_pop,
          COALESCE(ta.max_show_pop, 0) as max_show_pop,
          COALESCE(ma.en_movies_pop5, 0) as en_movies_pop5,
          COALESCE(ta.en_shows_pop5, 0) as en_shows_pop5,
          COALESCE(ma.movie_count, 0) as movie_count,
          COALESCE(ta.episode_count, 0) as episode_count,
          a.is_obscure
        FROM actors a
        LEFT JOIN (
          SELECT
            ama.actor_tmdb_id,
            COUNT(*)::int as movie_count,
            MAX(m.popularity) as max_movie_pop,
            COUNT(*) FILTER (WHERE m.original_language = 'en' AND m.popularity >= $1)::int as en_movies_pop5
          FROM actor_movie_appearances ama
          JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
          GROUP BY ama.actor_tmdb_id
        ) ma ON ma.actor_tmdb_id = a.tmdb_id
        LEFT JOIN (
          SELECT
            asa.actor_tmdb_id,
            COUNT(*)::int as episode_count,
            MAX(s.popularity) as max_show_pop,
            COUNT(DISTINCT asa.show_tmdb_id) FILTER (WHERE s.original_language = 'en' AND s.popularity >= $1)::int as en_shows_pop5
          FROM actor_show_appearances asa
          JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
          GROUP BY asa.actor_tmdb_id
        ) ta ON ta.actor_tmdb_id = a.tmdb_id
        WHERE a.deathday IS NOT NULL
      )
      SELECT
        COUNT(*)::text as total,
        COUNT(*) FILTER (WHERE is_obscure = true)::text as obscure,
        COUNT(*) FILTER (WHERE is_obscure = false)::text as not_obscure,
        COUNT(*) FILTER (WHERE max_movie_pop >= $2)::text as hit_movie,
        COUNT(*) FILTER (WHERE max_show_pop >= $3)::text as hit_show,
        COUNT(*) FILTER (WHERE en_movies_pop5 >= $4)::text as english_movies,
        COUNT(*) FILTER (WHERE en_shows_pop5 >= $5)::text as english_shows,
        COUNT(*) FILTER (WHERE movie_count >= $6)::text as prolific_movies,
        COUNT(*) FILTER (WHERE episode_count >= $7)::text as prolific_tv
      FROM actor_metrics
    `,
      [
        THRESHOLDS.ENGLISH_CONTENT_POPULARITY,
        THRESHOLDS.HIT_MOVIE_POPULARITY,
        THRESHOLDS.HIT_SHOW_POPULARITY,
        THRESHOLDS.MIN_ENGLISH_MOVIES,
        THRESHOLDS.MIN_ENGLISH_SHOWS,
        THRESHOLDS.MIN_TOTAL_MOVIES,
        THRESHOLDS.MIN_TOTAL_EPISODES,
      ]
    )

    const stats = result.rows[0]
    const total = parseInt(stats.total, 10)
    const obscure = parseInt(stats.obscure, 10)
    const notObscure = parseInt(stats.not_obscure, 10)

    console.log("\n" + "=".repeat(70))
    console.log("ACTOR OBSCURITY STATISTICS")
    console.log("=".repeat(70))
    console.log(`\nTotal deceased actors: ${total.toLocaleString()}`)

    if (total === 0) {
      console.log("\nNo deceased actors in database.")
      console.log("=".repeat(70) + "\n")
      return
    }

    console.log(`\nObscure classification:`)
    console.log(
      `  Obscure:     ${obscure.toLocaleString()} (${((obscure / total) * 100).toFixed(1)}%)`
    )
    console.log(
      `  Not obscure: ${notObscure.toLocaleString()} (${((notObscure / total) * 100).toFixed(1)}%)`
    )

    console.log(`\nNot obscure due to (overlapping counts):`)
    console.log(
      `  Hit movie (pop >= ${THRESHOLDS.HIT_MOVIE_POPULARITY}):              ${stats.hit_movie}`
    )
    console.log(
      `  Hit TV show (pop >= ${THRESHOLDS.HIT_SHOW_POPULARITY}):            ${stats.hit_show}`
    )
    console.log(
      `  ${THRESHOLDS.MIN_ENGLISH_MOVIES}+ English movies (pop >= ${THRESHOLDS.ENGLISH_CONTENT_POPULARITY}):     ${stats.english_movies}`
    )
    console.log(
      `  ${THRESHOLDS.MIN_ENGLISH_SHOWS}+ English TV shows (pop >= ${THRESHOLDS.ENGLISH_CONTENT_POPULARITY}):   ${stats.english_shows}`
    )
    console.log(
      `  ${THRESHOLDS.MIN_TOTAL_MOVIES}+ movies total:               ${stats.prolific_movies}`
    )
    console.log(
      `  ${THRESHOLDS.MIN_TOTAL_EPISODES}+ TV episodes total:          ${stats.prolific_tv}`
    )
    console.log("=".repeat(70) + "\n")
  } finally {
    if (closePool) {
      await db.end()
    }
  }
}

interface BackfillResult {
  totalProcessed: number
  totalUpdated: number
}

/**
 * Calculate is_obscure for all actors based on movie and TV appearances.
 * This is done in a single SQL query for efficiency.
 */
async function runBackfill(options: BackfillOptions): Promise<BackfillResult | null> {
  const { dryRun = false, stats = false } = options

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required")
    process.exit(1)
  }

  // Stats-only mode
  if (stats) {
    await showStats()
    return null
  }

  console.log("\nCalculating obscurity for all actors based on movie/TV appearances...")
  if (dryRun) console.log("(DRY RUN - no changes will be made)")
  console.log()

  const db = getPool()

  try {
    // First, show what would change
    const previewResult = await db.query<{
      would_be_obscure: boolean
      current_obscure: boolean
      count: string
    }>(
      `
      WITH actor_metrics AS (
        SELECT
          a.tmdb_id,
          a.is_obscure as current_obscure,
          CASE
            WHEN COALESCE(ma.max_movie_pop, 0) >= $1 THEN false
            WHEN COALESCE(ta.max_show_pop, 0) >= $2 THEN false
            WHEN COALESCE(ma.en_movies_pop5, 0) >= $3 THEN false
            WHEN COALESCE(ta.en_shows_pop5, 0) >= $4 THEN false
            WHEN COALESCE(ma.movie_count, 0) >= $5 THEN false
            WHEN COALESCE(ta.episode_count, 0) >= $6 THEN false
            ELSE true
          END as would_be_obscure
        FROM actors a
        LEFT JOIN (
          SELECT
            ama.actor_tmdb_id,
            COUNT(*)::int as movie_count,
            MAX(m.popularity) as max_movie_pop,
            COUNT(*) FILTER (WHERE m.original_language = 'en' AND m.popularity >= $7)::int as en_movies_pop5
          FROM actor_movie_appearances ama
          JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
          GROUP BY ama.actor_tmdb_id
        ) ma ON ma.actor_tmdb_id = a.tmdb_id
        LEFT JOIN (
          SELECT
            asa.actor_tmdb_id,
            COUNT(*)::int as episode_count,
            MAX(s.popularity) as max_show_pop,
            COUNT(DISTINCT asa.show_tmdb_id) FILTER (WHERE s.original_language = 'en' AND s.popularity >= $7)::int as en_shows_pop5
          FROM actor_show_appearances asa
          JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
          GROUP BY asa.actor_tmdb_id
        ) ta ON ta.actor_tmdb_id = a.tmdb_id
        WHERE a.deathday IS NOT NULL
      )
      SELECT
        would_be_obscure,
        current_obscure,
        COUNT(*)::text as count
      FROM actor_metrics
      GROUP BY would_be_obscure, current_obscure
      ORDER BY would_be_obscure, current_obscure
    `,
      [
        THRESHOLDS.HIT_MOVIE_POPULARITY,
        THRESHOLDS.HIT_SHOW_POPULARITY,
        THRESHOLDS.MIN_ENGLISH_MOVIES,
        THRESHOLDS.MIN_ENGLISH_SHOWS,
        THRESHOLDS.MIN_TOTAL_MOVIES,
        THRESHOLDS.MIN_TOTAL_EPISODES,
        THRESHOLDS.ENGLISH_CONTENT_POPULARITY,
      ]
    )

    console.log("Preview of changes:")
    let totalChanges = 0
    for (const row of previewResult.rows) {
      const from = row.current_obscure ? "OBSCURE" : "VISIBLE"
      const to = row.would_be_obscure ? "OBSCURE" : "VISIBLE"
      const changed = row.current_obscure !== row.would_be_obscure
      const changeLabel = changed ? " [CHANGE]" : ""
      console.log(`  ${from.padEnd(8)} -> ${to.padEnd(8)} : ${row.count}${changeLabel}`)
      if (changed) totalChanges += parseInt(row.count, 10)
    }
    console.log(`\nTotal actors that will change: ${totalChanges}`)

    if (dryRun) {
      console.log("\n(DRY RUN - no changes made)")
      await showStats(false)
      // Calculate total processed from preview
      const totalProcessed = previewResult.rows.reduce(
        (sum, row) => sum + parseInt(row.count, 10),
        0
      )
      return { totalProcessed, totalUpdated: 0 }
    }

    // Perform the update
    console.log("\nUpdating actors...")
    const updateResult = await db.query<{ updated: string }>(
      `
      WITH actor_metrics AS (
        SELECT
          a.tmdb_id,
          CASE
            WHEN COALESCE(ma.max_movie_pop, 0) >= $1 THEN false
            WHEN COALESCE(ta.max_show_pop, 0) >= $2 THEN false
            WHEN COALESCE(ma.en_movies_pop5, 0) >= $3 THEN false
            WHEN COALESCE(ta.en_shows_pop5, 0) >= $4 THEN false
            WHEN COALESCE(ma.movie_count, 0) >= $5 THEN false
            WHEN COALESCE(ta.episode_count, 0) >= $6 THEN false
            ELSE true
          END as is_obscure
        FROM actors a
        LEFT JOIN (
          SELECT
            ama.actor_tmdb_id,
            COUNT(*)::int as movie_count,
            MAX(m.popularity) as max_movie_pop,
            COUNT(*) FILTER (WHERE m.original_language = 'en' AND m.popularity >= $7)::int as en_movies_pop5
          FROM actor_movie_appearances ama
          JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
          GROUP BY ama.actor_tmdb_id
        ) ma ON ma.actor_tmdb_id = a.tmdb_id
        LEFT JOIN (
          SELECT
            asa.actor_tmdb_id,
            COUNT(*)::int as episode_count,
            MAX(s.popularity) as max_show_pop,
            COUNT(DISTINCT asa.show_tmdb_id) FILTER (WHERE s.original_language = 'en' AND s.popularity >= $7)::int as en_shows_pop5
          FROM actor_show_appearances asa
          JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
          GROUP BY asa.actor_tmdb_id
        ) ta ON ta.actor_tmdb_id = a.tmdb_id
        WHERE a.deathday IS NOT NULL
      )
      UPDATE actors a
      SET is_obscure = am.is_obscure
      FROM actor_metrics am
      WHERE a.tmdb_id = am.tmdb_id
      RETURNING a.tmdb_id
    `,
      [
        THRESHOLDS.HIT_MOVIE_POPULARITY,
        THRESHOLDS.HIT_SHOW_POPULARITY,
        THRESHOLDS.MIN_ENGLISH_MOVIES,
        THRESHOLDS.MIN_ENGLISH_SHOWS,
        THRESHOLDS.MIN_TOTAL_MOVIES,
        THRESHOLDS.MIN_TOTAL_EPISODES,
        THRESHOLDS.ENGLISH_CONTENT_POPULARITY,
      ]
    )

    const totalUpdated = updateResult.rowCount || 0
    console.log(`Updated ${totalUpdated} actors.`)

    // Show final stats (don't close pool here, we'll close it in finally)
    await showStats(false)

    // Calculate total processed from preview
    const totalProcessed = previewResult.rows.reduce((sum, row) => sum + parseInt(row.count, 10), 0)

    return { totalProcessed, totalUpdated }
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
