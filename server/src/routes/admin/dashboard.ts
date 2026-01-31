import { Request, Response } from "express"
import { getPool } from "../../lib/db/pool.js"
import { isRedisAvailable } from "../../lib/redis.js"
import { logger } from "../../lib/logger.js"
import { getDeathCacheMetadata, type DeathCacheMetadata } from "../../lib/cache.js"

interface DashboardStats {
  systemHealth: {
    database: boolean
    redis: boolean
  }
  actorStats: {
    totalActors: number
    deceasedActors: number
    enrichedActors: number
  }
  enrichmentStats: {
    totalRuns: number
    recentRunsCount: number
  }
  costStats: {
    totalCost: number
    lastMonthCost: number
  }
  deathCacheStatus: DeathCacheMetadata | null
}

/**
 * GET /admin/api/dashboard/stats
 * Get dashboard overview statistics
 */
export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const pool = getPool()

    // System health
    const systemHealth = {
      database: true, // If we're here, DB is connected
      redis: isRedisAvailable(),
    }

    // Actor statistics
    const actorStatsResult = await pool.query<{
      total_actors: string
      deceased_actors: string
      enriched_actors: string
    }>(`
      SELECT
        COUNT(*)::text AS total_actors,
        COUNT(*) FILTER (WHERE deathday IS NOT NULL)::text AS deceased_actors,
        COUNT(*) FILTER (WHERE cause_of_death IS NOT NULL)::text AS enriched_actors
      FROM actors
    `)

    const actorStats = {
      totalActors: parseInt(actorStatsResult.rows[0].total_actors, 10),
      deceasedActors: parseInt(actorStatsResult.rows[0].deceased_actors, 10),
      enrichedActors: parseInt(actorStatsResult.rows[0].enriched_actors, 10),
    }

    // Enrichment run statistics
    // Note: enrichment_runs table may not exist yet (Stage 2), so we'll handle gracefully
    let enrichmentStats = {
      totalRuns: 0,
      recentRunsCount: 0,
    }

    try {
      const enrichmentStatsResult = await pool.query<{
        total_runs: string
        recent_runs: string
      }>(`
        SELECT
          COUNT(*)::text AS total_runs,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::text AS recent_runs
        FROM enrichment_runs
      `)

      enrichmentStats = {
        totalRuns: parseInt(enrichmentStatsResult.rows[0].total_runs, 10),
        recentRunsCount: parseInt(enrichmentStatsResult.rows[0].recent_runs, 10),
      }
    } catch {
      // Table doesn't exist yet - that's fine for Stage 1
      logger.debug("enrichment_runs table not found (expected in Stage 1)")
    }

    // Cost statistics
    // Note: death_sources_usage table may not exist yet, so we'll handle gracefully
    let costStats = {
      totalCost: 0,
      lastMonthCost: 0,
    }

    try {
      const costStatsResult = await pool.query<{
        total_cost: string
        last_month_cost: string
      }>(`
        SELECT
          COALESCE(SUM(cost), 0)::text AS total_cost,
          COALESCE(SUM(cost) FILTER (WHERE queried_at > NOW() - INTERVAL '30 days'), 0)::text AS last_month_cost
        FROM death_sources_usage
      `)

      costStats = {
        totalCost: parseFloat(costStatsResult.rows[0].total_cost),
        lastMonthCost: parseFloat(costStatsResult.rows[0].last_month_cost),
      }
    } catch {
      // Table doesn't exist yet - that's fine
      logger.debug("death_sources_usage table not found")
    }

    // Get death cache metadata
    const deathCacheStatus = await getDeathCacheMetadata()

    const stats: DashboardStats = {
      systemHealth,
      actorStats,
      enrichmentStats,
      costStats,
      deathCacheStatus,
    }

    res.json(stats)
  } catch (error) {
    logger.error({ error }, "Failed to fetch dashboard stats")
    res.status(500).json({ error: { message: "Failed to fetch dashboard stats" } })
  }
}
