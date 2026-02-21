/**
 * Admin endpoints for viewing rejected notable factors.
 *
 * Rejected factors are tags suggested by Claude during enrichment
 * that aren't in the valid sets (VALID_LIFE_NOTABLE_FACTORS / VALID_NOTABLE_FACTORS).
 */

import { Request, Response, Router } from "express"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

const router = Router()

// ============================================================================
// GET /admin/api/rejected-factors
// Get aggregated rejected factors with occurrence counts and recent actors
// ============================================================================

interface RejectedFactorsQuery {
  page?: string
  pageSize?: string
  type?: "life" | "death"
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = "1", pageSize = "50", type } = req.query as RejectedFactorsQuery
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50))
    const offset = (pageNum - 1) * limit

    const pool = getPool()

    // Build WHERE clause for optional type filter
    const conditions: string[] = []
    const countParams: string[] = []
    const queryParams: (string | number)[] = []

    if (type && (type === "life" || type === "death")) {
      conditions.push(`factor_type = $1`)
      countParams.push(type)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    // Get total count of distinct factor_name + factor_type combinations
    const countResult = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int as count FROM (
        SELECT DISTINCT factor_name, factor_type
        FROM rejected_notable_factors
        ${whereClause}
      ) sub`,
      countParams
    )
    const total = countResult.rows[0]?.count ?? 0

    // Build query params for the main query
    let paramIdx = 1
    if (type && (type === "life" || type === "death")) {
      queryParams.push(type)
      paramIdx++
    }
    queryParams.push(limit)
    const limitParam = paramIdx++
    queryParams.push(offset)
    const offsetParam = paramIdx

    // Get aggregated factors with occurrence counts and recent actors
    const result = await pool.query<{
      factor_name: string
      factor_type: string
      occurrence_count: number
      last_seen: string
      recent_actors: string
    }>(
      `SELECT
        factor_name,
        factor_type,
        COUNT(*)::int as occurrence_count,
        MAX(created_at) as last_seen,
        (
          SELECT json_agg(sub)
          FROM (
            SELECT DISTINCT ON (actor_id) actor_id as id, actor_name as name
            FROM rejected_notable_factors r2
            WHERE r2.factor_name = r.factor_name AND r2.factor_type = r.factor_type
            ORDER BY actor_id, created_at DESC
            LIMIT 5
          ) sub
        ) as recent_actors
      FROM rejected_notable_factors r
      ${whereClause}
      GROUP BY factor_name, factor_type
      ORDER BY COUNT(*) DESC, MAX(created_at) DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
      queryParams
    )

    res.json({
      items: result.rows.map((row) => ({
        factorName: row.factor_name,
        factorType: row.factor_type,
        occurrenceCount: row.occurrence_count,
        lastSeen: row.last_seen,
        recentActors: row.recent_actors ?? [],
      })),
      total,
      page: pageNum,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch rejected factors")
    res.status(500).json({ error: { message: "Failed to fetch rejected factors" } })
  }
})

export default router
