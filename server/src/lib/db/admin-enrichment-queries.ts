/**
 * Database queries for admin enrichment monitoring.
 *
 * Provides read-only access to enrichment run data for the admin dashboard.
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface EnrichmentRunSummary {
  id: number
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  actors_queried: number
  actors_processed: number
  actors_enriched: number
  actors_with_death_page: number
  fill_rate: string | null
  total_cost_usd: string
  exit_reason: string | null
  error_count: number
}

export interface EnrichmentRunDetails extends EnrichmentRunSummary {
  cost_by_source: Record<string, number>
  source_hit_rates: Record<string, number>
  sources_attempted: string[]
  config: Record<string, unknown>
  links_followed: number
  pages_fetched: number
  ai_link_selections: number
  ai_content_extractions: number
  errors: Array<{ message: string; count: number }>
  script_name: string | null
  script_version: string | null
  hostname: string | null
}

export interface EnrichmentRunActor {
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  was_enriched: boolean
  created_death_page: boolean
  confidence: string | null
  sources_attempted: string[]
  winning_source: string | null
  processing_time_ms: number | null
  cost_usd: string
  links_followed: number
  pages_fetched: number
  error: string | null
}

export interface SourcePerformanceStats {
  source: string
  total_attempts: number
  successful_attempts: number
  success_rate: number
  total_cost_usd: number
  average_cost_usd: number
  total_processing_time_ms: number
  average_processing_time_ms: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface EnrichmentRunFilters {
  startDate?: string
  endDate?: string
  minCost?: number
  maxCost?: number
  exitReason?: string
  hasErrors?: boolean
}

// ============================================================================
// Enrichment Runs Queries
// ============================================================================

/**
 * Get paginated list of enrichment runs with optional filters.
 */
export async function getEnrichmentRuns(
  pool: Pool,
  page: number,
  pageSize: number,
  filters: EnrichmentRunFilters = {}
): Promise<PaginatedResult<EnrichmentRunSummary>> {
  const offset = (page - 1) * pageSize
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  // Apply filters
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

  if (filters.hasErrors !== undefined) {
    if (filters.hasErrors) {
      conditions.push("error_count > 0")
    } else {
      conditions.push("error_count = 0")
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM enrichment_runs ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const dataParams = [...params, pageSize, offset]
  const dataResult = await pool.query<EnrichmentRunSummary>(
    `
    SELECT
      id,
      started_at,
      completed_at,
      duration_ms,
      actors_queried,
      actors_processed,
      actors_enriched,
      actors_with_death_page,
      fill_rate::text,
      total_cost_usd::text,
      exit_reason,
      error_count
    FROM enrichment_runs
    ${whereClause}
    ORDER BY started_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `,
    dataParams
  )

  return {
    items: dataResult.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get detailed information about a single enrichment run.
 */
export async function getEnrichmentRunDetails(
  pool: Pool,
  runId: number
): Promise<EnrichmentRunDetails | null> {
  const result = await pool.query<EnrichmentRunDetails>(
    `
    SELECT
      id,
      started_at,
      completed_at,
      duration_ms,
      actors_queried,
      actors_processed,
      actors_enriched,
      actors_with_death_page,
      fill_rate::text,
      total_cost_usd::text,
      cost_by_source,
      source_hit_rates,
      sources_attempted,
      config,
      links_followed,
      pages_fetched,
      ai_link_selections,
      ai_content_extractions,
      error_count,
      errors,
      exit_reason,
      script_name,
      script_version,
      hostname
    FROM enrichment_runs
    WHERE id = $1
    `,
    [runId]
  )

  return result.rows[0] || null
}

/**
 * Get per-actor results for an enrichment run.
 */
export async function getEnrichmentRunActors(
  pool: Pool,
  runId: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<EnrichmentRunActor>> {
  const offset = (page - 1) * pageSize

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM enrichment_run_actors WHERE run_id = $1`,
    [runId]
  )
  const total = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const dataResult = await pool.query<EnrichmentRunActor>(
    `
    SELECT
      era.actor_id,
      a.name AS actor_name,
      a.tmdb_id AS actor_tmdb_id,
      era.was_enriched,
      era.created_death_page,
      era.confidence::text,
      era.sources_attempted,
      era.winning_source,
      era.processing_time_ms,
      era.cost_usd::text,
      era.links_followed,
      era.pages_fetched,
      era.error
    FROM enrichment_run_actors era
    JOIN actors a ON a.id = era.actor_id
    WHERE era.run_id = $1
    ORDER BY era.cost_usd DESC, era.processing_time_ms DESC
    LIMIT $2 OFFSET $3
    `,
    [runId, pageSize, offset]
  )

  return {
    items: dataResult.rows,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ============================================================================
// Source Performance Queries
// ============================================================================

/**
 * Get aggregated performance statistics for all death sources.
 * Analyzes data across all enrichment runs.
 */
export async function getSourcePerformanceStats(
  pool: Pool,
  startDate?: string,
  endDate?: string
): Promise<SourcePerformanceStats[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  if (startDate) {
    conditions.push(`era.created_at >= $${paramIndex}`)
    params.push(startDate)
    paramIndex++
  }

  if (endDate) {
    conditions.push(`era.created_at <= $${paramIndex}`)
    params.push(endDate)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // This query unnests the sources_attempted array and aggregates statistics
  const result = await pool.query<SourcePerformanceStats>(
    `
    WITH source_attempts AS (
      SELECT
        unnest(era.sources_attempted::text[]) AS source,
        era.winning_source,
        era.cost_usd,
        era.processing_time_ms
      FROM enrichment_run_actors era
      ${whereClause}
    )
    SELECT
      source,
      COUNT(*)::int AS total_attempts,
      COUNT(*) FILTER (WHERE source = winning_source)::int AS successful_attempts,
      ROUND(
        (COUNT(*) FILTER (WHERE source = winning_source)::decimal / COUNT(*)) * 100,
        2
      )::float AS success_rate,
      COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
      COALESCE(AVG(cost_usd), 0)::float AS average_cost_usd,
      COALESCE(SUM(processing_time_ms), 0)::bigint AS total_processing_time_ms,
      COALESCE(AVG(processing_time_ms), 0)::int AS average_processing_time_ms
    FROM source_attempts
    GROUP BY source
    ORDER BY total_attempts DESC, success_rate DESC
    `,
    params
  )

  return result.rows
}

/**
 * Get source performance statistics for a specific enrichment run.
 */
export async function getRunSourcePerformanceStats(
  pool: Pool,
  runId: number
): Promise<SourcePerformanceStats[]> {
  const result = await pool.query<SourcePerformanceStats>(
    `
    WITH source_attempts AS (
      SELECT
        unnest(era.sources_attempted::text[]) AS source,
        era.winning_source,
        era.cost_usd,
        era.processing_time_ms
      FROM enrichment_run_actors era
      WHERE era.run_id = $1
    )
    SELECT
      source,
      COUNT(*)::int AS total_attempts,
      COUNT(*) FILTER (WHERE source = winning_source)::int AS successful_attempts,
      ROUND(
        (COUNT(*) FILTER (WHERE source = winning_source)::decimal / COUNT(*)) * 100,
        2
      )::float AS success_rate,
      COALESCE(SUM(cost_usd), 0)::float AS total_cost_usd,
      COALESCE(AVG(cost_usd), 0)::float AS average_cost_usd,
      COALESCE(SUM(processing_time_ms), 0)::bigint AS total_processing_time_ms,
      COALESCE(AVG(processing_time_ms), 0)::int AS average_processing_time_ms
    FROM source_attempts
    GROUP BY source
    ORDER BY total_attempts DESC, success_rate DESC
    `,
    [runId]
  )

  return result.rows
}
