/**
 * Admin actor management endpoints.
 *
 * Provides diagnostic and management tools for actors.
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"
import { getCached, CACHE_KEYS } from "../../lib/cache.js"
import { createActorSlug } from "../../lib/slug-utils.js"

const router = Router()

// ============================================================================
// GET /admin/api/actors/:id/diagnostic
// Get comprehensive diagnostic information for an actor
// ============================================================================

router.get("/:id/diagnostic", async (req: Request, res: Response): Promise<void> => {
  try {
    const pool = getPool()
    const idParam = parseInt(req.params.id, 10)

    if (isNaN(idParam)) {
      res.status(400).json({ error: { message: "Invalid actor ID" } })
      return
    }

    // Try to find actor by EITHER id or tmdb_id
    const actorResult = await pool.query<{
      id: number
      tmdb_id: number | null
      name: string
      deathday: string | null
      popularity: number | null
    }>(
      `SELECT id, tmdb_id, name, deathday, popularity::float
       FROM actors
       WHERE id = $1 OR tmdb_id = $1
       LIMIT 2`,
      [idParam]
    )

    if (actorResult.rows.length === 0) {
      res.status(404).json({ error: { message: "Actor not found" } })
      return
    }

    // If multiple matches, prefer internal id match
    let actor = actorResult.rows[0]
    if (actorResult.rows.length === 2) {
      actor = actorResult.rows.find((a) => a.id === idParam) || actorResult.rows[0]
    }

    // Check for ID conflicts (another actor with tmdb_id = this actor's id, or vice versa)
    let idConflict: {
      hasConflict: boolean
      conflictingActor?: { id: number; name: string; popularity: number | null }
    } = { hasConflict: false }
    if (actorResult.rows.length === 2) {
      const conflicting = actorResult.rows.find((a) => a.id !== actor.id)
      if (conflicting) {
        idConflict = {
          hasConflict: true,
          conflictingActor: {
            id: conflicting.id,
            name: conflicting.name,
            popularity: conflicting.popularity,
          },
        }
      }
    }

    // Generate URLs
    const canonicalSlug = createActorSlug(actor.name, actor.id)
    const urls = {
      canonical: `/actor/${canonicalSlug}`,
      legacy:
        actor.tmdb_id && actor.tmdb_id !== actor.id
          ? `/actor/${createActorSlug(actor.name, actor.tmdb_id)}`
          : null,
    }

    // Check cache status
    const profileCacheKey = CACHE_KEYS.actor(actor.id).profile
    const deathCacheKey = CACHE_KEYS.actor(actor.id).death

    const [profileCached, deathCached] = await Promise.all([
      getCached(profileCacheKey),
      getCached(deathCacheKey),
    ])

    // TODO: Get TTL from Redis if cached
    // For now, just return whether it's cached
    const cache = {
      profile: {
        cached: !!profileCached,
        ttl: profileCached ? 86400 : null, // Placeholder - would need PTTL from Redis
      },
      death: {
        cached: !!deathCached,
        ttl: deathCached ? 86400 : null, // Placeholder
      },
    }

    // Get redirect statistics from page_visits table
    // This requires page_visits to track actor URLs
    // For now, return placeholder data
    const redirectStats: {
      last7Days: number
      last30Days: number
      topReferer: string | null
    } = {
      last7Days: 0,
      last30Days: 0,
      topReferer: null,
    }

    // If we have page_visits tracking, query it:
    try {
      const redirectQuery = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int as count
         FROM page_visits
         WHERE visited_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND is_internal_referral = true
           AND referrer_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND referrer_path != visited_path
           AND visited_at >= NOW() - INTERVAL '7 days'
           AND (
             visited_path LIKE '%' || $1 || '%'
             OR referrer_path LIKE '%' || $1 || '%'
           )`,
        [actor.id]
      )

      if (redirectQuery.rows.length > 0) {
        redirectStats.last7Days = redirectQuery.rows[0].count
      }

      const redirect30Query = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int as count
         FROM page_visits
         WHERE visited_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND is_internal_referral = true
           AND referrer_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND referrer_path != visited_path
           AND visited_at >= NOW() - INTERVAL '30 days'
           AND (
             visited_path LIKE '%' || $1 || '%'
             OR referrer_path LIKE '%' || $1 || '%'
           )`,
        [actor.id]
      )

      if (redirect30Query.rows.length > 0) {
        redirectStats.last30Days = redirect30Query.rows[0].count
      }

      // Get top referer
      const topRefererQuery = await pool.query<{ referer: string }>(
        `SELECT
           CASE
             WHEN referrer_path LIKE '%google%' THEN 'google.com'
             WHEN referrer_path LIKE '%bing%' THEN 'bing.com'
             WHEN referrer_path LIKE '%facebook%' THEN 'facebook.com'
             WHEN referrer_path LIKE '%twitter%' THEN 'twitter.com'
             ELSE 'other'
           END as referer
         FROM page_visits
         WHERE visited_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND is_internal_referral = true
           AND referrer_path ~ '/actor/[a-z0-9-]+-\\d+/?$'
           AND referrer_path != visited_path
           AND visited_at >= NOW() - INTERVAL '30 days'
           AND visited_path LIKE '%' || $1 || '%'
         GROUP BY referer
         ORDER BY COUNT(*) DESC
         LIMIT 1`,
        [actor.id]
      )

      if (topRefererQuery.rows.length > 0) {
        redirectStats.topReferer = topRefererQuery.rows[0].referer
      }
    } catch (redirectError) {
      // page_visits might not have required columns yet, ignore error
      logger.warn({ redirectError }, "Could not fetch redirect stats")
    }

    res.json({
      actor: {
        id: actor.id,
        tmdbId: actor.tmdb_id,
        name: actor.name,
        deathday: actor.deathday,
        popularity: actor.popularity,
      },
      idConflict,
      urls,
      cache,
      redirectStats,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch actor diagnostic data")
    res.status(500).json({ error: { message: "Failed to fetch actor diagnostic data" } })
  }
})

export default router
