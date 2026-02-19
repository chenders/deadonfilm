/**
 * Database queries for admin bio enrichment monitoring.
 *
 * Provides read-only access to bio enrichment run data for the admin dashboard.
 * Pattern: server/src/lib/db/admin-enrichment-queries.ts
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface BioEnrichmentRunSummary {
  id: number
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  status: string
  actors_queried: number
  actors_processed: number
  actors_enriched: number
  actors_with_substantive_content: number
  fill_rate: string | null
  total_cost_usd: string
  source_cost_usd: string
  synthesis_cost_usd: string
  exit_reason: string | null
  error_count: number
}

export interface BioEnrichmentRunDetails extends BioEnrichmentRunSummary {
  cost_by_source: Record<string, number>
  source_hit_rates: Record<string, number>
  sources_attempted: string[]
  config: Record<string, unknown>
  errors: Array<{ actorId: number; actorName: string; error: string }>
  hostname: string | null
  script_name: string | null
  current_actor_index: number | null
  current_actor_name: string | null
}

export interface BioEnrichmentRunActor {
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  was_enriched: boolean
  has_substantive_content: boolean
  narrative_confidence: string | null
  sources_attempted: Array<{
    source: string
    success: boolean
    costUsd: number
    confidence: number
    reliabilityScore: number | null
  }>
  sources_succeeded: number
  synthesis_model: string | null
  processing_time_ms: number | null
  cost_usd: string
  source_cost_usd: string
  synthesis_cost_usd: string
  error: string | null
  log_entries: Array<{ timestamp: string; level: string; message: string }>
}

export interface BioSourcePerformanceStats {
  source: string
  total_attempts: number
  successful_attempts: number
  success_rate: number
  total_cost_usd: number
  average_cost_usd: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface BioEnrichmentRunFilters {
  startDate?: string
  endDate?: string
  minCost?: number
  maxCost?: number
  exitReason?: string
  status?: string
}

// ============================================================================
// Runs Queries
// ============================================================================

/**
 * Get paginated list of bio enrichment runs with optional filters.
 */
export async function getBioEnrichmentRuns(
  pool: Pool,
  page: number,
  pageSize: number,
  filters: BioEnrichmentRunFilters = {}
): Promise<PaginatedResult<BioEnrichmentRunSummary>> {
  const offset = (page - 1) * pageSize
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  if (filters.startDate) {
    conditions.push(`started_at >= $${paramIndex}`)
    params.push(filters.startDate)
    paramIndex++
  }

  if (filters.endDate) {
    conditions.push(`started_at <= $${paramIndex}`)
    params.push(filters.endDate)
    paramIndex++
  }

  if (filters.minCost !== undefined) {
    conditions.push(`total_cost_usd >= $${paramIndex}`)
    params.push(filters.minCost)
    paramIndex++
  }

  if (filters.maxCost !== undefined) {
    conditions.push(`total_cost_usd <= $${paramIndex}`)
    params.push(filters.maxCost)
    paramIndex++
  }

  if (filters.exitReason) {
    conditions.push(`exit_reason = $${paramIndex}`)
    params.push(filters.exitReason)
    paramIndex++
  }

  if (filters.status) {
    conditions.push(`status = $${paramIndex}`)
    params.push(filters.status)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Count total
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM bio_enrichment_runs ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].count, 10)

  // Fetch page
  const queryParams = [...params, pageSize, offset]
  const result = await pool.query<BioEnrichmentRunSummary>(
    `SELECT
      id, started_at, completed_at, duration_ms, status,
      actors_queried, actors_processed, actors_enriched,
      actors_with_substantive_content, fill_rate,
      total_cost_usd, source_cost_usd, synthesis_cost_usd,
      exit_reason, error_count
    FROM bio_enrichment_runs
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    queryParams
  )

  return {
    items: result.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get detailed info for a single bio enrichment run.
 */
export async function getBioEnrichmentRunDetails(
  pool: Pool,
  runId: number
): Promise<BioEnrichmentRunDetails | null> {
  const result = await pool.query<BioEnrichmentRunDetails>(
    `SELECT
      id, started_at, completed_at, duration_ms, status,
      actors_queried, actors_processed, actors_enriched,
      actors_with_substantive_content, fill_rate,
      total_cost_usd, source_cost_usd, synthesis_cost_usd,
      cost_by_source, source_hit_rates, sources_attempted,
      config, exit_reason, error_count, errors,
      hostname, script_name,
      current_actor_index, current_actor_name
    FROM bio_enrichment_runs
    WHERE id = $1`,
    [runId]
  )

  return result.rows[0] || null
}

/**
 * Get per-actor results for a bio enrichment run.
 */
export async function getBioEnrichmentRunActors(
  pool: Pool,
  runId: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<BioEnrichmentRunActor>> {
  const offset = (page - 1) * pageSize

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM bio_enrichment_run_actors WHERE run_id = $1`,
    [runId]
  )
  const total = parseInt(countResult.rows[0].count, 10)

  const result = await pool.query<BioEnrichmentRunActor>(
    `SELECT
      bra.actor_id,
      a.name as actor_name,
      a.tmdb_id as actor_tmdb_id,
      bra.was_enriched,
      bra.has_substantive_content,
      bra.narrative_confidence,
      bra.sources_attempted,
      bra.sources_succeeded,
      bra.synthesis_model,
      bra.processing_time_ms,
      bra.cost_usd,
      bra.source_cost_usd,
      bra.synthesis_cost_usd,
      bra.error,
      COALESCE(bra.log_entries, '[]'::jsonb) as log_entries
    FROM bio_enrichment_run_actors bra
    JOIN actors a ON a.id = bra.actor_id
    WHERE bra.run_id = $1
    ORDER BY bra.id ASC
    LIMIT $2 OFFSET $3`,
    [runId, pageSize, offset]
  )

  return {
    items: result.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get source performance stats for a bio enrichment run.
 * Unpacks the JSONB sources_attempted array from each actor row.
 */
export async function getBioRunSourcePerformanceStats(
  pool: Pool,
  runId: number
): Promise<BioSourcePerformanceStats[]> {
  const result = await pool.query<BioSourcePerformanceStats>(
    `SELECT
      s->>'source' as source,
      COUNT(*) as total_attempts,
      SUM(CASE WHEN (s->>'success')::boolean THEN 1 ELSE 0 END) as successful_attempts,
      CASE
        WHEN COUNT(*) > 0
        THEN ROUND(SUM(CASE WHEN (s->>'success')::boolean THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric * 100, 1)
        ELSE 0
      END as success_rate,
      ROUND(SUM(COALESCE((s->>'costUsd')::numeric, 0))::numeric, 6) as total_cost_usd,
      CASE
        WHEN COUNT(*) > 0
        THEN ROUND((SUM(COALESCE((s->>'costUsd')::numeric, 0)) / COUNT(*))::numeric, 6)
        ELSE 0
      END as average_cost_usd
    FROM bio_enrichment_run_actors bra,
    LATERAL jsonb_array_elements(bra.sources_attempted) AS s
    WHERE bra.run_id = $1
    GROUP BY s->>'source'
    ORDER BY total_attempts DESC`,
    [runId]
  )

  return result.rows
}
