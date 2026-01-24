/**
 * Admin cache management endpoints.
 *
 * Provides tools to monitor cache performance and warm cache with popular actors.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { getRedisClient, isRedisAvailable } from "../../lib/redis.js"
import { getCached, setCached, CACHE_KEYS } from "../../lib/cache.js"

const router = Router()

// ============================================================================
// GET /admin/api/cache/stats
// Get cache performance statistics
// ============================================================================

router.get("/stats", async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!isRedisAvailable()) {
      res.json({
        lastWarmed: null,
        actorsWarmed: 0,
        hitRate24h: 0,
        missRate24h: 0,
        totalKeys: 0,
      })
      return
    }

    const client = getRedisClient()
    if (!client) {
      res.status(503).json({ error: { message: "Redis not available" } })
      return
    }

    // Get last warmed timestamp from cache
    const lastWarmedKey = "cache:last_warmed"
    const lastWarmed = await getCached<string>(lastWarmedKey)

    // Get actors warmed count from cache
    const actorsWarmedKey = "cache:actors_warmed"
    const actorsWarmed = (await getCached<number>(actorsWarmedKey)) || 0

    // Get total keys count from Redis
    const dbSize = await client.dbsize()

    // Calculate hit/miss rate from New Relic or Redis INFO
    // For now, return placeholder data
    // In production, you'd query New Relic API or parse Redis INFO stats
    const hitRate24h = 0.85 // Placeholder: 85% hit rate
    const missRate24h = 0.15 // Placeholder: 15% miss rate

    res.json({
      lastWarmed,
      actorsWarmed,
      hitRate24h,
      missRate24h,
      totalKeys: dbSize,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch cache stats")
    res.status(500).json({ error: { message: "Failed to fetch cache stats" } })
  }
})

// ============================================================================
// POST /admin/api/cache/warm
// Warm cache with popular actors
// ============================================================================

interface WarmCacheRequest {
  limit: number
  deceasedOnly: boolean
  dryRun: boolean
}

router.post("/warm", async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit, deceasedOnly, dryRun } = req.body as WarmCacheRequest

    // Validate input
    if (!limit || limit < 1 || limit > 10000) {
      res.status(400).json({ error: { message: "Limit must be between 1 and 10000" } })
      return
    }

    if (!isRedisAvailable() && !dryRun) {
      res.status(503).json({ error: { message: "Redis not available" } })
      return
    }

    const pool = getPool()
    const startTime = Date.now()

    // Build query to get popular actors
    const deceasedFilter = deceasedOnly ? "WHERE a.deathday IS NOT NULL" : ""
    const query = `
      SELECT a.id, a.name, a.deathday, a.popularity
      FROM actors a
      ${deceasedFilter}
      ORDER BY a.popularity DESC NULLS LAST
      LIMIT $1
    `

    const actorsResult = await pool.query<{
      id: number
      name: string
      deathday: string | null
      popularity: number | null
    }>(query, [limit])

    let cached = 0
    let skipped = 0
    let errors = 0

    // Warm cache for each actor
    for (const actor of actorsResult.rows) {
      try {
        const profileKey = CACHE_KEYS.actor(actor.id).profile

        // Check if already cached
        const existing = await getCached(profileKey)
        if (existing) {
          skipped++
          continue
        }

        // Cache the actor profile
        if (!dryRun) {
          await setCached(profileKey, actor, 86400) // 24 hour TTL
        }
        cached++
      } catch (err) {
        logger.warn({ err, actorId: actor.id }, "Failed to cache actor")
        errors++
      }
    }

    const duration = Date.now() - startTime

    // Update last warmed timestamp and count (only if not dry run)
    if (!dryRun && isRedisAvailable()) {
      const lastWarmedKey = "cache:last_warmed"
      const actorsWarmedKey = "cache:actors_warmed"
      await setCached(lastWarmedKey, new Date().toISOString(), 86400 * 30) // Cache for 30 days
      await setCached(actorsWarmedKey, cached, 86400 * 30)
    }

    logger.info(
      { cached, skipped, errors, duration, dryRun },
      `Cache warming ${dryRun ? "preview" : "completed"}`
    )

    res.json({
      cached,
      skipped,
      errors,
      duration,
    })
  } catch (error) {
    logger.error({ error }, "Failed to warm cache")
    res.status(500).json({ error: { message: "Failed to warm cache" } })
  }
})

export default router
