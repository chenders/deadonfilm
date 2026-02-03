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

const router = Router()

// Minimum TMDB biography length to be considered substantial enough for generation
const MIN_BIOGRAPHY_LENGTH = 50

// ============================================================================
// GET /admin/api/biographies
// Get actors needing biography generation
// ============================================================================

interface ActorNeedingBiography {
  id: number
  tmdb_id: number | null
  name: string
  tmdb_popularity: number | null
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

    const offset = (page - 1) * pageSize

    // Build query based on filters
    let whereClause = "WHERE tmdb_id IS NOT NULL"
    const params: (number | string)[] = []
    let paramIndex = 1

    if (needsGeneration) {
      whereClause += " AND biography IS NULL"
    }

    if (minPopularity > 0) {
      whereClause += ` AND COALESCE(tmdb_popularity, 0) >= $${paramIndex++}`
      params.push(minPopularity)
    }

    if (searchName) {
      whereClause += ` AND name ILIKE $${paramIndex++}`
      params.push(`%${searchName}%`)
    }

    // Get total count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM actors ${whereClause}`,
      params
    )
    const totalCount = parseInt(countResult.rows[0].count, 10)

    // Get actors
    // Cast tmdb_popularity to float so pg returns a number (not string from numeric type)
    const result = await pool.query<ActorNeedingBiography>(
      `SELECT
        id,
        tmdb_id,
        name,
        tmdb_popularity::float as tmdb_popularity,
        biography,
        biography_generated_at,
        wikipedia_url,
        imdb_person_id
      FROM actors
      ${whereClause}
      ORDER BY COALESCE(tmdb_popularity, 0) DESC
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
        popularity: actor.tmdb_popularity,
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

    // Generate cleaned biography
    const actorForBio: ActorForBiography = {
      id: actor.id,
      name: actor.name,
      tmdbId: actor.tmdb_id,
      wikipediaUrl: actor.wikipedia_url,
      imdbId: actor.imdb_person_id,
    }

    const result = await generateBiographyWithTracking(pool, actorForBio, tmdbPerson.biography)

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

    // Invalidate cache so updated biography is served
    try {
      await invalidateActorCache(actorId)
    } catch (cacheError) {
      logger.warn(
        { cacheError, actorId },
        "Failed to invalidate actor cache after biography update"
      )
    }

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
// Generate biographies for multiple actors
// ============================================================================

interface BatchGenerateRequest {
  actorIds?: number[]
  limit?: number
  minPopularity?: number
  allowRegeneration?: boolean
}

router.post("/generate-batch", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const {
      actorIds,
      limit = 10,
      minPopularity = 0,
      allowRegeneration = false,
    } = req.body as BatchGenerateRequest

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

    // Rate limiting: max 50 per request
    const maxLimit = 50
    const safeLimit = Math.min(limit, maxLimit)

    let actorsToProcess: Array<{
      id: number
      tmdb_id: number
      name: string
      wikipedia_url: string | null
      imdb_person_id: string | null
    }> = []

    if (actorIds && actorIds.length > 0) {
      // Process specific actors using ANY() with array parameter
      // This avoids dynamic placeholder generation that triggers CodeQL warnings
      const biographyFilter = allowRegeneration ? "" : "AND biography IS NULL"
      const result = await pool.query<{
        id: number
        tmdb_id: number
        name: string
        wikipedia_url: string | null
        imdb_person_id: string | null
      }>(
        `SELECT id, tmdb_id, name, wikipedia_url, imdb_person_id
         FROM actors
         WHERE id = ANY($1::int[])
           AND tmdb_id IS NOT NULL
           ${biographyFilter}
         LIMIT $2`,
        [actorIds, safeLimit]
      )
      actorsToProcess = result.rows
    } else {
      // Get actors by popularity
      const biographyFilter = allowRegeneration ? "" : "AND biography IS NULL"
      const result = await pool.query<{
        id: number
        tmdb_id: number
        name: string
        wikipedia_url: string | null
        imdb_person_id: string | null
      }>(
        `SELECT id, tmdb_id, name, wikipedia_url, imdb_person_id
         FROM actors
         WHERE tmdb_id IS NOT NULL
           ${biographyFilter}
           AND COALESCE(tmdb_popularity, 0) >= $1
         ORDER BY COALESCE(tmdb_popularity, 0) DESC
         LIMIT $2`,
        [minPopularity, safeLimit]
      )
      actorsToProcess = result.rows
    }

    const results: Array<{
      actorId: number
      name: string
      success: boolean
      biography: string | null
      error?: string
    }> = []

    let totalCost = 0

    for (const actor of actorsToProcess) {
      try {
        // Fetch TMDB biography
        const tmdbPerson = await getPersonDetails(actor.tmdb_id)

        if (!tmdbPerson.biography || tmdbPerson.biography.trim().length < MIN_BIOGRAPHY_LENGTH) {
          await pool.query(
            `UPDATE actors SET
              biography_raw_tmdb = $1,
              biography_has_content = false,
              biography_generated_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
            [tmdbPerson.biography || "", actor.id]
          )

          results.push({
            actorId: actor.id,
            name: actor.name,
            success: true,
            biography: null,
          })
          continue
        }

        // Generate biography
        const actorForBio: ActorForBiography = {
          id: actor.id,
          name: actor.name,
          tmdbId: actor.tmdb_id,
          wikipediaUrl: actor.wikipedia_url,
          imdbId: actor.imdb_person_id,
        }

        const result = await generateBiographyWithTracking(pool, actorForBio, tmdbPerson.biography)

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
            actor.id,
          ]
        )

        totalCost += result.costUsd

        // Invalidate cache so updated biography is served
        try {
          await invalidateActorCache(actor.id)
        } catch (cacheError) {
          logger.warn(
            { cacheError, actorId: actor.id },
            "Failed to invalidate actor cache after biography update"
          )
        }

        results.push({
          actorId: actor.id,
          name: actor.name,
          success: true,
          biography: result.biography,
        })

        // Rate limiting: wait 1.2 seconds between requests (50 RPM for Sonnet)
        // Skip delay after the last actor to avoid unnecessary wait
        const isLastActor = actorsToProcess.indexOf(actor) === actorsToProcess.length - 1
        if (!isLastActor) {
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }
      } catch (error) {
        results.push({
          actorId: actor.id,
          name: actor.name,
          success: false,
          biography: null,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    // Log admin action
    await logAdminAction({
      action: "generate_biographies_batch",
      resourceType: "actor",
      details: {
        count: results.length,
        successful: results.filter((r) => r.success).length,
        totalCost,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    res.json({
      results,
      summary: {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        totalCostUsd: totalCost,
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to generate biographies batch")
    res.status(500).json({ error: { message: "Failed to generate biographies" } })
  }
})

export default router
