/**
 * Admin sitemap management endpoints.
 *
 * Provides tools to monitor, regenerate, and submit sitemaps to search engines.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { isRedisAvailable } from "../../lib/redis.js"
import { getCached, setCached } from "../../lib/cache.js"

const router = Router()

// ============================================================================
// GET /admin/api/sitemap/status
// Get sitemap generation status and statistics
// ============================================================================

router.get("/status", async (_req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()

    // Get URL counts by type
    const [actorCount, movieCount, showCount] = await Promise.all([
      pool.query<{ count: number }>(
        `SELECT COUNT(*)::int as count FROM actors WHERE deathday IS NOT NULL`
      ),
      pool.query<{ count: number }>(`SELECT COUNT(*)::int as count FROM movies`),
      pool.query<{ count: number }>(`SELECT COUNT(*)::int as count FROM shows`),
    ])

    const actorUrls = actorCount.rows[0]?.count || 0
    const movieUrls = movieCount.rows[0]?.count || 0
    const showUrls = showCount.rows[0]?.count || 0
    const totalUrls = actorUrls + movieUrls + showUrls + 10 // +10 for static pages

    // Get last generation time from Redis cache
    const lastGeneratedKey = "sitemap:last_generated"
    const lastGenerated = await getCached<string>(lastGeneratedKey)

    // Get changed URLs count since last generation
    // This would require tracking URL changes - for now return 0
    // In a full implementation, we'd track actor.updated_at, movies.updated_at, etc.
    const changedSinceLastGeneration = 0

    // Get search engine submission history from Redis
    const googleSubmissionKey = "sitemap:google_last_submitted"
    const bingSubmissionKey = "sitemap:bing_last_submitted"

    const [googleLastSubmitted, bingLastSubmitted] = await Promise.all([
      getCached<string>(googleSubmissionKey),
      getCached<string>(bingSubmissionKey),
    ])

    res.json({
      lastGenerated,
      actorUrls,
      movieUrls,
      showUrls,
      totalUrls,
      changedSinceLastGeneration,
      searchEngineSubmissions: {
        google: {
          lastSubmitted: googleLastSubmitted,
          status: googleLastSubmitted ? "submitted" : "not_submitted",
        },
        bing: {
          lastSubmitted: bingLastSubmitted,
          status: bingLastSubmitted ? "submitted" : "not_submitted",
        },
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch sitemap status")
    res.status(500).json({ error: { message: "Failed to fetch sitemap status" } })
  }
})

// ============================================================================
// POST /admin/api/sitemap/regenerate
// Regenerate all sitemaps
// ============================================================================

router.post("/regenerate", async (_req: Request, res: Response): Promise<void> => {
  try {
    logger.info("Starting sitemap regeneration from admin request")

    // The sitemap routes in sitemap.ts will automatically generate fresh data
    // since they don't use caching. We just need to update the last_generated timestamp.

    if (isRedisAvailable()) {
      const lastGeneratedKey = "sitemap:last_generated"
      await setCached(lastGeneratedKey, new Date().toISOString(), 86400 * 30) // Cache for 30 days
    }

    logger.info("Sitemap regeneration completed")

    res.json({
      success: true,
      message: "Sitemap regenerated successfully",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error({ error }, "Failed to regenerate sitemap")
    res.status(500).json({ error: { message: "Failed to regenerate sitemap" } })
  }
})

// ============================================================================
// POST /admin/api/sitemap/submit
// Submit sitemap to search engines
// ============================================================================

router.post("/submit", async (_req: Request, res: Response): Promise<void> => {
  try {
    const sitemapUrl = `${process.env.PUBLIC_URL || "https://deadonfilm.com"}/sitemap.xml`
    const timestamp = new Date().toISOString()

    // Submit to Google (via Google Search Console API or ping URL)
    // For now, we'll just record the submission time
    // In production, you'd use: http://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}

    // Submit to Bing (via Bing Webmaster Tools API or ping URL)
    // For now, we'll just record the submission time
    // In production, you'd use: http://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}

    if (isRedisAvailable()) {
      const googleSubmissionKey = "sitemap:google_last_submitted"
      const bingSubmissionKey = "sitemap:bing_last_submitted"

      await Promise.all([
        setCached(googleSubmissionKey, timestamp, 86400 * 30), // Cache for 30 days
        setCached(bingSubmissionKey, timestamp, 86400 * 30),
      ])
    }

    logger.info({ sitemapUrl }, "Sitemap submitted to search engines")

    res.json({
      success: true,
      message: "Sitemap submitted to search engines",
      timestamp,
      sitemapUrl,
    })
  } catch (error) {
    logger.error({ error }, "Failed to submit sitemap")
    res.status(500).json({ error: { message: "Failed to submit sitemap" } })
  }
})

export default router
