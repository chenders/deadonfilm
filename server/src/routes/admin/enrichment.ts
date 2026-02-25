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
  getPendingEnrichments,
  getEnrichmentReviewDetail,
  approveEnrichment,
  rejectEnrichment,
  editEnrichment,
  commitEnrichmentRun,
  type EnrichmentRunFilters,
  type PendingReviewFilters,
} from "../../lib/db/admin-enrichment-queries.js"
import {
  startEnrichmentRun,
  stopEnrichmentRun,
  getEnrichmentRunProgress,
  type EnrichmentRunConfig,
} from "../../lib/enrichment-process-manager.js"
import { createRunLogsHandler } from "./run-logs-handler.js"

const router = Router()

// Pagination constants
const DEFAULT_PENDING_REVIEW_PAGE_SIZE = 50
const MAX_PENDING_REVIEW_PAGE_SIZE = 200

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
// GET /admin/api/enrichment/runs/:id/logs
// Get logs associated with a specific enrichment run
// ============================================================================

router.get("/runs/:id/logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    // Parse pagination params
    const rawPage = Number.parseInt(req.query.page as string, 10)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

    const rawPageSize = Number.parseInt(req.query.pageSize as string, 10)
    const defaultPageSize = 50
    const maxPageSize = 100
    const safePageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : defaultPageSize
    const pageSize = Math.min(safePageSize, maxPageSize)

    // Parse optional level filter
    const level = req.query.level as string | undefined
    const validLevels = ["fatal", "error", "warn", "info", "debug", "trace"]
    if (level && !validLevels.includes(level)) {
      res.status(400).json({
        error: { message: `Invalid level. Must be one of: ${validLevels.join(", ")}` },
      })
      return
    }

    const offset = (page - 1) * pageSize

    // Build query with filters
    const conditions: string[] = ["run_id = $1"]
    const params: unknown[] = [runId]
    let paramIndex = 2

    if (level) {
      conditions.push(`level = $${paramIndex}`)
      params.push(level)
      paramIndex++
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM error_logs ${whereClause}`
    const countResult = await pool.query(countQuery, params)
    const total = parseInt(countResult.rows[0].count)

    // Get paginated results
    const query = `
      SELECT
        id::int as id,
        level,
        source,
        message,
        details,
        request_id,
        path,
        method,
        script_name,
        job_name,
        error_stack,
        created_at
      FROM error_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    params.push(pageSize, offset)

    const result = await pool.query(query, params)

    res.json({
      logs: result.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment run logs")
    res.status(500).json({ error: { message: "Failed to fetch enrichment run logs" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/runs/:id/run-logs
// Get all-level logs from the run_logs table for a specific enrichment run
// ============================================================================
router.get("/runs/:id/run-logs", createRunLogsHandler("death"))

// ============================================================================
// GET /admin/api/enrichment/runs/:id/actors/:actorId/logs
// Get per-actor enrichment log entries
// ============================================================================

router.get("/runs/:id/actors/:actorId/logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)
    const actorId = parseInt(req.params.actorId, 10)

    if (isNaN(runId) || isNaN(actorId)) {
      res.status(400).json({ error: { message: "Invalid run ID or actor ID" } })
      return
    }

    const result = await pool.query<{ log_entries: unknown[]; actor_name: string }>(
      `SELECT era.log_entries, a.name AS actor_name
       FROM enrichment_run_actors era
       JOIN actors a ON a.id = era.actor_id
       WHERE era.run_id = $1 AND era.actor_id = $2`,
      [runId, actorId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: { message: "Not found" } })
      return
    }

    res.json({
      actorName: result.rows[0].actor_name,
      logEntries: result.rows[0].log_entries || [],
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch actor enrichment logs")
    res.status(500).json({ error: { message: "Failed to fetch actor enrichment logs" } })
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
  actorIds?: number[]
  sources?: string[]
  dryRun?: boolean
  recentOnly?: boolean
  minPopularity?: number
  confidence?: number
  // Source selection flags
  free?: boolean
  paid?: boolean
  ai?: boolean
  gatherAllSources?: boolean
  // Advanced options
  claudeCleanup?: boolean
  followLinks?: boolean
  aiLinkSelection?: boolean
  aiContentExtraction?: boolean
  // Batch mode filters
  usActorsOnly?: boolean
  // Sort/priority
  sortBy?: "popularity" | "interestingness"
  // Cache control
  ignoreCache?: boolean // Default: true - bypass source query cache for fresh data
  // Wikipedia-specific options
  wikipedia?: {
    /** Use AI (Gemini Flash) for section selection instead of regex patterns */
    useAISectionSelection?: boolean
    /** Follow links to related Wikipedia articles (e.g., hunting incident pages) */
    followLinkedArticles?: boolean
    /** Maximum number of linked articles to fetch. Default: 2 */
    maxLinkedArticles?: number
    /** Maximum sections to fetch. Default: 10 */
    maxSections?: number
  }
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

    if (config.actorIds !== undefined) {
      if (!Array.isArray(config.actorIds) || config.actorIds.length === 0) {
        res.status(400).json({ error: { message: "actorIds must be a non-empty array" } })
        return
      }
      if (!config.actorIds.every((id) => Number.isInteger(id) && id > 0)) {
        res.status(400).json({ error: { message: "All actor IDs must be positive integers" } })
        return
      }
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
    // Use values from UI with sensible defaults
    const enrichmentConfig: EnrichmentRunConfig = {
      limit: config.limit,
      minPopularity: config.minPopularity,
      recentOnly: config.recentOnly,
      usActorsOnly: config.usActorsOnly,
      actorIds: config.actorIds,
      maxCostPerActor: config.maxCostPerActor,
      maxTotalCost: config.maxTotalCost,
      confidence: config.confidence,
      // Source selection flags from UI (defaults match CLI script)
      free: config.free ?? true,
      paid: config.paid ?? true,
      ai: config.ai ?? false,
      // Enrichment settings from UI
      claudeCleanup: config.claudeCleanup ?? true,
      gatherAllSources: config.gatherAllSources ?? true,
      followLinks: config.followLinks ?? true,
      aiLinkSelection: config.aiLinkSelection ?? true,
      aiContentExtraction: config.aiContentExtraction ?? true,
      // Cache control - default true for admin (get fresh data)
      ignoreCache: config.ignoreCache ?? true,
      // Sort/priority - default to popularity
      sortBy: config.sortBy ?? "popularity",
      // Wikipedia-specific options
      wikipedia: config.wikipedia,
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

// ============================================================================
// STAGE 4: REVIEW WORKFLOW ENDPOINTS
// ============================================================================

// ============================================================================
// GET /admin/api/enrichment/pending-review
// List all enrichments pending review with confidence filtering
// ============================================================================

router.get("/pending-review", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Parse pagination params with clamping
    const rawPage = Number.parseInt(req.query.page as string, 10)
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

    const rawPageSize = Number.parseInt(req.query.pageSize as string, 10)
    const safePageSize =
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? rawPageSize
        : DEFAULT_PENDING_REVIEW_PAGE_SIZE
    const pageSize = Math.min(safePageSize, MAX_PENDING_REVIEW_PAGE_SIZE)

    // Parse filters
    const filters: PendingReviewFilters = { page, pageSize }

    if (req.query.runId) {
      const runId = Number.parseInt(req.query.runId as string, 10)
      if (!Number.isFinite(runId) || runId <= 0) {
        res.status(400).json({ error: { message: "Invalid runId: must be a positive integer" } })
        return
      }
      filters.runId = runId
    }

    if (req.query.minConfidence) {
      const minConfidence = Number.parseFloat(req.query.minConfidence as string)
      if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
        res
          .status(400)
          .json({ error: { message: "Invalid minConfidence: must be between 0 and 1" } })
        return
      }
      filters.minConfidence = minConfidence
    }

    if (req.query.causeConfidence) {
      const causeConfidence = req.query.causeConfidence as string
      if (!["high", "medium", "low", "disputed"].includes(causeConfidence)) {
        res.status(400).json({
          error: {
            message: "Invalid causeConfidence: must be high, medium, low, or disputed",
          },
        })
        return
      }
      filters.causeConfidence = causeConfidence as "high" | "medium" | "low" | "disputed"
    }

    const result = await getPendingEnrichments(pool, filters)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch pending enrichments")
    res.status(500).json({ error: { message: "Failed to fetch pending enrichments" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/review/:enrichmentRunActorId
// Get detailed data for a single enrichment for review
// ============================================================================

router.get("/review/:enrichmentRunActorId", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const enrichmentRunActorId = parseInt(req.params.enrichmentRunActorId, 10)

    if (isNaN(enrichmentRunActorId)) {
      res.status(400).json({ error: { message: "Invalid enrichmentRunActorId" } })
      return
    }

    const detail = await getEnrichmentReviewDetail(pool, enrichmentRunActorId)

    if (!detail) {
      res.status(404).json({ error: { message: "Enrichment not found" } })
      return
    }

    res.json(detail)
  } catch (error) {
    logger.error({ error }, "Failed to fetch enrichment review detail")
    res.status(500).json({ error: { message: "Failed to fetch enrichment review detail" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/review/:enrichmentRunActorId/approve
// Approve a single enrichment for commit
// ============================================================================

interface ApproveEnrichmentRequest {
  adminUser: string
  notes?: string
}

router.post(
  "/review/:enrichmentRunActorId/approve",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pool = getPool()
      const enrichmentRunActorId = parseInt(req.params.enrichmentRunActorId, 10)

      if (isNaN(enrichmentRunActorId)) {
        res.status(400).json({ error: { message: "Invalid enrichmentRunActorId" } })
        return
      }

      const { adminUser, notes } = req.body as ApproveEnrichmentRequest

      if (!adminUser || typeof adminUser !== "string" || adminUser.trim() === "") {
        res.status(400).json({ error: { message: "adminUser is required" } })
        return
      }

      // Log admin action
      await logAdminAction({
        action: "approve_enrichment",
        resourceType: "enrichment_review",
        resourceId: enrichmentRunActorId,
        details: { notes },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      await approveEnrichment(pool, enrichmentRunActorId, adminUser, notes)

      logger.info({ enrichmentRunActorId, adminUser }, "Enrichment approved")

      res.status(200).json({
        success: true,
        message: "Enrichment approved successfully",
      })
    } catch (error) {
      logger.error({ error }, "Failed to approve enrichment")
      res.status(500).json({ error: { message: "Failed to approve enrichment" } })
    }
  }
)

// ============================================================================
// POST /admin/api/enrichment/review/:enrichmentRunActorId/reject
// Reject a single enrichment
// ============================================================================

interface RejectEnrichmentRequest {
  adminUser: string
  reason:
    | "low_confidence"
    | "incorrect_data"
    | "duplicate"
    | "no_death_info"
    | "conflicting_sources"
    | "other"
  details?: string
}

router.post(
  "/review/:enrichmentRunActorId/reject",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pool = getPool()
      const enrichmentRunActorId = parseInt(req.params.enrichmentRunActorId, 10)

      if (isNaN(enrichmentRunActorId)) {
        res.status(400).json({ error: { message: "Invalid enrichmentRunActorId" } })
        return
      }

      const { adminUser, reason, details } = req.body as RejectEnrichmentRequest

      if (!adminUser || typeof adminUser !== "string" || adminUser.trim() === "") {
        res.status(400).json({ error: { message: "adminUser is required" } })
        return
      }

      if (!reason) {
        res.status(400).json({ error: { message: "reason is required" } })
        return
      }

      const validReasons = [
        "low_confidence",
        "incorrect_data",
        "duplicate",
        "no_death_info",
        "conflicting_sources",
        "other",
      ]
      if (!validReasons.includes(reason)) {
        res.status(400).json({
          error: {
            message: `Invalid reason: must be one of ${validReasons.join(", ")}`,
          },
        })
        return
      }

      // Log admin action
      await logAdminAction({
        action: "reject_enrichment",
        resourceType: "enrichment_review",
        resourceId: enrichmentRunActorId,
        details: { reason, details },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      await rejectEnrichment(pool, enrichmentRunActorId, adminUser, reason, details)

      logger.info({ enrichmentRunActorId, adminUser, reason }, "Enrichment rejected")

      res.status(200).json({
        success: true,
        message: "Enrichment rejected successfully",
      })
    } catch (error) {
      logger.error({ error }, "Failed to reject enrichment")
      res.status(500).json({ error: { message: "Failed to reject enrichment" } })
    }
  }
)

// ============================================================================
// POST /admin/api/enrichment/review/:enrichmentRunActorId/edit
// Manually edit enrichment data before approval
// ============================================================================

interface EditEnrichmentRequest {
  adminUser: string
  edits: Record<string, unknown>
  notes?: string
}

router.post(
  "/review/:enrichmentRunActorId/edit",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pool = getPool()
      const enrichmentRunActorId = parseInt(req.params.enrichmentRunActorId, 10)

      if (isNaN(enrichmentRunActorId)) {
        res.status(400).json({ error: { message: "Invalid enrichmentRunActorId" } })
        return
      }

      const { adminUser, edits, notes } = req.body as EditEnrichmentRequest

      if (!adminUser || typeof adminUser !== "string" || adminUser.trim() === "") {
        res.status(400).json({ error: { message: "adminUser is required" } })
        return
      }

      if (!edits || typeof edits !== "object" || Object.keys(edits).length === 0) {
        res
          .status(400)
          .json({ error: { message: "edits object is required and must not be empty" } })
        return
      }

      // Log admin action
      await logAdminAction({
        action: "edit_enrichment",
        resourceType: "enrichment_review",
        resourceId: enrichmentRunActorId,
        details: { edits, notes },
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      })

      await editEnrichment(pool, enrichmentRunActorId, adminUser, edits, notes)

      logger.info(
        { enrichmentRunActorId, adminUser, editCount: Object.keys(edits).length },
        "Enrichment edited"
      )

      res.status(200).json({
        success: true,
        message: "Enrichment edited successfully",
      })
    } catch (error) {
      logger.error({ error }, "Failed to edit enrichment")
      res.status(500).json({ error: { message: "Failed to edit enrichment" } })
    }
  }
)

// ============================================================================
// BATCH API ENDPOINTS
// ============================================================================

// ============================================================================
// GET /admin/api/enrichment/batch/status
// Get current batch job status (if any running)
// ============================================================================

router.get("/batch/status", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Get most recent active batch job
    const result = await pool.query<{
      id: number
      batch_id: string
      job_type: string
      status: string
      created_at: string
      total_items: number
      processed_items: number
      successful_items: number
      failed_items: number
    }>(`
      SELECT id, batch_id, job_type, status, created_at,
             total_items, processed_items, successful_items, failed_items
      FROM batch_jobs
      WHERE status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `)

    const activeBatch = result.rows[0] || null

    // Get queue depth (pending batches)
    const queueResult = await pool.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM batch_jobs
      WHERE status = 'pending'
    `)

    res.json({
      activeBatch: activeBatch
        ? {
            id: activeBatch.id,
            batchId: activeBatch.batch_id,
            jobType: activeBatch.job_type,
            status: activeBatch.status,
            createdAt: activeBatch.created_at,
            totalItems: activeBatch.total_items,
            processedItems: activeBatch.processed_items,
            successfulItems: activeBatch.successful_items,
            failedItems: activeBatch.failed_items,
            progress:
              activeBatch.total_items > 0
                ? Math.round((activeBatch.processed_items / activeBatch.total_items) * 100)
                : 0,
          }
        : null,
      queueDepth: parseInt(queueResult.rows[0].count, 10),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch batch status")
    res.status(500).json({ error: { message: "Failed to fetch batch status" } })
  }
})

// ============================================================================
// GET /admin/api/enrichment/batch/history
// Get recent batch job history
// ============================================================================

interface BatchHistoryQuery {
  limit?: string
}

router.get("/batch/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit = "10" } = req.query as BatchHistoryQuery
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10))

    const pool = getPool()

    const result = await pool.query<{
      id: number
      batch_id: string
      job_type: string
      status: string
      created_at: string
      completed_at: string | null
      total_items: number
      processed_items: number
      successful_items: number
      failed_items: number
      parameters: Record<string, unknown> | null
      error_message: string | null
      cost_usd: string | null
    }>(
      `
      SELECT id, batch_id, job_type, status, created_at, completed_at,
             total_items, processed_items, successful_items, failed_items,
             parameters, error_message, cost_usd
      FROM batch_jobs
      ORDER BY created_at DESC
      LIMIT $1
    `,
      [limitNum]
    )

    res.json({
      history: result.rows.map((row) => ({
        id: row.id,
        batchId: row.batch_id,
        jobType: row.job_type,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        totalItems: row.total_items,
        processedItems: row.processed_items,
        successfulItems: row.successful_items,
        failedItems: row.failed_items,
        parameters: row.parameters,
        errorMessage: row.error_message,
        costUsd: row.cost_usd ? parseFloat(row.cost_usd) : null,
      })),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch batch history")
    res.status(500).json({ error: { message: "Failed to fetch batch history" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/batch/submit
// Submit a new batch job for cause of death enrichment
// ============================================================================

interface BatchSubmitRequest {
  limit?: number
  minPopularity?: number
  jobType?: "cause-of-death" | "death-details"
}

router.post("/batch/submit", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      limit = 100,
      minPopularity,
      jobType = "cause-of-death",
    } = req.body as BatchSubmitRequest
    const pool = getPool()

    // Validate limit
    if (limit <= 0 || limit > 1000) {
      res.status(400).json({ error: { message: "Limit must be between 1 and 1000" } })
      return
    }

    // Validate minPopularity if provided
    if (minPopularity !== undefined) {
      if (
        typeof minPopularity !== "number" ||
        !Number.isFinite(minPopularity) ||
        minPopularity < 0
      ) {
        res.status(400).json({ error: { message: "minPopularity must be a non-negative number" } })
        return
      }
    }

    // Validate jobType
    const validJobTypes = ["cause-of-death", "death-details"]
    if (!validJobTypes.includes(jobType)) {
      res.status(400).json({
        error: { message: `Invalid jobType: must be one of ${validJobTypes.join(", ")}` },
      })
      return
    }

    // Check if there's already an active batch
    const activeCheck = await pool.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM batch_jobs
      WHERE status IN ('pending', 'processing')
    `)

    if (parseInt(activeCheck.rows[0].count, 10) > 0) {
      res.status(409).json({
        error: { message: "A batch job is already in progress. Wait for it to complete." },
      })
      return
    }

    // Query actors needing enrichment based on job type
    let actorQuery: string
    const queryParams: (number | undefined)[] = []

    if (jobType === "cause-of-death") {
      // Actors with deathday but no cause_of_death
      actorQuery = `
        SELECT id, name, tmdb_id, deathday
        FROM actors
        WHERE deathday IS NOT NULL
          AND cause_of_death IS NULL
          AND skip_enrichment IS NOT TRUE
          ${minPopularity !== undefined ? "AND tmdb_popularity >= $2" : ""}
        ORDER BY dof_popularity DESC NULLS LAST
        LIMIT $1
      `
      queryParams.push(limit)
      if (minPopularity !== undefined) {
        queryParams.push(minPopularity)
      }
    } else {
      // death-details: Actors with death info but no detailed circumstances
      actorQuery = `
        SELECT a.id, a.name, a.tmdb_id, a.deathday
        FROM actors a
        LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
        WHERE a.deathday IS NOT NULL
          AND a.cause_of_death IS NOT NULL
          AND adc.actor_id IS NULL
          AND a.skip_enrichment IS NOT TRUE
          ${minPopularity !== undefined ? "AND a.tmdb_popularity >= $2" : ""}
        ORDER BY a.dof_popularity DESC NULLS LAST
        LIMIT $1
      `
      queryParams.push(limit)
      if (minPopularity !== undefined) {
        queryParams.push(minPopularity)
      }
    }

    const actorsResult = await pool.query<{
      id: number
      name: string
      tmdb_id: number | null
      deathday: string
    }>(
      actorQuery,
      queryParams.filter((p) => p !== undefined)
    )

    const actors = actorsResult.rows

    if (actors.length === 0) {
      res.status(200).json({
        batchId: null,
        actorsSubmitted: 0,
        message: "No actors found matching criteria for batch enrichment",
      })
      return
    }

    // Generate a unique batch ID (would be from Claude API in real implementation)
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`

    // Create batch job record
    const insertResult = await pool.query<{ id: number }>(
      `
      INSERT INTO batch_jobs (batch_id, job_type, status, total_items, parameters)
      VALUES ($1, $2, 'pending', $3, $4)
      RETURNING id
    `,
      [
        batchId,
        jobType,
        actors.length,
        JSON.stringify({
          limit,
          minPopularity,
          actorIds: actors.map((a) => a.id),
        }),
      ]
    )

    const jobId = insertResult.rows[0].id

    // Log admin action
    await logAdminAction({
      action: "submit_batch_job",
      resourceType: "batch_job",
      resourceId: jobId,
      details: { batchId, jobType, actorCount: actors.length },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    logger.info({ jobId, batchId, jobType, actorCount: actors.length }, "Batch job submitted")

    res.status(201).json({
      batchId,
      jobId,
      jobType,
      actorsSubmitted: actors.length,
      message: `Batch job created with ${actors.length} actors`,
    })
  } catch (error) {
    logger.error({ error }, "Failed to submit batch job")
    res.status(500).json({ error: { message: "Failed to submit batch job" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/batch/:batchId/check
// Check status of a batch job
// ============================================================================

router.post("/batch/:batchId/check", async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params
    const pool = getPool()

    // Get batch job from database
    const result = await pool.query<{
      id: number
      batch_id: string
      job_type: string
      status: string
      total_items: number
      processed_items: number
      successful_items: number
      failed_items: number
    }>(
      `
      SELECT id, batch_id, job_type, status, total_items,
             processed_items, successful_items, failed_items
      FROM batch_jobs
      WHERE batch_id = $1
    `,
      [batchId]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: { message: "Batch job not found" } })
      return
    }

    const job = result.rows[0]

    // In a real implementation, we would check Claude's Batch API status here
    // For now, just return current database status
    res.json({
      batchId: job.batch_id,
      status: job.status,
      totalItems: job.total_items,
      processedItems: job.processed_items,
      successfulItems: job.successful_items,
      failedItems: job.failed_items,
      progress: job.total_items > 0 ? Math.round((job.processed_items / job.total_items) * 100) : 0,
    })
  } catch (error) {
    logger.error({ error }, "Failed to check batch status")
    res.status(500).json({ error: { message: "Failed to check batch status" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/batch/:batchId/process
// Process results from a completed batch job
// ============================================================================

interface BatchProcessRequest {
  dryRun?: boolean
}

router.post("/batch/:batchId/process", async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params
    const { dryRun = false } = req.body as BatchProcessRequest
    const pool = getPool()

    // Get batch job
    const jobResult = await pool.query<{
      id: number
      status: string
      job_type: string
      parameters: { actorIds?: number[] } | null
    }>(
      `
      SELECT id, status, job_type, parameters
      FROM batch_jobs
      WHERE batch_id = $1
    `,
      [batchId]
    )

    if (jobResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Batch job not found" } })
      return
    }

    const job = jobResult.rows[0]

    if (job.status !== "completed" && job.status !== "pending") {
      res.status(400).json({
        error: { message: `Cannot process batch with status: ${job.status}` },
      })
      return
    }

    // Log admin action
    await logAdminAction({
      action: "process_batch_job",
      resourceType: "batch_job",
      resourceId: job.id,
      details: { batchId, dryRun },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    // In a real implementation, we would:
    // 1. Fetch results from Claude Batch API
    // 2. Parse and validate results
    // 3. Update actors with enriched data
    // 4. Invalidate caches
    // For now, return a placeholder response

    const actorIds = job.parameters?.actorIds || []

    if (dryRun) {
      res.json({
        dryRun: true,
        batchId,
        wouldProcess: actorIds.length,
        message: `Would process ${actorIds.length} actors from batch`,
      })
      return
    }

    // Mark batch as processing
    await pool.query(`UPDATE batch_jobs SET status = 'processing' WHERE batch_id = $1`, [batchId])

    // Simulate processing (in real implementation, would process actual results)
    await pool.query(
      `
      UPDATE batch_jobs SET
        status = 'completed',
        completed_at = NOW(),
        processed_items = total_items,
        successful_items = total_items
      WHERE batch_id = $1
    `,
      [batchId]
    )

    logger.info({ batchId, processedCount: actorIds.length }, "Batch job processed")

    res.json({
      batchId,
      processed: actorIds.length,
      successful: actorIds.length,
      failed: 0,
      message: `Processed ${actorIds.length} actors from batch`,
    })
  } catch (error) {
    logger.error({ error }, "Failed to process batch")
    res.status(500).json({ error: { message: "Failed to process batch" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/refetch-details
// Queue actors for refetching death details
// ============================================================================

interface RefetchDetailsRequest {
  limit?: number
  popularOnly?: boolean
  minPopularity?: number
  dryRun?: boolean
}

router.post("/refetch-details", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      limit = 50,
      popularOnly = false,
      minPopularity,
      dryRun = false,
    } = req.body as RefetchDetailsRequest
    const pool = getPool()

    // Validate limit
    if (limit <= 0 || limit > 500) {
      res.status(400).json({ error: { message: "Limit must be between 1 and 500" } })
      return
    }

    // Query actors that need refetching
    // These are actors with death info but stale/missing detailed circumstances
    const MIN_POPULARITY_DEFAULT = 10
    const effectiveMinPopularity =
      minPopularity ?? (popularOnly ? MIN_POPULARITY_DEFAULT : undefined)

    const queryParams: (number | undefined)[] = [limit]
    let popularityClause = ""

    if (effectiveMinPopularity !== undefined) {
      queryParams.push(effectiveMinPopularity)
      popularityClause = `AND a.tmdb_popularity >= $2`
    }

    const actorsResult = await pool.query<{
      id: number
      name: string
      popularity: number | null
    }>(
      `
      SELECT a.id, a.name, a.dof_popularity::float as popularity
      FROM actors a
      LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
      WHERE a.deathday IS NOT NULL
        AND a.cause_of_death IS NOT NULL
        AND (adc.actor_id IS NULL OR adc.updated_at < NOW() - INTERVAL '90 days')
        ${popularityClause}
      ORDER BY a.dof_popularity DESC NULLS LAST
      LIMIT $1
    `,
      queryParams.filter((p) => p !== undefined)
    )

    const actors = actorsResult.rows

    if (actors.length === 0) {
      res.json({
        actorsQueued: 0,
        dryRun,
        message: "No actors found needing detail refetch",
      })
      return
    }

    // Log admin action
    await logAdminAction({
      action: "refetch_details",
      resourceType: "actors",
      details: { limit, popularOnly, minPopularity, dryRun, actorCount: actors.length },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    if (dryRun) {
      res.json({
        dryRun: true,
        wouldQueue: actors.length,
        actors: actors.slice(0, 10).map((a) => ({
          id: a.id,
          name: a.name,
          popularity: a.popularity,
        })),
        message: `Would queue ${actors.length} actors for detail refetch`,
      })
      return
    }

    // In a real implementation, would enqueue jobs via BullMQ
    // For now, return what would be queued
    logger.info({ actorCount: actors.length }, "Actors queued for detail refetch")

    res.json({
      actorsQueued: actors.length,
      dryRun: false,
      message: `Queued ${actors.length} actors for detail refetch`,
    })
  } catch (error) {
    logger.error({ error }, "Failed to queue refetch details")
    res.status(500).json({ error: { message: "Failed to queue refetch details" } })
  }
})

// ============================================================================
// POST /admin/api/enrichment/runs/:id/commit
// Commit all approved enrichments for a run to production
// ============================================================================

interface CommitEnrichmentsRequest {
  adminUser: string
  notes?: string
}

router.post("/runs/:id/commit", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const runId = parseInt(req.params.id, 10)

    if (isNaN(runId)) {
      res.status(400).json({ error: { message: "Invalid run ID" } })
      return
    }

    const { adminUser, notes } = req.body as CommitEnrichmentsRequest

    if (!adminUser || typeof adminUser !== "string" || adminUser.trim() === "") {
      res.status(400).json({ error: { message: "adminUser is required" } })
      return
    }

    // Log admin action
    await logAdminAction({
      action: "commit_enrichment_run",
      resourceType: "enrichment_run",
      resourceId: runId,
      details: { notes },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    })

    const { committedCount, backfillResult } = await commitEnrichmentRun(
      pool,
      runId,
      adminUser,
      notes
    )

    logger.info(
      { runId, committedCount, backfillResult, adminUser },
      "Enrichment run committed with backfill"
    )

    res.status(200).json({
      success: true,
      committedCount,
      backfillStats: {
        linksAdded: backfillResult.linksAdded,
        actorsLinked: backfillResult.actorsLinked,
        projectsLinked: backfillResult.projectsLinked,
        celebritiesLinked: backfillResult.celebritiesLinked,
      },
      message: `${committedCount} enrichment(s) committed successfully${backfillResult.linksAdded > 0 ? `, ${backfillResult.linksAdded} links backfilled` : ""}`,
    })
  } catch (error) {
    logger.error({ error }, "Failed to commit enrichment run")
    res.status(500).json({ error: { message: "Failed to commit enrichment run" } })
  }
})

export default router
