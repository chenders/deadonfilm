/**
 * Admin biography enrichment endpoints.
 *
 * Provides visibility into biography enrichment status, ability to trigger
 * single-actor and batch enrichment, and golden test case scoring.
 */

import { Request, Response, Router } from "express"
import { splitSearchWords } from "../../lib/shared/search-utils.js"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import {
  getBioEnrichmentRuns,
  getBioEnrichmentRunDetails,
  getBioEnrichmentRunActors,
  getBioRunSourcePerformanceStats,
} from "../../lib/db/admin-bio-enrichment-queries.js"
import {
  startBioEnrichmentRun,
  stopBioEnrichmentRun,
  getBioEnrichmentRunProgress,
} from "../../lib/bio-enrichment-process-manager.js"

const router = Router()

// ============================================================================
// GET /admin/api/biography-enrichment
// List actors with their biography enrichment status
// ============================================================================

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))
    const offset = (page - 1) * pageSize
    const searchName = (req.query.searchName as string) || ""
    const needsEnrichment = req.query.needsEnrichment === "true"
    const minPopularity = parseFloat(req.query.minPopularity as string) || 0

    // Build WHERE clause
    const params: unknown[] = []
    let paramIndex = 1
    const conditions: string[] = ["a.deathday IS NOT NULL"]

    if (searchName) {
      const words = splitSearchWords(searchName)
      for (const word of words) {
        conditions.push(`a.name ILIKE $${paramIndex++}`)
        params.push(`%${word}%`)
      }
    }
    if (minPopularity > 0) {
      conditions.push(`COALESCE(a.dof_popularity, 0) >= $${paramIndex++}`)
      params.push(minPopularity)
    }
    if (needsEnrichment) {
      conditions.push(`abd.id IS NULL`)
    }

    const whereClause = conditions.join(" AND ")

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM actors a
       LEFT JOIN actor_biography_details abd ON abd.actor_id = a.id
       WHERE ${whereClause}`,
      params
    )

    // Fetch page
    const dataParams = [...params, pageSize, offset]
    const result = await pool.query(
      `SELECT a.id, a.name, a.dof_popularity, a.deathday,
              abd.id as bio_id, abd.narrative_confidence, abd.narrative_teaser,
              abd.life_notable_factors, abd.updated_at as bio_updated_at,
              a.biography_version
       FROM actors a
       LEFT JOIN actor_biography_details abd ON abd.actor_id = a.id
       WHERE ${whereClause}
       ORDER BY a.dof_popularity DESC NULLS LAST, a.id ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      dataParams
    )

    // Get enrichment stats
    const statsResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE deathday IS NOT NULL) as total_deceased,
         COUNT(*) FILTER (WHERE deathday IS NOT NULL AND id IN (SELECT actor_id FROM actor_biography_details)) as enriched,
         COUNT(*) FILTER (WHERE deathday IS NOT NULL AND id NOT IN (SELECT actor_id FROM actor_biography_details)) as needs_enrichment
       FROM actors`
    )

    res.json({
      actors: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        popularity: row.dof_popularity != null ? parseFloat(row.dof_popularity) : null,
        deathday: row.deathday,
        hasEnrichment: row.bio_id !== null,
        narrativeConfidence: row.narrative_confidence,
        narrativeTeaserPreview: row.narrative_teaser
          ? row.narrative_teaser.substring(0, 100) + "..."
          : null,
        lifeNotableFactors: row.life_notable_factors || [],
        bioUpdatedAt: row.bio_updated_at,
        biographyVersion: row.biography_version,
      })),
      pagination: {
        page,
        pageSize,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / pageSize),
      },
      stats: {
        totalDeceased: parseInt(statsResult.rows[0].total_deceased),
        enriched: parseInt(statsResult.rows[0].enriched),
        needsEnrichment: parseInt(statsResult.rows[0].needs_enrichment),
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch biography enrichment list")
    res.status(500).json({ error: { message: "Failed to fetch biography enrichment list" } })
  }
})

// ============================================================================
// POST /admin/api/biography-enrichment/enrich
// Single-actor synchronous enrichment
// ============================================================================

router.post("/enrich", async (req: Request, res: Response): Promise<void> => {
  const { actorId } = req.body
  if (!actorId || typeof actorId !== "number") {
    res.status(400).json({ error: { message: "actorId is required and must be a number" } })
    return
  }

  const pool = getPool()

  // Fetch actor
  const actorResult = await pool.query(
    `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
            wikipedia_url, biography AS biography_raw_tmdb, biography
     FROM actors WHERE id = $1`,
    [actorId]
  )

  if (actorResult.rows.length === 0) {
    res.status(404).json({ error: { message: "Actor not found" } })
    return
  }

  try {
    const { BiographyEnrichmentOrchestrator } =
      await import("../../lib/biography-sources/orchestrator.js")
    const { writeBiographyToProduction } =
      await import("../../lib/biography-enrichment-db-writer.js")

    const orchestrator = new BiographyEnrichmentOrchestrator()
    const result = await orchestrator.enrichActor(actorResult.rows[0])

    if (result.data && result.data.hasSubstantiveContent) {
      await writeBiographyToProduction(pool, actorId, result.data, result.sources)
    }

    res.json({
      success: true,
      enriched: result.data?.hasSubstantiveContent || false,
      data: result.data,
      stats: result.stats,
    })
  } catch (error) {
    logger.error({ error, actorId }, "Failed to enrich actor biography")
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ error: { message: errorMsg } })
  }
})

// ============================================================================
// POST /admin/api/biography-enrichment/enrich-batch
// Queue a batch enrichment job
// ============================================================================

router.post("/enrich-batch", async (req: Request, res: Response): Promise<void> => {
  const {
    actorIds,
    limit,
    minPopularity,
    confidenceThreshold,
    allowRegeneration,
    useStaging,
    sourceCategories,
  } = req.body

  try {
    const { queueManager } = await import("../../lib/jobs/queue-manager.js")
    const { JobType } = await import("../../lib/jobs/types.js")

    if (!queueManager.isReady) {
      res.status(503).json({
        error: {
          message:
            "Job queue is not available. Ensure REDIS_JOBS_URL is configured and Redis is running.",
        },
      })
      return
    }

    // When specific actor IDs are provided, default to allowing regeneration
    // (user explicitly chose these actors, so re-enriching makes sense)
    const hasSpecificActors = Array.isArray(actorIds) && actorIds.length > 0
    const effectiveAllowRegeneration = allowRegeneration ?? hasSpecificActors

    // Create a bio_enrichment_runs record so the run appears on the runs page
    const pool = getPool()
    const config = {
      actorIds,
      limit: limit || 10,
      minPopularity,
      confidenceThreshold,
      allowRegeneration: effectiveAllowRegeneration,
      useStaging: useStaging || false,
      sourceCategories,
      source: "enrich-batch",
    }
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
        limit: limit || 10,
        minPopularity,
        confidenceThreshold,
        allowRegeneration: effectiveAllowRegeneration,
        useStaging: useStaging || false,
        sourceCategories,
      },
      {
        createdBy: "admin",
      }
    )

    // Mark as running now that job is queued
    await pool.query(`UPDATE bio_enrichment_runs SET status = 'running' WHERE id = $1`, [runId])

    res.json({ success: true, jobId, runId })
  } catch (error) {
    logger.error({ error }, "Failed to queue biography enrichment batch")
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ error: { message: errorMsg } })
  }
})

// ============================================================================
// POST /admin/api/biography-enrichment/golden-test
// Run golden test cases with scoring
// ============================================================================

router.post("/golden-test", async (req: Request, res: Response): Promise<void> => {
  const pool = getPool()

  try {
    const { GOLDEN_TEST_CASES, scoreAllResults } =
      await import("../../lib/biography/golden-test-cases.js")
    const { BiographyEnrichmentOrchestrator } =
      await import("../../lib/biography-sources/orchestrator.js")
    const { writeBiographyToProduction } =
      await import("../../lib/biography-enrichment-db-writer.js")

    // Look up golden test actors
    const names = GOLDEN_TEST_CASES.map((tc) => tc.actorName)
    const placeholders = names.map((_, i) => `$${i + 1}`).join(", ")
    const actorsResult = await pool.query(
      `SELECT id, tmdb_id, imdb_person_id, name, birthday, deathday,
              wikipedia_url, biography AS biography_raw_tmdb, biography
       FROM actors WHERE name IN (${placeholders})`,
      names
    )

    if (actorsResult.rows.length === 0) {
      res.status(400).json({
        error: {
          message: `None of the ${names.length} golden test actors found in database. Expected: ${names.join(", ")}`,
        },
      })
      return
    }

    const missingActors = names.filter(
      (name) => !actorsResult.rows.some((r: { name: string }) => r.name === name)
    )

    const orchestrator = new BiographyEnrichmentOrchestrator()
    const resultsByName = new Map()
    const errors: string[] = []

    for (const actor of actorsResult.rows) {
      try {
        const result = await orchestrator.enrichActor(actor)
        if (result.data && result.data.hasSubstantiveContent) {
          await writeBiographyToProduction(pool, actor.id, result.data, result.sources)
          resultsByName.set(actor.name, result.data)
        } else {
          errors.push(`${actor.name}: ${result.error || "No substantive content produced"}`)
        }
      } catch (actorError) {
        const msg = actorError instanceof Error ? actorError.message : "Unknown error"
        errors.push(`${actor.name}: ${msg}`)
      }
    }

    const { scores, averageScore, summary } = scoreAllResults(resultsByName)

    res.json({
      success: true,
      scores,
      averageScore,
      summary,
      actorsFound: actorsResult.rows.length,
      actorsExpected: GOLDEN_TEST_CASES.length,
      missingActors: missingActors.length > 0 ? missingActors : undefined,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    logger.error({ error }, "Failed to run golden test cases")
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ error: { message: errorMsg } })
  }
})

// ============================================================================
// Run Tracking Endpoints
// ============================================================================

// GET /admin/api/biography-enrichment/runs - List runs
router.get("/runs", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))

    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      exitReason: req.query.exitReason as string | undefined,
      status: req.query.status as string | undefined,
      minCost: req.query.minCost ? parseFloat(req.query.minCost as string) : undefined,
      maxCost: req.query.maxCost ? parseFloat(req.query.maxCost as string) : undefined,
    }

    const result = await getBioEnrichmentRuns(pool, page, pageSize, filters)
    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch bio enrichment runs")
    res.status(500).json({ error: { message: "Failed to fetch bio enrichment runs" } })
  }
})

// GET /admin/api/biography-enrichment/runs/:id - Run details
router.get("/runs/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)
    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const run = await getBioEnrichmentRunDetails(pool, runId)
    if (!run) {
      res.status(404).json({ error: { message: "Run not found" } })
      return
    }

    res.json(run)
  } catch (error) {
    logger.error({ error }, "Failed to fetch bio enrichment run details")
    res.status(500).json({ error: { message: "Failed to fetch bio enrichment run details" } })
  }
})

// GET /admin/api/biography-enrichment/runs/:id/actors - Per-actor results
router.get("/runs/:id/actors", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)
    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20))

    const result = await getBioEnrichmentRunActors(pool, runId, page, pageSize)
    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch bio enrichment run actors")
    res.status(500).json({ error: { message: "Failed to fetch bio enrichment run actors" } })
  }
})

// GET /admin/api/biography-enrichment/runs/:id/sources/stats - Source performance
router.get("/runs/:id/sources/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)
    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const stats = await getBioRunSourcePerformanceStats(pool, runId)
    res.json(stats)
  } catch (error) {
    logger.error({ error }, "Failed to fetch bio enrichment source stats")
    res.status(500).json({ error: { message: "Failed to fetch source stats" } })
  }
})

// GET /admin/api/biography-enrichment/runs/:id/progress - Real-time progress
router.get("/runs/:id/progress", async (req: Request, res: Response): Promise<void> => {
  try {
    const runId = parseInt(req.params.id, 10)
    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const progress = await getBioEnrichmentRunProgress(runId)
    res.json(progress)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    logger.error({ error }, "Failed to fetch bio enrichment run progress")
    res.status(500).json({ error: { message: errorMsg } })
  }
})

// POST /admin/api/biography-enrichment/runs/start - Start tracked run
router.post("/runs/start", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      limit,
      minPopularity,
      actorIds,
      confidenceThreshold,
      maxCostPerActor,
      maxTotalCost,
      allowRegeneration,
      sourceCategories,
    } = req.body

    // Validate: must have either actorIds or limit
    if (!actorIds && !limit) {
      res.status(400).json({ error: { message: "Either actorIds or limit must be provided" } })
      return
    }
    if (actorIds && !Array.isArray(actorIds)) {
      res.status(400).json({ error: { message: "actorIds must be an array" } })
      return
    }
    if (limit !== undefined && (typeof limit !== "number" || limit < 1)) {
      res.status(400).json({ error: { message: "limit must be a positive number" } })
      return
    }

    const runId = await startBioEnrichmentRun({
      limit,
      minPopularity,
      actorIds,
      confidenceThreshold,
      maxCostPerActor,
      maxTotalCost,
      allowRegeneration,
      sourceCategories,
    })

    res.json({ success: true, runId })
  } catch (error) {
    logger.error({ error }, "Failed to start bio enrichment run")
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ error: { message: errorMsg } })
  }
})

// POST /admin/api/biography-enrichment/runs/:id/stop - Stop running run
router.post("/runs/:id/stop", async (req: Request, res: Response): Promise<void> => {
  try {
    const runId = parseInt(req.params.id, 10)
    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const stopped = await stopBioEnrichmentRun(runId)
    res.json({ success: stopped })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    logger.error({ error }, "Failed to stop bio enrichment run")
    res.status(500).json({ error: { message: errorMsg } })
  }
})

export default router
