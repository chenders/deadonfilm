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
import {
  startEnrichmentRun,
  stopEnrichmentRun,
  getEnrichmentRunProgress,
  type EnrichmentRunConfig,
} from "../../lib/enrichment-process-manager.js"

const router = Router()

// ============================================================================
// GET /admin/api/enrichment/runs
// Get paginated list of enrichment runs with optional filters
// ============================================================================

router.get("/runs", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Parse pagination params with clamping to avoid negative or invalid values
    const rawPage = Number.parseInt(req.query.page as string, 10)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

    const rawPageSize = Number.parseInt(req.query.pageSize as string, 10)
    const defaultPageSize = 20
    const maxPageSize = 100
    const safePageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : defaultPageSize
    const pageSize = Math.min(safePageSize, maxPageSize)

    // Parse filters
    const filters: EnrichmentRunFilters = {}

    if (req.query.startDate) {
      filters.startDate = req.query.startDate as string
    }

    if (req.query.endDate) {
      filters.endDate = req.query.endDate as string
    }

    if (req.query.minCost) {
      const minCost = Number.parseFloat(req.query.minCost as string)
      if (!Number.isFinite(minCost)) {
        res.status(400).json({ error: { message: "Invalid minCost: must be a finite number" } })
        return
      }
      filters.minCost = minCost
    }

    if (req.query.maxCost) {
      const maxCost = Number.parseFloat(req.query.maxCost as string)
      if (!Number.isFinite(maxCost)) {
        res.status(400).json({ error: { message: "Invalid maxCost: must be a finite number" } })
        return
      }
      filters.maxCost = maxCost
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

    // Parse pagination params with clamping to avoid negative values
    const rawPage = parseInt(req.query.page as string, 10)
    const page = !Number.isNaN(rawPage) && rawPage > 0 ? rawPage : 1
    const rawPageSize = parseInt(req.query.pageSize as string, 10)
    const pageSizeBase = !Number.isNaN(rawPageSize) && rawPageSize > 0 ? rawPageSize : 50
    const pageSize = Math.min(pageSizeBase, 200)

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
  usActorsOnly?: boolean
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

    // Convert request config to EnrichmentRunConfig
    const enrichmentConfig: EnrichmentRunConfig = {
      limit: config.limit,
      minPopularity: config.minPopularity,
      recentOnly: config.recentOnly,
      maxCostPerActor: config.maxCostPerActor,
      maxTotalCost: config.maxTotalCost,
      confidence: config.confidence,
      usActorsOnly: config.usActorsOnly,
      // Default source categories (can be customized via config.sources later)
      free: true,
      paid: true,
      ai: false,
      // Default enrichment settings
      claudeCleanup: true,
      gatherAllSources: false,
      stopOnMatch: false,
      followLinks: true,
      aiLinkSelection: true,
      aiContentExtraction: true,
    }

    // Start the enrichment run
    const runId = await startEnrichmentRun(enrichmentConfig)

    logger.info({ runId }, "Enrichment run started")

    res.status(201).json({
      id: runId,
      status: "running",
      message: "Enrichment run started successfully",
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

    // Stop the enrichment run
    const stopped = await stopEnrichmentRun(runId)

    logger.info({ runId, stopped }, "Enrichment run stop requested")

    res.status(200).json({
      id: runId,
      stopped,
      message: stopped ? "Enrichment run stopped successfully" : "Enrichment run stop signal sent",
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

    // Get progress for the enrichment run
    const progress = await getEnrichmentRunProgress(runId)

    res.status(200).json(progress)
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment run progress")
    res.status(500).json({ error: { message: "Failed to fetch enrichment run progress" } })
  }
})

export default router
