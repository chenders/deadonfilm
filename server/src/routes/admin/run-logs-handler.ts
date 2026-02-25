/**
 * Shared handler factory for run_logs queries.
 * Used by both death and biography enrichment routes to serve
 * paginated, filterable logs from the run_logs table.
 *
 * @module run-logs-handler
 */

import { Request, Response } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

/**
 * Creates an Express handler that queries the run_logs table
 * filtered by run_type and run_id with pagination and optional level filtering.
 *
 * @param runType - Discriminator for the run_logs.run_type column ("death" or "biography")
 * @returns Express route handler
 */
export function createRunLogsHandler(runType: "death" | "biography"): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const pool = getPool()
      const runId = parseInt((req.params.id ?? req.query.runId) as string, 10)

      if (isNaN(runId)) {
        res.status(400).json({ error: { message: "Invalid or missing run ID" } })
        return
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50))
      const level = req.query.level as string | undefined

      const conditions = ["run_type = $1", "run_id = $2"]
      const params: (string | number)[] = [runType, runId]
      let paramIndex = 3

      if (level && ["info", "warn", "error", "debug"].includes(level)) {
        conditions.push(`level = $${paramIndex}`)
        params.push(level)
        paramIndex++
      }

      const whereClause = conditions.join(" AND ")

      const [countResult, logsResult] = await Promise.all([
        pool.query<{ total: string }>(
          `SELECT COUNT(*) as total FROM run_logs WHERE ${whereClause}`,
          params
        ),
        pool.query(
          `SELECT id, timestamp, level, message, data, source
           FROM run_logs
           WHERE ${whereClause}
           ORDER BY timestamp ASC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, pageSize, (page - 1) * pageSize]
        ),
      ])

      const total = parseInt(countResult.rows[0]?.total ?? "0", 10)

      res.json({
        logs: logsResult.rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      })
    } catch (error) {
      logger.error({ error }, `Failed to fetch ${runType} run logs`)
      res.status(500).json({ error: { message: `Failed to fetch ${runType} run logs` } })
    }
  }
}
