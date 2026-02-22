/**
 * Admin biography management endpoints.
 *
 * Provides endpoints for viewing actors needing biographies and
 * triggering biography generation.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { logAdminAction } from "../../lib/admin-auth.js"
import { getPersonDetails } from "../../lib/tmdb.js"
import { invalidateActorCache } from "../../lib/cache.js"
import {
  generateBiographyWithTracking,
  type ActorForBiography,
} from "../../lib/biography/biography-generator.js"
import { fetchWikipediaIntro } from "../../lib/biography/wikipedia-fetcher.js"
import { queueManager } from "../../lib/jobs/queue-manager.js"
import { JobType, JobPriority } from "../../lib/jobs/types.js"

const router = Router()

// Minimum TMDB biography length to be considered substantial enough for generation
const MIN_BIOGRAPHY_LENGTH = 50

/**
 * Best-effort cache invalidation after biography updates.
 * invalidateActorCache() currently swallows errors internally, but we wrap
 * in try/catch defensively in case that behaviour changes.
 */
async function invalidateActorCacheBestEffort(actorId: number): Promise<void> {
  try {
    await invalidateActorCache(actorId)
  } catch (err) {
    logger.warn({ err, actorId }, "Failed to invalidate actor cache after biography update")
  }
}

// ============================================================================
// GET /admin/api/biographies
// Get actors needing biography generation
// ============================================================================

interface ActorNeedingBiography {
  id: number
  tmdb_id: number | null
  name: string
  dof_popularity: number | null
  biography: string | null
  biography_generated_at: string | null
  wikipedia_url: string | null
  imdb_person_id: string | null
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Parse pagination params
    const rawPage = Number.parseInt(req.query.page as string, 10)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

    const rawPageSize = Number.parseInt(req.query.pageSize as string, 10)
    const defaultPageSize = 50
    const maxPageSize = 200
    const safePageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : defaultPageSize
    const pageSize = Math.min(safePageSize, maxPageSize)

    // Parse filters
    const minPopularity = Number.parseFloat(req.query.minPopularity as string) || 0
    const needsGeneration = req.query.needsGeneration === "true"
    const searchName = (req.query.searchName as string)?.trim() || ""
    const sortBy = (req.query.sortBy as string) || "popularity"
    const vitalStatus = (req.query.vitalStatus as string) || "all"
    const hasWikipedia = req.query.hasWikipedia as string | undefined
    const hasImdb = req.query.hasImdb as string | undefined
    const hasEnrichedBio = req.query.hasEnrichedBio as string | undefined

    const offset = (page - 1) * pageSize

    // Build sort clause from whitelist
    let orderByClause: string
    switch (sortBy) {
      case "name":
        orderByClause = "ORDER BY name ASC, id ASC"
        break
      case "generated_at":
        orderByClause = "ORDER BY biography_generated_at DESC NULLS LAST, id ASC"
        break
      case "popularity":
      default:
        orderByClause = "ORDER BY COALESCE(dof_popularity, 0) DESC, id ASC"
        break
    }

    // Build query based on filters
    let whereClause = "WHERE tmdb_id IS NOT NULL"
    const params: (number | string)[] = []
    let paramIndex = 1

    if (needsGeneration) {
      whereClause += " AND biography IS NULL"
    }

    if (minPopularity > 0) {
      whereClause += ` AND COALESCE(dof_popularity, 0) >= $${paramIndex++}`
      params.push(minPopularity)
    }

    if (searchName) {
      const words = searchName.trim().split(/\s+/)
      for (const word of words) {
        whereClause += ` AND name ILIKE $${paramIndex++}`
        params.push(`%${word}%`)
      }
    }

    if (vitalStatus === "alive") {
      whereClause += " AND deathday IS NULL"
    } else if (vitalStatus === "deceased") {
      whereClause += " AND deathday IS NOT NULL"
    }

    if (hasWikipedia === "true") {
      whereClause += " AND wikipedia_url IS NOT NULL"
    } else if (hasWikipedia === "false") {
      whereClause += " AND wikipedia_url IS NULL"
    }

    if (hasImdb === "true") {
      whereClause += " AND imdb_person_id IS NOT NULL"
    } else if (hasImdb === "false") {
      whereClause += " AND imdb_person_id IS NULL"
    }

    if (hasEnrichedBio === "true") {
      whereClause +=
        " AND EXISTS (SELECT 1 FROM actor_biography_details abd WHERE abd.actor_id = actors.id)"
    } else if (hasEnrichedBio === "false") {
      whereClause +=
        " AND NOT EXISTS (SELECT 1 FROM actor_biography_details abd WHERE abd.actor_id = actors.id)"
    }

    // Get total count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM actors ${whereClause}`,
      params
    )
    const totalCount = parseInt(countResult.rows[0].count, 10)

    // Get actors
    const result = await pool.query<ActorNeedingBiography>(
      `SELECT
        id,
        tmdb_id,
        name,
        dof_popularity::float as dof_popularity,
        biography,
        biography_generated_at,
        wikipedia_url,
        imdb_person_id
      FROM actors
      ${whereClause}
      ${orderByClause}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, pageSize, offset]
    )

    // Get stats
    const statsResult = await pool.query<{
      total_actors: string
      with_biography: string
      without_biography: string
    }>(`
      SELECT
        COUNT(*) as total_actors,
        COUNT(*) FILTER (WHERE biography IS NOT NULL) as with_biography,
        COUNT(*) FILTER (WHERE biography IS NULL AND tmdb_id IS NOT NULL) as without_biography
      FROM actors
    `)

    const stats = statsResult.rows[0]

    res.json({
      actors: result.rows.map((actor) => ({
        id: actor.id,
        tmdbId: actor.tmdb_id,
        name: actor.name,
        popularity: actor.dof_popularity,
        hasBiography: actor.biography !== null,
        generatedAt: actor.biography_generated_at,
        hasWikipedia: actor.wikipedia_url !== null,
        hasImdb: actor.imdb_person_id !== null,
      })),
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      stats: {
        totalActors: parseInt(stats.total_actors, 10),
        withBiography: parseInt(stats.with_biography, 10),
        withoutBiography: parseInt(stats.without_biography, 10),
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to get actors needing biographies")
    res.status(500).json({ error: { message: "Failed to get actors" } })
  }
})

// ============================================================================
// POST /admin/api/biographies/generate
// Generate biography for a specific actor
// ============================================================================

interface GenerateRequest {
  actorId: number
}

router.post("/generate", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const { actorId } = req.body as GenerateRequest

    if (!actorId || typeof actorId !== "number" || !Number.isInteger(actorId) || actorId <= 0) {
      res
        .status(400)
        .json({ error: { message: "actorId is required and must be a positive integer" } })
      return
    }

    // Get actor from database
    const actorResult = await pool.query<{
      id: number
      tmdb_id: number | null
      name: string
      wikipedia_url: string | null
      imdb_person_id: string | null
    }>("SELECT id, tmdb_id, name, wikipedia_url, imdb_person_id FROM actors WHERE id = $1", [
      actorId,
    ])

    if (actorResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Actor not found" } })
      return
    }

    const actor = actorResult.rows[0]

    if (!actor.tmdb_id) {
      res.status(400).json({ error: { message: "Actor does not have a TMDB ID" } })
      return
    }

    // Fetch TMDB biography
    const tmdbPerson = await getPersonDetails(actor.tmdb_id)

    if (!tmdbPerson.biography || tmdbPerson.biography.trim().length < MIN_BIOGRAPHY_LENGTH) {
      // Save that there's no substantial TMDB biography
      await pool.query(
        `UPDATE actors SET
          biography_raw_tmdb = $1,
          biography_has_content = false,
          biography_generated_at = CURRENT_TIMESTAMP
        WHERE id = $2`,
        [tmdbPerson.biography || "", actorId]
      )

      res.json({
        success: true,
        message: "No substantial TMDB biography available",
        result: {
          biography: null,
          hasSubstantiveContent: false,
          sourceUrl: null,
          sourceType: null,
        },
      })
      return
    }

    // Fetch Wikipedia intro if actor has a Wikipedia URL
    let wikipediaBio: string | undefined
    if (actor.wikipedia_url) {
      try {
        const intro = await fetchWikipediaIntro(actor.wikipedia_url)
        if (intro) {
          wikipediaBio = intro
        }
      } catch (err) {
        logger.warn({ err, actorId }, "Failed to fetch Wikipedia intro for single-actor generate")
      }
    }

    // Generate cleaned biography
    const actorForBio: ActorForBiography = {
      id: actor.id,
      name: actor.name,
      tmdbId: actor.tmdb_id,
      wikipediaUrl: actor.wikipedia_url,
      imdbId: actor.imdb_person_id,
    }

    const result = await generateBiographyWithTracking(
      pool,
      actorForBio,
      tmdbPerson.biography,
      wikipediaBio
    )

    // Save to database
    await pool.query(
      `UPDATE actors SET
        biography = $1,
        biography_source_url = $2,
        biography_source_type = $3,
        biography_generated_at = CURRENT_TIMESTAMP,
        biography_raw_tmdb = $4,
        biography_has_content = $5
      WHERE id = $6`,
      [
        result.biography,
        result.sourceUrl,
        result.sourceType,
        tmdbPerson.biography,
        result.hasSubstantiveContent,
        actorId,
      ]
    )

    await invalidateActorCacheBestEffort(actorId)

    // Log admin action
    await logAdminAction({
      action: "generate_biography",
      resourceType: "actor",
      resourceId: actorId,
      details: { actorName: actor.name },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      success: true,
      result: {
        biography: result.biography,
        hasSubstantiveContent: result.hasSubstantiveContent,
        sourceUrl: result.sourceUrl,
        sourceType: result.sourceType,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to generate biography")
    res.status(500).json({ error: { message: "Failed to generate biography" } })
  }
})

// ============================================================================
// POST /admin/api/biographies/generate-batch
// Queue batch biography generation via BullMQ + Anthropic Batches API
// ============================================================================

interface BatchGenerateRequest {
  actorIds?: number[]
  limit?: number
  minPopularity?: number
  allowRegeneration?: boolean
}

router.post("/generate-batch", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      actorIds,
      limit = 100,
      minPopularity = 0,
      allowRegeneration = false,
    } = req.body as BatchGenerateRequest

    // Validate limit and minPopularity
    if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) {
      res.status(400).json({
        error: { message: "limit must be a positive number" },
      })
      return
    }
    if (typeof minPopularity !== "number" || !Number.isFinite(minPopularity) || minPopularity < 0) {
      res.status(400).json({
        error: { message: "minPopularity must be a non-negative number" },
      })
      return
    }

    if (typeof allowRegeneration !== "boolean") {
      res.status(400).json({
        error: { message: "allowRegeneration must be a boolean" },
      })
      return
    }

    // Validate actorIds if provided
    if (
      actorIds !== undefined &&
      (!Array.isArray(actorIds) ||
        !actorIds.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0))
    ) {
      res.status(400).json({
        error: { message: "actorIds must be an array of positive integers" },
      })
      return
    }

    if (!queueManager.isReady) {
      res.status(503).json({
        error: {
          message:
            "Job queue is not available. Ensure REDIS_JOBS_URL is configured and Redis is running.",
        },
      })
      return
    }

    // Max 500 per batch
    const maxLimit = 500
    const safeLimit = Math.min(limit, maxLimit)
    const safeActorIds = actorIds ? actorIds.slice(0, maxLimit) : undefined

    // Queue the job
    const jobId = await queueManager.addJob(
      JobType.GENERATE_BIOGRAPHIES_BATCH,
      {
        actorIds: safeActorIds,
        limit: safeLimit,
        minPopularity,
        allowRegeneration,
      },
      {
        priority: JobPriority.HIGH,
        attempts: 1, // Don't retry batch jobs — they're expensive
        timeout: 5 * 60 * 60 * 1000, // 5 hour timeout
        createdBy: "admin-biographies-api",
      }
    )

    // Log admin action
    await logAdminAction({
      action: "generate_biographies_batch",
      resourceType: "actor",
      details: {
        jobId,
        actorCount: safeActorIds?.length ?? safeLimit,
        minPopularity,
        allowRegeneration,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      jobId,
      queued: true,
      message: `Batch biography generation job queued (${safeActorIds?.length ?? safeLimit} actors)`,
    })
  } catch (error) {
    logger.error({ error }, "Failed to queue biographies batch job")
    res.status(500).json({ error: { message: "Failed to queue batch generation" } })
  }
})

export default router
