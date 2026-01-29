/**
 * Admin API routes for error log management.
 *
 * Provides REST API for viewing and searching application error logs.
 */

import { Router } from "express"
import type { Request, Response } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

const router = Router()

/** Valid log levels */
const VALID_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"]

/** Valid log sources */
const VALID_SOURCES = ["route", "script", "cronjob", "middleware", "startup", "other"]

/**
 * GET /admin/api/logs
 * List error logs with pagination and filters
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    // Validate and parse pagination parameters
    let page = 1
    if (req.query.page !== undefined) {
      const parsedPage = Number.parseInt(req.query.page as string, 10)
      if (Number.isNaN(parsedPage) || parsedPage < 1) {
        return res.status(400).json({
          error: { message: "Invalid 'page' query parameter; must be a positive integer." },
        })
      }
      page = parsedPage
    }

    let pageSize = 50
    if (req.query.pageSize !== undefined) {
      const parsedPageSize = Number.parseInt(req.query.pageSize as string, 10)
      if (Number.isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
        return res.status(400).json({
          error: {
            message: "Invalid 'pageSize' query parameter; must be an integer between 1 and 100.",
          },
        })
      }
      pageSize = parsedPageSize
    }

    // Parse filter parameters
    const level = req.query.level as string | undefined
    const source = req.query.source as string | undefined
    const search = req.query.search as string | undefined
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    // Validate level if provided
    if (level && !VALID_LEVELS.includes(level)) {
      return res.status(400).json({
        error: { message: `Invalid level. Must be one of: ${VALID_LEVELS.join(", ")}` },
      })
    }

    // Validate source if provided
    if (source && !VALID_SOURCES.includes(source)) {
      return res.status(400).json({
        error: { message: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}` },
      })
    }

    const offset = (page - 1) * pageSize
    const pool = getPool()

    // Build query with filters
    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (level) {
      conditions.push(`level = $${paramIndex}`)
      params.push(level)
      paramIndex++
    }

    if (source) {
      conditions.push(`source = $${paramIndex}`)
      params.push(source)
      paramIndex++
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`)
      params.push(startDate)
      paramIndex++
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`)
      params.push(endDate)
      paramIndex++
    }

    if (search) {
      conditions.push(
        `to_tsvector('english', message) @@ plainto_tsquery('english', $${paramIndex})`
      )
      params.push(search)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM error_logs ${whereClause}`
    const countResult = await pool.query(countQuery, params)
    const total = parseInt(countResult.rows[0].count)

    // Get paginated results
    const query = `
      SELECT
        id,
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
    logger.error({ error }, "Failed to fetch error logs")
    res.status(500).json({ error: { message: "Failed to fetch error logs" } })
  }
})

/**
 * GET /admin/api/logs/stats
 * Get aggregated error log statistics
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const pool = getPool()

    // Counts by level (last 24h)
    const levelCountsQuery = `
      SELECT level, COUNT(*) as count
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY level
      ORDER BY
        CASE level
          WHEN 'fatal' THEN 1
          WHEN 'error' THEN 2
          WHEN 'warn' THEN 3
          WHEN 'info' THEN 4
          WHEN 'debug' THEN 5
          WHEN 'trace' THEN 6
        END
    `
    const levelCountsResult = await pool.query(levelCountsQuery)

    // Counts by source (last 24h)
    const sourceCountsQuery = `
      SELECT source, COUNT(*) as count
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY source
      ORDER BY count DESC
    `
    const sourceCountsResult = await pool.query(sourceCountsQuery)

    // Error rate over time (hourly for last 24h)
    const timelineQuery = `
      SELECT
        date_trunc('hour', created_at) as hour,
        COUNT(*) as count
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY date_trunc('hour', created_at)
      ORDER BY hour
    `
    const timelineResult = await pool.query(timelineQuery)

    // Most common error messages (last 24h)
    const topMessagesQuery = `
      SELECT
        left(message, 100) as message_preview,
        COUNT(*) as count,
        MAX(created_at) as last_occurred
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
        AND level IN ('error', 'fatal')
      GROUP BY left(message, 100)
      ORDER BY count DESC
      LIMIT 10
    `
    const topMessagesResult = await pool.query(topMessagesQuery)

    // Total counts
    const totalsQuery = `
      SELECT
        COUNT(*) as total_24h,
        COUNT(*) FILTER (WHERE level = 'error') as errors_24h,
        COUNT(*) FILTER (WHERE level = 'fatal') as fatals_24h
      FROM error_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `
    const totalsResult = await pool.query(totalsQuery)

    res.json({
      totals: totalsResult.rows[0],
      byLevel: levelCountsResult.rows,
      bySource: sourceCountsResult.rows,
      timeline: timelineResult.rows,
      topMessages: topMessagesResult.rows,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch error log stats")
    res.status(500).json({ error: { message: "Failed to fetch error log stats" } })
  }
})

/**
 * GET /admin/api/logs/:id
 * Get details for a specific error log
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const pool = getPool()

    const result = await pool.query(
      `SELECT
        id,
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
      WHERE id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: "Log entry not found" } })
    }

    res.json(result.rows[0])
  } catch (error) {
    logger.error({ error, logId: req.params.id }, "Failed to fetch error log details")
    res.status(500).json({ error: { message: "Failed to fetch error log details" } })
  }
})

/**
 * DELETE /admin/api/logs/cleanup
 * Delete old log entries
 */
router.delete("/cleanup", async (req: Request, res: Response) => {
  try {
    // Default to keeping last 30 days
    const daysToKeep = Math.min(90, Math.max(7, parseInt(req.body.daysToKeep as string) || 30))
    const pool = getPool()

    const result = await pool.query(
      `DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'`
    )

    logger.info(
      { deletedCount: result.rowCount, daysToKeep },
      "Cleaned up old error logs via admin API"
    )

    res.json({
      success: true,
      message: `Deleted ${result.rowCount} log entries older than ${daysToKeep} days`,
      deleted: result.rowCount,
    })
  } catch (error) {
    logger.error({ error }, "Failed to cleanup error logs")
    res.status(500).json({ error: { message: "Failed to cleanup error logs" } })
  }
})

export default router
