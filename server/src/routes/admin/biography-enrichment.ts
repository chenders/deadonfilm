/**
 * Admin biography enrichment endpoints.
 *
 * Provides visibility into biography enrichment status, ability to trigger
 * single-actor and batch enrichment, and golden test case scoring.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

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
      conditions.push(`a.name ILIKE $${paramIndex++}`)
      params.push(`%${searchName}%`)
    }
    if (minPopularity > 0) {
      conditions.push(`a.tmdb_popularity >= $${paramIndex++}`)
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
      `SELECT a.id, a.name, a.tmdb_popularity, a.deathday,
              abd.id as bio_id, abd.narrative_confidence, abd.narrative_teaser,
              abd.life_notable_factors, abd.updated_at as bio_updated_at,
              a.biography_version
       FROM actors a
       LEFT JOIN actor_biography_details abd ON abd.actor_id = a.id
       WHERE ${whereClause}
       ORDER BY a.tmdb_popularity DESC NULLS LAST
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
        popularity: row.tmdb_popularity ? parseFloat(row.tmdb_popularity) : null,
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
            wikipedia_url, biography AS biography_raw_tmdb, biography, place_of_birth
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
  const { actorIds, limit, minPopularity, confidenceThreshold, allowRegeneration, useStaging } =
    req.body

  try {
    const { queueManager } = await import("../../lib/jobs/queue-manager.js")
    const { JobType } = await import("../../lib/jobs/types.js")

    const jobId = await queueManager.addJob(
      JobType.ENRICH_BIOGRAPHIES_BATCH,
      {
        actorIds,
        limit: limit || 10,
        minPopularity,
        confidenceThreshold,
        allowRegeneration: allowRegeneration || false,
        useStaging: useStaging || false,
      },
      {
        createdBy: "admin",
      }
    )

    res.json({ success: true, jobId })
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
              wikipedia_url, biography AS biography_raw_tmdb, biography, place_of_birth
       FROM actors WHERE name IN (${placeholders})`,
      names
    )

    const orchestrator = new BiographyEnrichmentOrchestrator()
    const resultsByName = new Map()

    for (const actor of actorsResult.rows) {
      const result = await orchestrator.enrichActor(actor)
      if (result.data && result.data.hasSubstantiveContent) {
        await writeBiographyToProduction(pool, actor.id, result.data, result.sources)
        resultsByName.set(actor.name, result.data)
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
    })
  } catch (error) {
    logger.error({ error }, "Failed to run golden test cases")
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    res.status(500).json({ error: { message: errorMsg } })
  }
})

export default router
