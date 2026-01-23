/**
 * Admin API routes for cronjob monitoring.
 *
 * Provides endpoints for:
 * - Viewing cronjob run history
 * - Viewing cronjob statistics (success rate, avg duration)
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { getCronjobRuns, getCronjobStats } from "../../lib/cronjob-tracking.js"

const router = Router()

// ============================================================================
// GET /admin/api/cronjobs/runs
// Get cronjob run history
// ============================================================================

router.get("/runs", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const jobName = req.query.jobName as string | undefined
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string, 10) || 100))

    const runs = await getCronjobRuns(pool, jobName, limit)

    res.json(runs)
  } catch (error) {
    logger.error({ error }, "Failed to fetch cronjob runs")
    res.status(500).json({ error: { message: "Failed to fetch cronjob runs" } })
  }
})

// ============================================================================
// GET /admin/api/cronjobs/stats/:jobName
// Get statistics for a specific cronjob
// ============================================================================

router.get("/stats/:jobName", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const { jobName } = req.params

    if (!jobName) {
      res.status(400).json({ error: { message: "Job name is required" } })
      return
    }

    const stats = await getCronjobStats(pool, jobName)

    res.json(stats)
  } catch (error) {
    logger.error({ error }, "Failed to fetch cronjob stats")
    res.status(500).json({ error: { message: "Failed to fetch cronjob stats" } })
  }
})

export default router
