/**
 * Database queries for admin cost analytics.
 *
 * Provides read-only access to cost and usage data across:
 * - Death source API queries (source_query_cache)
 * - AI helper usage (ai_helper_usage)
 * - Enrichment runs (enrichment_runs + enrichment_run_actors)
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface CostBySourceItem {
  source: string
  total_cost: number
  queries_count: number
  avg_cost_per_query: number
  last_used: string | null
}

export interface CostBySourceResult {
  sources: CostBySourceItem[]
  totalCost: number
  totalQueries: number
}

// ============================================================================
// Cost by Source Queries
// ============================================================================

/**
 * Get aggregated costs by death source with optional date filtering.
 */
export async function getCostBySource(
  pool: Pool,
  startDate?: string,
  endDate?: string
): Promise<CostBySourceResult> {
  const params: (string | undefined)[] = []
  let whereClause = ""

  if (startDate || endDate) {
    const conditions: string[] = []
    if (startDate) {
      params.push(startDate)
      conditions.push(`queried_at >= $${params.length}`)
    }
    if (endDate) {
      params.push(endDate)
      conditions.push(`queried_at <= $${params.length}`)
    }
    whereClause = `WHERE ${conditions.join(" AND ")}`
  }

  const query = `
    SELECT
      source_type as source,
      COALESCE(SUM(cost_usd), 0)::decimal(10,2) as total_cost,
      COUNT(*) as queries_count,
      COALESCE(AVG(cost_usd), 0)::decimal(10,6) as avg_cost_per_query,
      MAX(queried_at) as last_used
    FROM source_query_cache
    ${whereClause}
    GROUP BY source_type
    ORDER BY total_cost DESC
  `

  const result = await pool.query<{
    source: string
    total_cost: string
    queries_count: string
    avg_cost_per_query: string
    last_used: string | null
  }>(
    query,
    params.filter((p): p is string => p !== undefined)
  )

  const sources: CostBySourceItem[] = result.rows.map((row) => ({
    source: row.source,
    total_cost: parseFloat(row.total_cost),
    queries_count: parseInt(row.queries_count, 10),
    avg_cost_per_query: parseFloat(row.avg_cost_per_query),
    last_used: row.last_used,
  }))

  const totalCost = sources.reduce((sum, s) => sum + s.total_cost, 0)
  const totalQueries = sources.reduce((sum, s) => sum + s.queries_count, 0)

  return {
    sources,
    totalCost,
    totalQueries,
  }
}
