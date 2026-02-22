/**
 * Admin API routes for DOF popularity management.
 *
 * Provides endpoints for:
 * - Popularity distribution statistics
 * - Top actors by DOF popularity
 * - Low-confidence actors that may need review
 * - Recalculation triggers
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

const router = Router()

// ============================================================================
// GET /admin/api/popularity/stats
// Overall popularity statistics
// ============================================================================

router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Get overall stats for actors, movies, and shows
    const [actorStats, movieStats, showStats] = await Promise.all([
      pool.query<{
        total: string
        with_score: string
        avg_score: string
        avg_confidence: string
        high_confidence: string
        low_confidence: string
      }>(`
        SELECT
          COUNT(*) as total,
          COUNT(dof_popularity) as with_score,
          ROUND(AVG(dof_popularity)::numeric, 2) as avg_score,
          ROUND(AVG(dof_popularity_confidence)::numeric, 2) as avg_confidence,
          COUNT(*) FILTER (WHERE dof_popularity_confidence >= 0.5) as high_confidence,
          COUNT(*) FILTER (WHERE dof_popularity_confidence < 0.5 AND dof_popularity IS NOT NULL) as low_confidence
        FROM actors
        WHERE deathday IS NOT NULL
      `),
      pool.query<{
        total: string
        with_score: string
        avg_score: string
        avg_weight: string
      }>(`
        SELECT
          COUNT(*) as total,
          COUNT(dof_popularity) as with_score,
          ROUND(AVG(dof_popularity)::numeric, 2) as avg_score,
          ROUND(AVG(dof_weight)::numeric, 2) as avg_weight
        FROM movies
      `),
      pool.query<{
        total: string
        with_score: string
        avg_score: string
        avg_weight: string
      }>(`
        SELECT
          COUNT(*) as total,
          COUNT(dof_popularity) as with_score,
          ROUND(AVG(dof_popularity)::numeric, 2) as avg_score,
          ROUND(AVG(dof_weight)::numeric, 2) as avg_weight
        FROM shows
      `),
    ])

    // Get score distribution buckets for actors
    const distributionResult = await pool.query<{
      bucket: string
      count: string
    }>(`
      SELECT
        CASE
          WHEN dof_popularity >= 50 THEN '50-100 (Top)'
          WHEN dof_popularity >= 40 THEN '40-50 (High)'
          WHEN dof_popularity >= 30 THEN '30-40 (Medium)'
          WHEN dof_popularity >= 20 THEN '20-30 (Low)'
          ELSE '0-20 (Minimal)'
        END as bucket,
        COUNT(*) as count
      FROM actors
      WHERE dof_popularity IS NOT NULL
        AND deathday IS NOT NULL
      GROUP BY bucket
      ORDER BY bucket DESC
    `)

    const actors = actorStats.rows[0]
    const movies = movieStats.rows[0]
    const shows = showStats.rows[0]

    res.json({
      actors: {
        total: parseInt(actors?.total ?? "0", 10),
        withScore: parseInt(actors?.with_score ?? "0", 10),
        avgScore: parseFloat(actors?.avg_score ?? "0") || 0,
        avgConfidence: parseFloat(actors?.avg_confidence ?? "0") || 0,
        highConfidence: parseInt(actors?.high_confidence ?? "0", 10),
        lowConfidence: parseInt(actors?.low_confidence ?? "0", 10),
      },
      movies: {
        total: parseInt(movies?.total ?? "0", 10),
        withScore: parseInt(movies?.with_score ?? "0", 10),
        avgScore: parseFloat(movies?.avg_score ?? "0") || 0,
        avgWeight: parseFloat(movies?.avg_weight ?? "0") || 0,
      },
      shows: {
        total: parseInt(shows?.total ?? "0", 10),
        withScore: parseInt(shows?.with_score ?? "0", 10),
        avgScore: parseFloat(shows?.avg_score ?? "0") || 0,
        avgWeight: parseFloat(shows?.avg_weight ?? "0") || 0,
      },
      distribution: distributionResult.rows.map((row) => ({
        bucket: row.bucket,
        count: parseInt(row.count, 10),
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch popularity stats")
    res.status(500).json({ error: { message: "Failed to fetch popularity stats" } })
  }
})

// ============================================================================
// GET /admin/api/popularity/top-actors
// Top actors by DOF popularity with high confidence
// ============================================================================

router.get("/top-actors", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 100))
    const minConfidence = parseFloat(req.query.minConfidence as string) || 0.5

    const result = await pool.query<{
      id: number
      tmdb_id: number | null
      name: string
      dof_popularity_text: string
      dof_popularity_confidence_text: string
      tmdb_popularity_text: string | null
      deathday: string | null
      profile_path: string | null
    }>(
      `
      SELECT
        id, tmdb_id, name,
        dof_popularity::text AS dof_popularity_text,
        dof_popularity_confidence::text AS dof_popularity_confidence_text,
        tmdb_popularity::text AS tmdb_popularity_text,
        deathday, profile_path
      FROM actors
      WHERE dof_popularity IS NOT NULL
        AND dof_popularity_confidence >= $1
      ORDER BY dof_popularity DESC
      LIMIT $2
    `,
      [minConfidence, limit]
    )

    res.json({
      actors: result.rows.map((row) => ({
        id: row.id,
        tmdbId: row.tmdb_id,
        name: row.name,
        dofPopularity: parseFloat(row.dof_popularity_text),
        confidence: parseFloat(row.dof_popularity_confidence_text),
        tmdbPopularity: row.tmdb_popularity_text ? parseFloat(row.tmdb_popularity_text) : null,
        deathday: row.deathday,
        profilePath: row.profile_path,
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch top actors")
    res.status(500).json({ error: { message: "Failed to fetch top actors" } })
  }
})

// ============================================================================
// GET /admin/api/popularity/low-confidence
// Actors with low confidence scores that may need review
// ============================================================================

router.get("/low-confidence", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 100))
    const maxConfidence = parseFloat(req.query.maxConfidence as string) || 0.3

    const result = await pool.query<{
      id: number
      tmdb_id: number | null
      name: string
      dof_popularity_text: string
      dof_popularity_confidence_text: string
      tmdb_popularity_text: string | null
      movie_count: string
      show_count: string
    }>(
      `
      SELECT
        a.id, a.tmdb_id, a.name,
        a.dof_popularity::text AS dof_popularity_text,
        a.dof_popularity_confidence::text AS dof_popularity_confidence_text,
        a.tmdb_popularity::text AS tmdb_popularity_text,
        (SELECT COUNT(*) FROM actor_movie_appearances WHERE actor_id = a.id)::text as movie_count,
        (SELECT COUNT(DISTINCT show_tmdb_id) FROM actor_show_appearances WHERE actor_id = a.id)::text as show_count
      FROM actors a
      WHERE a.dof_popularity IS NOT NULL
        AND a.dof_popularity_confidence < $1
        AND a.dof_popularity_confidence > 0
        AND a.deathday IS NOT NULL
      ORDER BY a.dof_popularity DESC
      LIMIT $2
    `,
      [maxConfidence, limit]
    )

    res.json({
      actors: result.rows.map((row) => ({
        id: row.id,
        tmdbId: row.tmdb_id,
        name: row.name,
        dofPopularity: parseFloat(row.dof_popularity_text),
        confidence: parseFloat(row.dof_popularity_confidence_text),
        tmdbPopularity: row.tmdb_popularity_text ? parseFloat(row.tmdb_popularity_text) : null,
        movieCount: parseInt(row.movie_count, 10),
        showCount: parseInt(row.show_count, 10),
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch low confidence actors")
    res.status(500).json({ error: { message: "Failed to fetch low confidence actors" } })
  }
})

// ============================================================================
// GET /admin/api/popularity/missing
// Actors without DOF popularity scores
// ============================================================================

router.get("/missing", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 100))

    const result = await pool.query<{
      id: number
      tmdb_id: number | null
      name: string
      tmdb_popularity: string | null
      movie_count: string
      show_count: string
    }>(
      `
      SELECT
        a.id, a.tmdb_id, a.name, a.tmdb_popularity::text,
        (SELECT COUNT(*) FROM actor_movie_appearances WHERE actor_id = a.id)::text as movie_count,
        (SELECT COUNT(DISTINCT show_tmdb_id) FROM actor_show_appearances WHERE actor_id = a.id)::text as show_count
      FROM actors a
      WHERE a.dof_popularity IS NULL
        AND a.deathday IS NOT NULL
      ORDER BY a.tmdb_popularity DESC NULLS LAST
      LIMIT $1
    `,
      [limit]
    )

    // Also get total count
    const countResult = await pool.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM actors
      WHERE dof_popularity IS NULL
        AND deathday IS NOT NULL
    `)

    res.json({
      totalMissing: parseInt(countResult.rows[0]?.count ?? "0", 10),
      actors: result.rows.map((row) => ({
        id: row.id,
        tmdbId: row.tmdb_id,
        name: row.name,
        tmdbPopularity: row.tmdb_popularity ? parseFloat(row.tmdb_popularity) : null,
        movieCount: parseInt(row.movie_count, 10),
        showCount: parseInt(row.show_count, 10),
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch missing popularity actors")
    res.status(500).json({ error: { message: "Failed to fetch missing popularity actors" } })
  }
})

// ============================================================================
// GET /admin/api/popularity/last-run
// Get the last popularity update run status
// ============================================================================

router.get("/last-run", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const result = await pool.query<{
      id: number
      job_name: string
      started_at: string
      completed_at: string | null
      status: string
      error_message: string | null
      duration_ms: number | null
    }>(
      `
      SELECT id, job_name, started_at, completed_at, status, error_message, duration_ms
      FROM cronjob_runs
      WHERE job_name = 'scheduled-popularity-update'
      ORDER BY started_at DESC
      LIMIT 5
    `
    )

    res.json({
      lastRun: result.rows[0] || null,
      recentRuns: result.rows,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch last popularity run")
    res.status(500).json({ error: { message: "Failed to fetch last popularity run" } })
  }
})

// ============================================================================
// POST /admin/api/popularity/recalculate
// Trigger recalculation of popularity scores
// ============================================================================

router.post("/recalculate", async (req: Request, res: Response): Promise<void> => {
  try {
    const { target } = req.body as {
      target?: "all" | "movies" | "shows" | "actors"
    }

    // Build the command based on target
    const targetArg =
      target === "movies"
        ? "--movies"
        : target === "shows"
          ? "--shows"
          : target === "actors"
            ? "--actors"
            : ""

    res.json({
      message: "Recalculation triggered",
      target: target || "all",
      command: `npm run update:popularity${targetArg ? ` -- ${targetArg}` : ""}`,
      instructions: {
        note: "Run the following command on the server to trigger recalculation:",
        movies: "npm run update:popularity -- --movies",
        shows: "npm run update:popularity -- --shows",
        actors: "npm run update:popularity -- --actors",
        all: "npm run update:popularity",
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to process recalculation request")
    res.status(500).json({ error: { message: "Failed to process recalculation request" } })
  }
})

export default router
