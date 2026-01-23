/**
 * Admin API routes for page view analytics.
 *
 * Provides endpoints for:
 * - Page view summary statistics
 * - Top viewed pages by type
 * - Page view trends over time
 * - Page view tracking (public endpoint with rate limiting)
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { isbot } from "isbot"
import {
  getPageViewSummary,
  getTopViewedPages,
  getPageViewTrends,
  trackPageView,
} from "../../lib/db/admin-page-view-queries.js"

const router = Router()

// ============================================================================
// GET /admin/api/page-views/summary
// Aggregated page view statistics
// ============================================================================

router.get("/summary", async (req: Request, res: Response): Promise<void> => {
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

    const pageType = (req.query.pageType as string) || "all"

    const summary = await getPageViewSummary(pool, startDateStr, endDateStr, pageType)

    res.json(summary)
  } catch (error) {
    logger.error({ error }, "Failed to fetch page view summary")
    res.status(500).json({ error: { message: "Failed to fetch page view summary" } })
  }
})

// ============================================================================
// GET /admin/api/page-views/top-viewed
// Most viewed pages by type
// ============================================================================

router.get("/top-viewed", async (req: Request, res: Response): Promise<void> => {
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

    const pageType = (req.query.pageType as string) || "all"
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20))

    const topViewed = await getTopViewedPages(pool, pageType, startDateStr, endDateStr, limit)

    res.json(topViewed)
  } catch (error) {
    logger.error({ error }, "Failed to fetch top viewed pages")
    res.status(500).json({ error: { message: "Failed to fetch top viewed pages" } })
  }
})

// ============================================================================
// GET /admin/api/page-views/trends
// Views over time with breakdown by type
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

    const trends = await getPageViewTrends(
      pool,
      startDateStr,
      endDateStr,
      granularity as "daily" | "weekly" | "monthly"
    )

    res.json(trends)
  } catch (error) {
    logger.error({ error }, "Failed to fetch page view trends")
    res.status(500).json({ error: { message: "Failed to fetch page view trends" } })
  }
})

// ============================================================================
// POST /api/page-views/track (PUBLIC ENDPOINT)
// Track individual page view
// Rate limited to 20 req/min per IP (configured in index.ts)
// ============================================================================

export async function trackPageViewHandler(req: Request, res: Response): Promise<void> {
  try {
    // Check for bot user agents
    const userAgent = req.headers["user-agent"] || ""
    if (isbot(userAgent)) {
      // Silently ignore bot requests
      res.status(204).send()
      return
    }

    const { pageType, entityId, path } = req.body

    // Validate required fields
    if (!pageType || !entityId || !path) {
      res.status(400).json({
        error: { message: "Missing required fields: pageType, entityId, path" },
      })
      return
    }

    // Validate page type
    const validPageTypes = ["movie", "show", "episode", "actor_death"]
    if (!validPageTypes.includes(pageType)) {
      res.status(400).json({
        error: { message: `Invalid pageType. Must be one of: ${validPageTypes.join(", ")}` },
      })
      return
    }

    // Validate entity ID
    const entityIdNum = parseInt(entityId, 10)
    if (isNaN(entityIdNum) || entityIdNum <= 0) {
      res.status(400).json({ error: { message: "Invalid entityId. Must be a positive integer." } })
      return
    }

    const pool = getPool()

    // Extract referrer header (handle string[] case)
    const referrerHeader = req.headers["referer"] || req.headers["referrer"]
    const referrer = Array.isArray(referrerHeader) ? referrerHeader[0] : referrerHeader

    await trackPageView(pool, {
      pageType,
      entityId: entityIdNum,
      path,
      referrer,
      userAgent,
    })

    // Return 204 No Content (success, no body needed)
    res.status(204).send()
  } catch (error) {
    logger.error({ error }, "Failed to track page view")
    // Still return 204 - we don't want to interrupt user experience
    // even if tracking fails
    res.status(204).send()
  }
}

export default router
