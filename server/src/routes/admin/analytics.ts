/**
 * Admin analytics endpoints.
 *
 * Provides visibility into:
 * - Cost analytics (death source API queries, AI helper operations, enrichment runs)
 * - Page visit analytics (internal navigation patterns, popular pages, traffic sources)
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { getCostBySource } from "../../lib/db/admin-analytics-queries.js"
import {
  getInternalReferralsOverTime,
  getTopNavigationPaths,
  getMostPopularPagesByInternalReferrals,
  getNavigationByHourOfDay,
  getEntryExitPages,
  getPageVisitStats,
} from "../../lib/db/admin-page-visit-queries.js"

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

// ============================================================================
// GET /admin/api/analytics/page-visits/stats
// Get overall page visit statistics summary
// ============================================================================

router.get("/page-visits/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    const result = await getPageVisitStats(pool, startDate, endDate)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch page visit stats")
    res.status(500).json({ error: { message: "Failed to fetch page visit stats" } })
  }
})

// ============================================================================
// GET /admin/api/analytics/page-visits/internal-referrals-over-time
// Get internal referrals over time as a time series
// ============================================================================

router.get(
  "/page-visits/internal-referrals-over-time",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const pool = getPool()

      const startDate = req.query.startDate as string | undefined
      const endDate = req.query.endDate as string | undefined
      const granularity = (req.query.granularity as "hour" | "day" | "week") || "day"

      // Validate granularity
      if (!["hour", "day", "week"].includes(granularity)) {
        res
          .status(400)
          .json({ error: { message: "Invalid granularity. Must be 'hour', 'day', or 'week'" } })
        return
      }

      const result = await getInternalReferralsOverTime(pool, startDate, endDate, granularity)

      res.json(result)
    } catch (error) {
      logger.error({ error }, "Failed to fetch internal referrals over time")
      res.status(500).json({ error: { message: "Failed to fetch internal referrals over time" } })
    }
  }
)

// ============================================================================
// GET /admin/api/analytics/page-visits/navigation-paths
// Get most common navigation paths
// ============================================================================

router.get("/page-visits/navigation-paths", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: { message: "Invalid limit. Must be between 1 and 100" } })
      return
    }

    const result = await getTopNavigationPaths(pool, startDate, endDate, limit)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch navigation paths")
    res.status(500).json({ error: { message: "Failed to fetch navigation paths" } })
  }
})

// ============================================================================
// GET /admin/api/analytics/page-visits/popular-pages
// Get most popular pages by internal referrals
// ============================================================================

router.get("/page-visits/popular-pages", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: { message: "Invalid limit. Must be between 1 and 100" } })
      return
    }

    const result = await getMostPopularPagesByInternalReferrals(pool, startDate, endDate, limit)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch popular pages")
    res.status(500).json({ error: { message: "Failed to fetch popular pages" } })
  }
})

// ============================================================================
// GET /admin/api/analytics/page-visits/hourly-patterns
// Get navigation patterns by hour of day
// ============================================================================

router.get("/page-visits/hourly-patterns", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined

    const result = await getNavigationByHourOfDay(pool, startDate, endDate)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch hourly patterns")
    res.status(500).json({ error: { message: "Failed to fetch hourly patterns" } })
  }
})

// ============================================================================
// GET /admin/api/analytics/page-visits/entry-exit
// Get entry and exit pages
// ============================================================================

router.get("/page-visits/entry-exit", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: { message: "Invalid limit. Must be between 1 and 100" } })
      return
    }

    const result = await getEntryExitPages(pool, startDate, endDate, limit)

    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to fetch entry/exit pages")
    res.status(500).json({ error: { message: "Failed to fetch entry/exit pages" } })
  }
})

// ============================================================================
// GET /admin/api/analytics/actor-url-redirects
// Get actor URL migration redirect statistics (tmdb_id → actor.id)
// Cached for 1 hour since this is historical data
// ============================================================================

router.get("/actor-url-redirects", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30

    // Validate days
    if (isNaN(days) || days < 1 || days > 365) {
      res.status(400).json({ error: { message: "Invalid days. Must be between 1 and 365" } })
      return
    }

    // Query for daily redirect counts
    const result = await pool.query<{ date: string; redirect_count: number }>(
      `
      SELECT
        DATE(visited_at)::text as date,
        COUNT(*)::int as redirect_count
      FROM page_visits
      WHERE visited_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
        AND is_internal_referral = true
        AND referrer_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
        AND referrer_path != visited_path
        -- Exclude same actor (e.g., /actor/X vs /actor/X/death)
        AND split_part(referrer_path, '-', -1) != split_part(visited_path, '-', -1)
        AND visited_at >= NOW() - INTERVAL '1 day' * $1
      GROUP BY DATE(visited_at)
      ORDER BY date ASC
    `,
      [days]
    )

    // Calculate summary stats
    const totalRedirects = result.rows.reduce((sum, row) => sum + row.redirect_count, 0)
    const avgPerDay = result.rows.length > 0 ? totalRedirects / result.rows.length : 0

    res
      .set("Cache-Control", "public, max-age=3600") // Cache for 1 hour
      .json({
        dailyData: result.rows,
        summary: {
          totalRedirects,
          avgPerDay: Math.round(avgPerDay * 10) / 10,
          daysTracked: result.rows.length,
          periodDays: days,
        },
      })
  } catch (error) {
    logger.error({ error }, "Failed to fetch actor URL redirect analytics")
    res.status(500).json({ error: { message: "Failed to fetch actor URL redirect analytics" } })
  }
})

export default router
