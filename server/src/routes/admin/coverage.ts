/**
 * Admin API routes for death detail coverage management.
 *
 * Provides endpoints for:
 * - Real-time coverage statistics
 * - Actor filtering and pagination
 * - Historical coverage trends
 * - Enrichment candidate recommendations
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import {
  getCoverageStats,
  getActorsForCoverage,
  getCoverageTrends,
  getEnrichmentCandidates,
  getDistinctCausesOfDeath,
  getDistinctEnrichmentVersions,
  getActorPreview,
  ActorCoverageFilters,
} from "../../lib/db/admin-coverage-queries.js"

const router = Router()

// ============================================================================
// GET /admin/api/coverage/stats
// Real-time coverage statistics
// ============================================================================

router.get("/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const stats = await getCoverageStats(pool)

    res.json(stats)
  } catch (error) {
    logger.error({ error }, "Failed to fetch coverage stats")
    res.status(500).json({ error: { message: "Failed to fetch coverage stats" } })
  }
})

// ============================================================================
// GET /admin/api/coverage/causes
// Distinct causes of death for filter dropdown
// ============================================================================

router.get("/causes", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const causes = await getDistinctCausesOfDeath(pool)

    res.json(causes)
  } catch (error) {
    logger.error({ error }, "Failed to fetch causes of death")
    res.status(500).json({ error: { message: "Failed to fetch causes of death" } })
  }
})

// ============================================================================
// GET /admin/api/coverage/enrichment-versions
// Distinct enrichment versions for filter dropdowns
// ============================================================================

router.get("/enrichment-versions", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const versions = await getDistinctEnrichmentVersions(pool)

    res.json(versions)
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment versions")
    res.status(500).json({ error: { message: "Failed to fetch enrichment versions" } })
  }
})

// ============================================================================
// GET /admin/api/coverage/actors
// Paginated actor list with filtering
// ============================================================================

router.get("/actors", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1)
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string, 10) || 50))

    // Parse filters
    const filters: ActorCoverageFilters = {}

    if (req.query.hasDeathPage !== undefined) {
      filters.hasDeathPage = req.query.hasDeathPage === "true"
    }

    if (req.query.minPopularity) {
      filters.minPopularity = parseFloat(req.query.minPopularity as string)
    }

    if (req.query.maxPopularity) {
      filters.maxPopularity = parseFloat(req.query.maxPopularity as string)
    }

    if (req.query.deathDateStart) {
      filters.deathDateStart = req.query.deathDateStart as string
    }

    if (req.query.deathDateEnd) {
      filters.deathDateEnd = req.query.deathDateEnd as string
    }

    if (req.query.searchName) {
      filters.searchName = req.query.searchName as string
    }

    if (req.query.causeOfDeath) {
      filters.causeOfDeath = req.query.causeOfDeath as string
    }

    if (req.query.deathManner) {
      const validManners = ["natural", "accident", "suicide", "homicide", "undetermined", "pending"]
      const deathManner = req.query.deathManner as string
      if (validManners.includes(deathManner)) {
        filters.deathManner = deathManner
      }
    }

    if (req.query.hasEnrichedBio !== undefined) {
      filters.hasEnrichedBio = req.query.hasEnrichedBio === "true"
    }

    if (req.query.deathEnrichmentVersion) {
      const deathVer = req.query.deathEnrichmentVersion as string
      // Allow "__null__", legacy integer ("4"), semver ("5.0.0"), semver+suffix ("5.0.0-no-reliability")
      if (deathVer === "__null__" || /^\d+(\.\d+\.\d+(-[\w-]+)?)?$/.test(deathVer)) {
        filters.deathEnrichmentVersion = deathVer
      }
    }

    if (req.query.bioEnrichmentVersion) {
      const bioVer = req.query.bioEnrichmentVersion as string
      // Allow "__null__", legacy integer ("2"), semver ("5.0.0"), semver+suffix ("5.0.0-no-reliability")
      if (bioVer === "__null__" || /^\d+(\.\d+\.\d+(-[\w-]+)?)?$/.test(bioVer)) {
        filters.bioEnrichmentVersion = bioVer
      }
    }

    if (req.query.orderBy) {
      const validOrderBy = ["death_date", "popularity", "name", "enriched_at", "interestingness"]
      const orderBy = req.query.orderBy as string
      if (validOrderBy.includes(orderBy)) {
        filters.orderBy = orderBy as
          | "death_date"
          | "popularity"
          | "name"
          | "enriched_at"
          | "interestingness"
      }
    }

    if (req.query.orderDirection) {
      const orderDirection = req.query.orderDirection as string
      if (orderDirection === "asc" || orderDirection === "desc") {
        filters.orderDirection = orderDirection
      }
    }

    const result = await getActorsForCoverage(pool, filters, page, pageSize)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch actors for coverage")
    res.status(500).json({ error: { message: "Failed to fetch actors" } })
  }
})

// ============================================================================
// GET /admin/api/coverage/trends
// Historical coverage data from snapshots
// ============================================================================

router.get("/trends", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Default to last 30 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)

    const startDateStr = req.query.startDate
      ? (req.query.startDate as string)
      : startDate.toISOString()

    const endDateStr = req.query.endDate ? (req.query.endDate as string) : endDate.toISOString()

    const granularity = (req.query.granularity as string) || "daily"
    if (!["daily", "weekly", "monthly"].includes(granularity)) {
      res
        .status(400)
        .json({ error: { message: "Invalid granularity. Must be daily, weekly, or monthly." } })
      return
    }

    const trends = await getCoverageTrends(
      pool,
      startDateStr,
      endDateStr,
      granularity as "daily" | "weekly" | "monthly"
    )

    res.json(trends)
  } catch (error) {
    logger.error({ error }, "Failed to fetch coverage trends")
    res.status(500).json({ error: { message: "Failed to fetch coverage trends" } })
  }
})

// ============================================================================
// GET /admin/api/coverage/actors/:id/preview
// Actor preview data for hover card
// ============================================================================

router.get("/actors/:id/preview", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const actorId = parseInt(req.params.id, 10)

    if (isNaN(actorId) || actorId <= 0) {
      res.status(400).json({ error: { message: "Invalid actor ID" } })
      return
    }

    const preview = await getActorPreview(pool, actorId)

    res.json(preview)
  } catch (error) {
    logger.error({ error, actorId: req.params.id }, "Failed to fetch actor preview")
    res.status(500).json({ error: { message: "Failed to fetch actor preview" } })
  }
})

// ============================================================================
// GET /admin/api/coverage/actors/by-ids
// Fetch actors by their internal IDs
// ============================================================================

router.get("/actors/by-ids", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Parse IDs from query params (can be multiple)
    const idsParam = req.query.ids
    let ids: number[] = []

    if (Array.isArray(idsParam)) {
      ids = idsParam.map((id) => parseInt(id as string, 10)).filter((id) => !isNaN(id) && id > 0)
    } else if (typeof idsParam === "string") {
      ids = idsParam
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id) && id > 0)
    }

    if (ids.length === 0) {
      res.json([])
      return
    }

    // Limit to 100 IDs at a time
    if (ids.length > 100) {
      ids = ids.slice(0, 100)
    }

    const result = await pool.query<{
      id: number
      name: string
      popularity: number | null
      tmdb_id: number | null
      enrichment_version: string | null
      biography_version: string | null
    }>(
      `SELECT id, name, dof_popularity::float as popularity, tmdb_id,
              enrichment_version, biography_version
       FROM actors
       WHERE id = ANY($1::int[])
       ORDER BY dof_popularity DESC NULLS LAST`,
      [ids]
    )

    res.json(result.rows)
  } catch (error) {
    logger.error({ error }, "Failed to fetch actors by IDs")
    res.status(500).json({ error: { message: "Failed to fetch actors by IDs" } })
  }
})

// ============================================================================
// GET /admin/api/coverage/enrichment-candidates
// High-priority actors for enrichment
// ============================================================================

router.get("/enrichment-candidates", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const minPopularity = parseFloat((req.query.minPopularity as string) || "5")
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string, 10) || 100))

    const candidates = await getEnrichmentCandidates(pool, minPopularity, limit)

    res.json(candidates)
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment candidates")
    res.status(500).json({ error: { message: "Failed to fetch enrichment candidates" } })
  }
})

export default router
