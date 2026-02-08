/**
 * Admin Google Search Console API routes.
 *
 * Provides endpoints for:
 * - Search performance (impressions, clicks, CTR, position over time)
 * - Top queries and pages
 * - Page type performance breakdown
 * - Sitemap status
 * - URL inspection
 * - Indexing status history
 * - SEO alerts
 *
 * All data is fetched from the GSC API and cached in Redis.
 * Historical snapshots are stored in PostgreSQL for trend analysis.
 */

import { Request, Response, Router } from "express"
import { logger } from "../../lib/logger.js"
import { getPool } from "../../lib/db/pool.js"
import {
  isGscConfigured,
  getSearchPerformanceOverTime,
  getTopQueries,
  getTopPages,
  getPerformanceByPageType,
  getSitemaps,
  inspectUrl,
  daysAgo,
  categorizeUrl,
  type SearchType,
} from "../../lib/gsc-client.js"

const VALID_SEARCH_TYPES = new Set<string>(["web", "image", "video", "news"])
const MIN_DAYS = 1
const MAX_DAYS = 365
const MIN_LIMIT = 1
const MAX_LIMIT = 100
import {
  getSearchPerformanceHistory,
  getTopQueriesHistory,
  getTopPagesHistory,
  getPageTypePerformanceHistory,
  getIndexingStatusHistory,
  getGscAlerts,
  acknowledgeGscAlert,
} from "../../lib/db/admin-gsc-queries.js"

const router = Router()

// ============================================================================
// GET /admin/api/gsc/status
// Check if GSC integration is configured
// ============================================================================

router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  res.json({
    configured: isGscConfigured(),
    siteUrl: process.env.GSC_SITE_URL || null,
  })
})

// ============================================================================
// GET /admin/api/gsc/performance
// Get search performance over time (from GSC API, with DB fallback)
// ============================================================================

router.get("/performance", async (req: Request, res: Response): Promise<void> => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30
    if (isNaN(days) || days < MIN_DAYS || days > MAX_DAYS) {
      res
        .status(400)
        .json({ error: { message: `Invalid days. Must be between ${MIN_DAYS} and ${MAX_DAYS}` } })
      return
    }

    const searchType = ((req.query.searchType as string) || "web") as SearchType
    if (!VALID_SEARCH_TYPES.has(searchType)) {
      res.status(400).json({
        error: {
          message: `Invalid searchType. Must be one of: ${[...VALID_SEARCH_TYPES].join(", ")}`,
        },
      })
      return
    }

    const source = (req.query.source as string) || "auto"

    const startDate = (req.query.startDate as string) || daysAgo(days)
    const endDate = (req.query.endDate as string) || daysAgo(1)

    // Try GSC API first if configured, fall back to stored snapshots
    if (source !== "db" && isGscConfigured()) {
      try {
        const result = await getSearchPerformanceOverTime(startDate, endDate, searchType)
        res.json({
          source: "api",
          startDate,
          endDate,
          data: result.rows.map((row) => ({
            date: row.keys[0],
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          })),
          totals: result.totals,
        })
        return
      } catch (apiError) {
        logger.warn({ error: apiError }, "GSC API unavailable, falling back to stored data")
      }
    }

    // Fall back to stored snapshots
    const pool = getPool()
    const data = await getSearchPerformanceHistory(pool, startDate, endDate, searchType)
    const totals = data.reduce(
      (acc, row) => ({
        clicks: acc.clicks + row.clicks,
        impressions: acc.impressions + row.impressions,
        ctr: 0,
        position: 0,
      }),
      { clicks: 0, impressions: 0, ctr: 0, position: 0 }
    )
    totals.ctr = totals.impressions > 0 ? totals.clicks / totals.impressions : 0
    const weightedPos = data.reduce((sum, row) => sum + row.position * row.impressions, 0)
    totals.position = totals.impressions > 0 ? weightedPos / totals.impressions : 0

    res.json({ source: "db", startDate, endDate, data, totals })
  } catch (error) {
    logger.error({ error }, "Failed to fetch GSC search performance")
    res.status(500).json({ error: { message: "Failed to fetch search performance data" } })
  }
})

// ============================================================================
// GET /admin/api/gsc/top-queries
// Get top search queries
// ============================================================================

router.get("/top-queries", async (req: Request, res: Response): Promise<void> => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30
    if (isNaN(days) || days < MIN_DAYS || days > MAX_DAYS) {
      res
        .status(400)
        .json({ error: { message: `Invalid days. Must be between ${MIN_DAYS} and ${MAX_DAYS}` } })
      return
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50
    if (isNaN(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      res.status(400).json({
        error: { message: `Invalid limit. Must be between ${MIN_LIMIT} and ${MAX_LIMIT}` },
      })
      return
    }

    const source = (req.query.source as string) || "auto"

    const startDate = (req.query.startDate as string) || daysAgo(days)
    const endDate = (req.query.endDate as string) || daysAgo(1)

    if (source !== "db" && isGscConfigured()) {
      try {
        const result = await getTopQueries(startDate, endDate, limit)
        res.json({
          source: "api",
          startDate,
          endDate,
          data: result.rows.map((row) => ({
            query: row.keys[0],
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          })),
        })
        return
      } catch (apiError) {
        logger.warn({ error: apiError }, "GSC API unavailable for top queries")
      }
    }

    const pool = getPool()
    const data = await getTopQueriesHistory(pool, startDate, endDate, limit)
    res.json({ source: "db", startDate, endDate, data })
  } catch (error) {
    logger.error({ error }, "Failed to fetch GSC top queries")
    res.status(500).json({ error: { message: "Failed to fetch top queries" } })
  }
})

// ============================================================================
// GET /admin/api/gsc/top-pages
// Get top pages
// ============================================================================

router.get("/top-pages", async (req: Request, res: Response): Promise<void> => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30
    if (isNaN(days) || days < MIN_DAYS || days > MAX_DAYS) {
      res
        .status(400)
        .json({ error: { message: `Invalid days. Must be between ${MIN_DAYS} and ${MAX_DAYS}` } })
      return
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50
    if (isNaN(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      res.status(400).json({
        error: { message: `Invalid limit. Must be between ${MIN_LIMIT} and ${MAX_LIMIT}` },
      })
      return
    }

    const source = (req.query.source as string) || "auto"

    const startDate = (req.query.startDate as string) || daysAgo(days)
    const endDate = (req.query.endDate as string) || daysAgo(1)

    if (source !== "db" && isGscConfigured()) {
      try {
        const result = await getTopPages(startDate, endDate, limit)
        res.json({
          source: "api",
          startDate,
          endDate,
          data: result.rows.map((row) => ({
            page_url: row.keys[0],
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          })),
        })
        return
      } catch (apiError) {
        logger.warn({ error: apiError }, "GSC API unavailable for top pages")
      }
    }

    const pool = getPool()
    const data = await getTopPagesHistory(pool, startDate, endDate, limit)
    res.json({ source: "db", startDate, endDate, data })
  } catch (error) {
    logger.error({ error }, "Failed to fetch GSC top pages")
    res.status(500).json({ error: { message: "Failed to fetch top pages" } })
  }
})

// ============================================================================
// GET /admin/api/gsc/page-types
// Get performance broken down by page type
// ============================================================================

router.get("/page-types", async (req: Request, res: Response): Promise<void> => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30
    if (isNaN(days) || days < MIN_DAYS || days > MAX_DAYS) {
      res
        .status(400)
        .json({ error: { message: `Invalid days. Must be between ${MIN_DAYS} and ${MAX_DAYS}` } })
      return
    }

    const source = (req.query.source as string) || "auto"

    const startDate = (req.query.startDate as string) || daysAgo(days)
    const endDate = (req.query.endDate as string) || daysAgo(1)

    if (source !== "db" && isGscConfigured()) {
      try {
        const result = await getPerformanceByPageType(startDate, endDate)
        res.json({ source: "api", startDate, endDate, data: result })
        return
      } catch (apiError) {
        logger.warn({ error: apiError }, "GSC API unavailable for page types")
      }
    }

    const pool = getPool()
    const data = await getPageTypePerformanceHistory(pool, startDate, endDate)
    // Convert array to record format
    const byType: Record<
      string,
      { clicks: number; impressions: number; ctr: number; position: number }
    > = {}
    for (const row of data) {
      byType[row.page_type] = {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      }
    }
    res.json({ source: "db", startDate, endDate, data: byType })
  } catch (error) {
    logger.error({ error }, "Failed to fetch GSC page type performance")
    res.status(500).json({ error: { message: "Failed to fetch page type performance" } })
  }
})

// ============================================================================
// GET /admin/api/gsc/sitemaps
// Get sitemap submission status
// ============================================================================

router.get("/sitemaps", async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!isGscConfigured()) {
      res.json({ configured: false, data: [] })
      return
    }

    const data = await getSitemaps()
    res.json({ configured: true, data })
  } catch (error) {
    logger.error({ error }, "Failed to fetch GSC sitemap status")
    res.status(500).json({ error: { message: "Failed to fetch sitemap status" } })
  }
})

// ============================================================================
// POST /admin/api/gsc/inspect-url
// Inspect a specific URL's indexing status
// ============================================================================

router.post("/inspect-url", async (req: Request, res: Response): Promise<void> => {
  try {
    if (!isGscConfigured()) {
      res.status(400).json({ error: { message: "GSC is not configured" } })
      return
    }

    const { url } = req.body
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: { message: "URL is required" } })
      return
    }

    const result = await inspectUrl(url)
    res.json(result)
  } catch (error) {
    logger.error({ error }, "Failed to inspect URL")
    res.status(500).json({ error: { message: "Failed to inspect URL" } })
  }
})

// ============================================================================
// GET /admin/api/gsc/indexing
// Get indexing status history from stored snapshots
// ============================================================================

router.get("/indexing", async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 90
    const startDate = (req.query.startDate as string) || daysAgo(days)
    const endDate = (req.query.endDate as string) || daysAgo(0)

    const pool = getPool()
    const data = await getIndexingStatusHistory(pool, startDate, endDate)
    res.json({ startDate, endDate, data })
  } catch (error) {
    logger.error({ error }, "Failed to fetch indexing status history")
    res.status(500).json({ error: { message: "Failed to fetch indexing status" } })
  }
})

// ============================================================================
// GET /admin/api/gsc/alerts
// Get SEO alerts
// ============================================================================

router.get("/alerts", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const acknowledged =
      req.query.acknowledged === "true"
        ? true
        : req.query.acknowledged === "false"
          ? false
          : undefined
    const limit = parseInt(req.query.limit as string) || 50

    const data = await getGscAlerts(pool, { acknowledged, limit })
    res.json({ data })
  } catch (error) {
    logger.error({ error }, "Failed to fetch GSC alerts")
    res.status(500).json({ error: { message: "Failed to fetch alerts" } })
  }
})

// ============================================================================
// POST /admin/api/gsc/alerts/:id/acknowledge
// Acknowledge an alert
// ============================================================================

router.post("/alerts/:id/acknowledge", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const alertId = parseInt(req.params.id)
    if (isNaN(alertId)) {
      res.status(400).json({ error: { message: "Invalid alert ID" } })
      return
    }

    await acknowledgeGscAlert(pool, alertId)
    res.json({ success: true })
  } catch (error) {
    logger.error({ error }, "Failed to acknowledge alert")
    res.status(500).json({ error: { message: "Failed to acknowledge alert" } })
  }
})

// ============================================================================
// POST /admin/api/gsc/snapshot
// Trigger a manual snapshot of current GSC data into the database
// ============================================================================

router.post("/snapshot", async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!isGscConfigured()) {
      res.status(400).json({ error: { message: "GSC is not configured" } })
      return
    }

    const pool = getPool()
    const client = await pool.connect()
    const yesterday = daysAgo(1)
    const thirtyDaysAgo = daysAgo(30)

    // Fetch all data from GSC API before writing to DB
    const performance = await getSearchPerformanceOverTime(thirtyDaysAgo, yesterday)
    const queries = await getTopQueries(yesterday, yesterday, 100)
    const pages = await getTopPages(yesterday, yesterday, 100)
    const pageTypes = await getPerformanceByPageType(yesterday, yesterday)
    const sitemaps = await getSitemaps()

    try {
      await client.query("BEGIN")

      // Snapshot search performance (last 30 days)
      for (const row of performance.rows) {
        await client.query(
          `INSERT INTO gsc_search_performance (date, search_type, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, search_type)
           DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
          [row.keys[0], "web", row.clicks, row.impressions, row.ctr, row.position]
        )
      }

      // Snapshot top queries (for yesterday)
      for (const row of queries.rows) {
        await client.query(
          `INSERT INTO gsc_top_queries (date, query, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, query)
           DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
          [yesterday, row.keys[0], row.clicks, row.impressions, row.ctr, row.position]
        )
      }

      // Snapshot top pages (for yesterday) - derive page_type from URL
      for (const row of pages.rows) {
        const pageUrl = row.keys[0]
        let path: string
        try {
          path = new URL(pageUrl).pathname
        } catch {
          path = pageUrl
        }
        const pageType = categorizeUrl(path)

        await client.query(
          `INSERT INTO gsc_top_pages (date, page_url, page_type, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (date, page_url)
           DO UPDATE SET page_type = $3, clicks = $4, impressions = $5, ctr = $6, position = $7, fetched_at = now()`,
          [yesterday, pageUrl, pageType, row.clicks, row.impressions, row.ctr, row.position]
        )
      }

      // Snapshot page type performance (for yesterday)
      for (const [pageType, data] of Object.entries(pageTypes)) {
        await client.query(
          `INSERT INTO gsc_page_type_performance (date, page_type, clicks, impressions, ctr, position)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, page_type)
           DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
          [yesterday, pageType, data.clicks, data.impressions, data.ctr, data.position]
        )
      }

      // Snapshot indexing status from sitemaps
      let totalSubmitted = 0
      let totalIndexed = 0
      const indexDetails: Record<string, { submitted: number; indexed: number }> = {}

      for (const sitemap of sitemaps) {
        for (const content of sitemap.contents) {
          totalSubmitted += content.submitted
          totalIndexed += content.indexed
          if (!indexDetails[content.type]) {
            indexDetails[content.type] = { submitted: 0, indexed: 0 }
          }
          indexDetails[content.type].submitted += content.submitted
          indexDetails[content.type].indexed += content.indexed
        }
      }

      await client.query(
        `INSERT INTO gsc_indexing_status (date, total_submitted, total_indexed, index_details)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (date)
         DO UPDATE SET total_submitted = $2, total_indexed = $3, index_details = $4, fetched_at = now()`,
        [yesterday, totalSubmitted, totalIndexed, JSON.stringify(indexDetails)]
      )

      await client.query("COMMIT")

      res.json({
        success: true,
        snapshot: {
          performanceDays: performance.rows.length,
          queries: queries.rows.length,
          pages: pages.rows.length,
          pageTypes: Object.keys(pageTypes).length,
          indexing: { totalSubmitted, totalIndexed },
        },
      })
    } catch (txError) {
      await client.query("ROLLBACK")
      throw txError
    } finally {
      client.release()
    }
  } catch (error) {
    logger.error({ error }, "Failed to create GSC snapshot")
    res.status(500).json({ error: { message: "Failed to create snapshot" } })
  }
})

export default router
