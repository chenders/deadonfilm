/**
 * Admin enrichment monitoring endpoints.
 *
 * Provides visibility into enrichment run history, source performance,
 * and ability to trigger new enrichment runs.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { logAdminAction } from "../../lib/admin-auth.js"
import {
  getEnrichmentRuns,
  getEnrichmentRunDetails,
  getEnrichmentRunActors,
  getSourcePerformanceStats,
  getRunSourcePerformanceStats,
  type EnrichmentRunFilters,
} from "../../lib/db/admin-enrichment-queries.js"

const router = Router()

// ============================================================================
// GET /admin/api/enrichment/runs
// Get paginated list of enrichment runs with optional filters
// ============================================================================

router.get("/runs", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Parse pagination params
    const page = parseInt(req.query.page as string) || 1
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100)

    // Parse filters
    const filters: EnrichmentRunFilters = {}

    if (req.query.startDate) {
      filters.startDate = req.query.startDate as string
    }

    if (req.query.endDate) {
      filters.endDate = req.query.endDate as string
    }

    if (req.query.minCost) {
      filters.minCost = parseFloat(req.query.minCost as string)
    }

    if (req.query.maxCost) {
      filters.maxCost = parseFloat(req.query.maxCost as string)
    }

    if (req.query.exitReason) {
      filters.exitReason = req.query.exitReason as string
    }

    if (req.query.hasErrors !== undefined) {
      filters.hasErrors = req.query.hasErrors === "true"
    }

    const result = await getEnrichmentRuns(pool, page, pageSize, filters)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment runs")
    res.status(500).json({ error: { message: "Failed to fetch enrichment runs" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/runs/:id
// Get detailed information about a single enrichment run
// ============================================================================

router.get("/runs/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const run = await getEnrichmentRunDetails(pool, runId)

    if (!run) {
      res.status(404).json({ error: { message: "Enrichment run not found" } })
      return
    }

    res.json(run)
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment run details")
    res.status(500).json({ error: { message: "Failed to fetch enrichment run details" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/runs/:id/actors
// Get per-actor results for an enrichment run
// ============================================================================

router.get("/runs/:id/actors", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    // Parse pagination params
    const page = parseInt(req.query.page as string) || 1
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200)

    const result = await getEnrichmentRunActors(pool, runId, page, pageSize)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment run actors")
    res.status(500).json({ error: { message: "Failed to fetch enrichment run actors" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/sources/stats
// Get aggregated source performance statistics
// ============================================================================

router.get("/sources/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    const stats = await getSourcePerformanceStats(pool, startDate, endDate)

    res.json(stats)
  } catch (error) {
    logger.error({ error }, "Failed to fetch source performance stats")
    res.status(500).json({ error: { message: "Failed to fetch source performance stats" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/runs/:id/sources/stats
// Get source performance statistics for a specific run
// ============================================================================

router.get("/runs/:id/sources/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const stats = await getRunSourcePerformanceStats(pool, runId)

    res.json(stats)
  } catch (error) {
    logger.error({ error }, "Failed to fetch run source performance stats")
    res.status(500).json({ error: { message: "Failed to fetch run source performance stats" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/start
// Trigger a new enrichment run
// ============================================================================

interface StartEnrichmentRequest {
  limit?: number
  maxTotalCost?: number
  maxCostPerActor?: number
  sources?: string[]
  dryRun?: boolean
  recentOnly?: boolean
  minPopularity?: number
  confidence?: number
}

router.post("/start", async (req: Request, res: Response): Promise<void> => {
  try {
    const config: StartEnrichmentRequest = req.body

    // Validate config
    if (config.limit !== undefined && (config.limit <= 0 || config.limit > 1000)) {
      res.status(400).json({ error: { message: "Limit must be between 1 and 1000" } })
      return
    }

    if (config.maxTotalCost !== undefined && config.maxTotalCost <= 0) {
      res.status(400).json({ error: { message: "Max total cost must be positive" } })
      return
    }

    if (config.maxCostPerActor !== undefined && config.maxCostPerActor <= 0) {
      res.status(400).json({ error: { message: "Max cost per actor must be positive" } })
      return
    }

    // Log admin action
    await logAdminAction({
      action: "start_enrichment",
      resourceType: "enrichment_run",
      details: config as Record<string, unknown>,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    // TODO: Implement enrichment run execution
    // This will require spawning the enrichment script as a child process
    // and tracking its progress in a global state or database table

    res.status(501).json({
      error: {
        message: "Enrichment run triggering not yet implemented. Use CLI script for now.",
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to start enrichment run")
    res.status(500).json({ error: { message: "Failed to start enrichment run" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/runs/:id/stop
// Stop a running enrichment run
// ============================================================================

router.post("/runs/:id/stop", async (req: Request, res: Response): Promise<void> => {
  try {
    const runId = parseInt(req.params.id, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    // Log admin action
    await logAdminAction({
      action: "stop_enrichment",
      resourceType: "enrichment_run",
      resourceId: runId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    // TODO: Implement enrichment run stopping
    // This will require signaling the running process to gracefully stop

    res.status(501).json({
      error: {
        message: "Enrichment run stopping not yet implemented",
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to stop enrichment run")
    res.status(500).json({ error: { message: "Failed to stop enrichment run" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/runs/:id/progress
// Get real-time progress of a running enrichment run
// ============================================================================

router.get("/runs/:id/progress", async (req: Request, res: Response): Promise<void> => {
  try {
    const runId = parseInt(req.params.id, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    // TODO: Implement progress tracking
    // This will require the enrichment script to periodically update
    // a progress record (could be in-memory, Redis, or database)

    res.status(501).json({
      error: {
        message: "Progress tracking not yet implemented",
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment run progress")
    res.status(500).json({ error: { message: "Failed to fetch enrichment run progress" } })
  }
})

export default router
