/**
 * Admin cost analytics endpoints.
 *
 * Provides visibility into costs across:
 * - Death source API queries
 * - AI helper operations
 * - Enrichment runs
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { getCostBySource } from "../../lib/db/admin-analytics-queries.js"

const router = Router()

// ============================================================================
// GET /admin/api/analytics/costs/by-source
// Get aggregated costs by death source with optional date filtering
// ============================================================================

router.get("/costs/by-source", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Parse optional date range
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    const result = await getCostBySource(pool, startDate, endDate)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch cost by source analytics")
    res.status(500).json({ error: { message: "Failed to fetch cost by source analytics" } })
  }
})

export default router
