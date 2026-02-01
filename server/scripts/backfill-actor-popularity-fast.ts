#!/usr/bin/env tsx
/**
 * Fast backfill of actor DOF popularity scores
 *
 * Uses efficient SQL aggregation instead of per-actor queries.
 * Processes all actors in a single pass with bulk updates.
 *
 * Usage:
 *   npx tsx scripts/backfill-actor-popularity-fast.ts
 *   npx tsx scripts/backfill-actor-popularity-fast.ts --recalculate   # Recalculate all
 *   npx tsx scripts/backfill-actor-popularity-fast.ts --dry-run       # Preview
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { logPercentile } from "../src/lib/popularity-score.js"

// Constants from popularity-score.ts
const ACTOR_FILMOGRAPHY_WEIGHT = 0.7
const ACTOR_TMDB_RECENCY_WEIGHT = 0.3
const MIN_APPEARANCES_FULL_CONFIDENCE = 10
const MAX_APPEARANCES_FOR_SCORE = 10

const TMDB_POPULARITY_THRESHOLDS = {
  p25: 5,
  p50: 15,
  p75: 40,
  p90: 100,
  p99: 500,
}

interface Options {
  recalculate?: boolean
  batchSize: number
  dryRun?: boolean
}

interface ActorAggregatedData {
  actor_id: number
  tmdb_popularity: string | null
  filmography_sum: string | null
  filmography_count: string | null
}

const program = new Command()
  .name("backfill-actor-popularity-fast")
  .description("Fast backfill of actor DOF popularity scores using SQL aggregation")
  .option("--recalculate", "Recalculate all, not just missing scores")
  .option("-b, --batch-size <n>", "Batch size for updates", parseInt, 5000)
  .option("-n, --dry-run", "Preview without updating database")
  .action(async (options) => {
    await run(options)
  })

async function run(options: Options): Promise<void> {
  const pool = getPool()

  console.log("\n=== Fast Actor DOF Popularity Backfill ===")
  if (options.dryRun) console.log("(DRY RUN - no changes will be made)\n")

  try {
    const whereClause = options.recalculate ? "" : "AND a.dof_popularity IS NULL"

    // Single query to aggregate all actor filmography data
    console.log("Aggregating filmography data (this may take a moment)...")

    // Use top-10 algorithm: rank contributions and only average the best ones
    const result = await pool.query<ActorAggregatedData>(
      `
      WITH movie_contributions AS (
        -- Calculate movie contributions per actor with row number for top-N selection
        SELECT
          ama.actor_id,
          -- contentScore = dof_popularity * 0.6 + dof_weight * 0.4
          (COALESCE(m.dof_popularity, 0) * 0.6 + COALESCE(m.dof_weight, 0) * 0.4)
          *
          -- billingWeight: 1.0 (1-3), 0.7 (4-10), 0.4 (11+ or null)
          CASE
            WHEN ama.billing_order IS NULL THEN 0.4
            WHEN ama.billing_order <= 3 THEN 1.0
            WHEN ama.billing_order <= 10 THEN 0.7
            ELSE 0.4
          END
          AS contribution,
          m.dof_popularity IS NOT NULL OR m.dof_weight IS NOT NULL AS has_score
        FROM actor_movie_appearances ama
        JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
      ),
      show_episode_counts AS (
        -- First: count episodes per actor-show and get min billing order
        SELECT
          asa.actor_id,
          asa.show_tmdb_id,
          s.dof_popularity,
          s.dof_weight,
          MIN(asa.billing_order) AS min_billing_order,
          COUNT(*) AS episode_count
        FROM actor_show_appearances asa
        JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
        GROUP BY asa.actor_id, asa.show_tmdb_id, s.dof_popularity, s.dof_weight
      ),
      show_contributions AS (
        -- Second: calculate contributions per actor-show
        SELECT
          actor_id,
          -- contentScore = dof_popularity * 0.6 + dof_weight * 0.4
          (COALESCE(dof_popularity, 0) * 0.6 + COALESCE(dof_weight, 0) * 0.4)
          *
          -- billingWeight: 1.0 (1-3), 0.7 (4-10), 0.4 (11+ or null)
          CASE
            WHEN min_billing_order IS NULL THEN 0.4
            WHEN min_billing_order <= 3 THEN 1.0
            WHEN min_billing_order <= 10 THEN 0.7
            ELSE 0.4
          END
          *
          -- episodeWeight = min(1.0, episodeCount / 20)
          LEAST(1.0, episode_count::float / 20.0)
          AS contribution,
          dof_popularity IS NOT NULL OR dof_weight IS NOT NULL AS has_score
        FROM show_episode_counts
      ),
      all_contributions AS (
        -- Combine all contributions from movies and shows
        SELECT actor_id, contribution, has_score FROM movie_contributions
        UNION ALL
        SELECT actor_id, contribution, has_score FROM show_contributions
      ),
      ranked_contributions AS (
        -- Rank contributions per actor (highest first) for top-N selection
        SELECT
          actor_id,
          contribution,
          has_score,
          ROW_NUMBER() OVER (PARTITION BY actor_id ORDER BY contribution DESC) AS rank
        FROM all_contributions
        WHERE has_score = true
      ),
      top_n_totals AS (
        -- Sum only top N contributions per actor (matching calculateActorPopularity)
        SELECT
          actor_id,
          SUM(contribution) AS filmography_sum,
          COUNT(*) AS filmography_count,
          (SELECT COUNT(*) FROM ranked_contributions rc2 WHERE rc2.actor_id = ranked_contributions.actor_id) AS total_appearances
        FROM ranked_contributions
        WHERE rank <= ${MAX_APPEARANCES_FOR_SCORE}
        GROUP BY actor_id
      )
      SELECT
        a.id AS actor_id,
        a.tmdb_popularity::text AS tmdb_popularity,
        t.filmography_sum::text AS filmography_sum,
        t.filmography_count::text AS filmography_count
      FROM actors a
      LEFT JOIN top_n_totals t ON t.actor_id = a.id
      WHERE 1=1 ${whereClause}
      ORDER BY a.id
      `
    )

    const total = result.rows.length
    console.log(`Found ${total.toLocaleString()} actors to process\n`)

    if (total === 0) {
      console.log("No actors need processing.\n")
      return
    }

    let updated = 0
    let skipped = 0
    const batchSize = Number(options.batchSize) || 5000
    const updates: { id: number; dofPopularity: number; confidence: number }[] = []

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i]
      const filmographySum = row.filmography_sum ? Number(row.filmography_sum) : 0
      const filmographyCount = row.filmography_count ? Number(row.filmography_count) : 0
      const tmdbPopularity = row.tmdb_popularity ? Number(row.tmdb_popularity) : null

      // Skip actors with no valid appearances
      if (filmographyCount === 0) {
        skipped++
        continue
      }

      // Calculate filmography score (average)
      const filmographyScore = filmographySum / filmographyCount

      // Calculate final score
      let finalScore: number
      if (tmdbPopularity !== null) {
        const tmdbScore = logPercentile(tmdbPopularity, TMDB_POPULARITY_THRESHOLDS) ?? 0
        finalScore =
          filmographyScore * ACTOR_FILMOGRAPHY_WEIGHT + tmdbScore * ACTOR_TMDB_RECENCY_WEIGHT
      } else {
        finalScore = filmographyScore
      }

      // Calculate confidence
      const confidence = Math.min(1.0, filmographyCount / MIN_APPEARANCES_FULL_CONFIDENCE)

      // Round and clamp
      const dofPopularity = Math.round(Math.min(100, Math.max(0, finalScore)) * 100) / 100
      const roundedConfidence = Math.round(confidence * 100) / 100

      updates.push({ id: row.actor_id, dofPopularity, confidence: roundedConfidence })
      updated++

      // Batch update
      if (updates.length >= batchSize || i === result.rows.length - 1) {
        if (!options.dryRun && updates.length > 0) {
          // Use unnest for efficient bulk update
          const ids = updates.map((u) => u.id)
          const pops = updates.map((u) => u.dofPopularity)
          const confs = updates.map((u) => u.confidence)

          await pool.query(
            `
            UPDATE actors AS a
            SET
              dof_popularity = u.dof_popularity,
              dof_popularity_confidence = u.confidence,
              dof_popularity_updated_at = NOW()
            FROM (
              SELECT
                unnest($1::int[]) AS id,
                unnest($2::numeric[]) AS dof_popularity,
                unnest($3::numeric[]) AS confidence
            ) AS u
            WHERE a.id = u.id
            `,
            [ids, pops, confs]
          )
        }

        const pct = (((i + 1) / total) * 100).toFixed(1)
        process.stdout.write(
          `\r  Progress: ${(i + 1).toLocaleString()}/${total.toLocaleString()} (${pct}%) - Updated: ${updated.toLocaleString()}, Skipped: ${skipped.toLocaleString()}`
        )

        updates.length = 0 // Clear the array
      }
    }

    console.log(
      `\n\n  Actors complete: ${updated.toLocaleString()} updated, ${skipped.toLocaleString()} skipped\n`
    )

    console.log("=== Backfill Complete ===\n")
  } catch (error) {
    console.error("\nFatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

program.parse()
