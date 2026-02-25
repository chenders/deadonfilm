/**
 * Admin movie routes
 *
 * Provides batch enrichment capabilities for movies — enriching all unenriched
 * deceased cast members' biographies or death details in one action.
 */

import { Router, type Request, type Response } from "express"
import { getPool } from "../../lib/db.js"
import { logger } from "../../lib/logger.js"
import { logAdminAction } from "../../lib/admin-auth.js"

const router = Router()

/**
 * Parse comma-separated TMDB IDs from query param
 */
function parseTmdbIds(param: unknown): number[] {
  if (typeof param !== "string" || !param.trim()) return []
  return param
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
}

/**
 * GET /:tmdbId/enrichment-status
 *
 * Returns counts and internal IDs of actors needing bio or death enrichment.
 * Accepts ?tmdbIds=123,456,789 to filter to specific cast members.
 */
router.get("/:tmdbId/enrichment-status", async (req: Request, res: Response): Promise<void> => {
  try {
    const tmdbIds = parseTmdbIds(req.query.tmdbIds)

    if (tmdbIds.length === 0) {
      res.json({
        totalDeceased: 0,
        needsBioEnrichment: [],
        needsDeathEnrichment: [],
      })
      return
    }

    const pool = getPool()

    const result = await pool.query<{
      id: number
      tmdb_id: number
      name: string
      enriched_at: string | null
      cause_of_death: string | null
      has_bio_enrichment: boolean
    }>(
      `SELECT a.id, a.tmdb_id, a.name, a.enriched_at, a.cause_of_death,
              (abd.actor_id IS NOT NULL) AS has_bio_enrichment
       FROM actors a
       LEFT JOIN actor_biography_details abd ON abd.actor_id = a.id
       WHERE a.tmdb_id = ANY($1::int[])
         AND a.deathday IS NOT NULL`,
      [tmdbIds]
    )

    const needsBioEnrichment: number[] = []
    const needsDeathEnrichment: number[] = []

    for (const row of result.rows) {
      if (!row.has_bio_enrichment) {
        needsBioEnrichment.push(row.id)
      }
      if (!row.enriched_at || !row.cause_of_death) {
        needsDeathEnrichment.push(row.id)
      }
    }

    res.json({
      totalDeceased: result.rows.length,
      needsBioEnrichment,
      needsDeathEnrichment,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch movie enrichment status")
    res.status(500).json({ error: { message: "Failed to fetch enrichment status" } })
  }
})

/**
 * POST /:tmdbId/enrich-bios
 *
 * Queues batch biography enrichment for unenriched deceased actors in a movie.
 */
router.post("/:tmdbId/enrich-bios", async (req: Request, res: Response): Promise<void> => {
  try {
    const movieTmdbId = parseInt(req.params.tmdbId, 10)
    const { tmdbIds } = req.body as { tmdbIds?: number[] }

    if (!tmdbIds || !Array.isArray(tmdbIds) || tmdbIds.length === 0) {
      res.status(400).json({ error: { message: "tmdbIds array is required" } })
      return
    }

    const pool = getPool()

    // Find internal IDs for actors needing bio enrichment
    const result = await pool.query<{ id: number }>(
      `SELECT a.id
       FROM actors a
       LEFT JOIN actor_biography_details abd ON abd.actor_id = a.id
       WHERE a.tmdb_id = ANY($1::int[])
         AND a.deathday IS NOT NULL
         AND abd.actor_id IS NULL`,
      [tmdbIds]
    )

    const actorIds = result.rows.map((r) => r.id)

    if (actorIds.length === 0) {
      res.json({ success: true, actorCount: 0, message: "All actors already have biographies" })
      return
    }

    await logAdminAction({
      action: "movie_batch_enrich_bios",
      resourceType: "movie",
      resourceId: movieTmdbId,
      details: { actorIds, movieTmdbId },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    // Queue the batch job
    const { queueManager } = await import("../../lib/jobs/queue-manager.js")
    const { JobType } = await import("../../lib/jobs/types.js")

    if (!queueManager.isReady) {
      res.status(503).json({
        error: {
          message: "Job queue is not available. Ensure REDIS_JOBS_URL is configured.",
        },
      })
      return
    }

    // Create run record
    const config = { actorIds, limit: actorIds.length }
    const runResult = await pool.query<{ id: number }>(
      `INSERT INTO bio_enrichment_runs (status, config, started_at)
       VALUES ('pending', $1, NOW()) RETURNING id`,
      [JSON.stringify(config)]
    )
    const runId = runResult.rows[0].id

    const jobId = await queueManager.addJob(
      JobType.ENRICH_BIOGRAPHIES_BATCH,
      {
        runId,
        actorIds,
        limit: actorIds.length,
        allowRegeneration: false,
        sortBy: "popularity",
        useStaging: false,
      },
      { createdBy: "admin" }
    )

    await pool.query(`UPDATE bio_enrichment_runs SET status = 'running' WHERE id = $1`, [runId])

    logger.info(
      { runId, jobId, actorCount: actorIds.length, movieTmdbId },
      "Movie batch bio enrichment started"
    )

    res.json({ success: true, jobId, runId, actorCount: actorIds.length })
  } catch (error) {
    logger.error({ error }, "Failed to start movie batch bio enrichment")
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ error: { message: errorMsg } })
  }
})

/**
 * POST /:tmdbId/enrich-deaths
 *
 * Starts death enrichment for unenriched deceased actors in a movie.
 */
router.post("/:tmdbId/enrich-deaths", async (req: Request, res: Response): Promise<void> => {
  try {
    const movieTmdbId = parseInt(req.params.tmdbId, 10)
    const { tmdbIds } = req.body as { tmdbIds?: number[] }

    if (!tmdbIds || !Array.isArray(tmdbIds) || tmdbIds.length === 0) {
      res.status(400).json({ error: { message: "tmdbIds array is required" } })
      return
    }

    const pool = getPool()

    // Find internal IDs for actors needing death enrichment
    const result = await pool.query<{ id: number }>(
      `SELECT a.id
       FROM actors a
       WHERE a.tmdb_id = ANY($1::int[])
         AND a.deathday IS NOT NULL
         AND (a.enriched_at IS NULL OR a.cause_of_death IS NULL)`,
      [tmdbIds]
    )

    const actorIds = result.rows.map((r) => r.id)

    if (actorIds.length === 0) {
      res.json({ success: true, actorCount: 0, message: "All actors already have death info" })
      return
    }

    await logAdminAction({
      action: "movie_batch_enrich_deaths",
      resourceType: "movie",
      resourceId: movieTmdbId,
      details: { actorIds, movieTmdbId },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    const { startEnrichmentRun } = await import("../../lib/enrichment-process-manager.js")

    const runId = await startEnrichmentRun({
      actorIds,
      limit: actorIds.length,
      free: true,
      claudeCleanup: true,
      followLinks: true,
    })

    logger.info(
      { runId, actorCount: actorIds.length, movieTmdbId },
      "Movie batch death enrichment started"
    )

    res.json({ success: true, runId, actorCount: actorIds.length })
  } catch (error) {
    logger.error({ error }, "Failed to start movie batch death enrichment")
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ error: { message: errorMsg } })
  }
})

export default router
