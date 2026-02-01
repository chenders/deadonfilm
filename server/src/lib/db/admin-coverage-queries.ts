/**
 * Database queries for admin death detail coverage management.
 *
 * Provides queries for:
 * - Coverage statistics (actors with/without death pages)
 * - Actor filtering and pagination for coverage management
 * - Historical coverage trends from snapshots
 * - Enrichment candidate prioritization
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface CoverageStats {
  total_deceased_actors: number
  actors_with_death_pages: number
  actors_without_death_pages: number
  coverage_percentage: number
  enrichment_candidates_count: number
  high_priority_count: number
}

export interface ActorCoverageInfo {
  id: number
  name: string
  tmdb_id: number | null
  deathday: string | null
  popularity: number
  has_detailed_death_info: boolean
  enriched_at: string | null
  age_at_death: number | null
  cause_of_death: string | null
}

export interface CoverageTrendPoint {
  captured_at: string
  total_deceased_actors: number
  actors_with_death_pages: number
  actors_without_death_pages: number
  coverage_percentage: number
  enrichment_candidates_count: number
  high_priority_count: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ActorCoverageFilters {
  hasDeathPage?: boolean
  minPopularity?: number
  maxPopularity?: number
  deathDateStart?: string
  deathDateEnd?: string
  searchName?: string
  orderBy?: "death_date" | "popularity" | "name" | "enriched_at"
  orderDirection?: "asc" | "desc"
}

// ============================================================================
// Coverage Statistics
// ============================================================================

/**
 * Get real-time coverage statistics.
 */
export async function getCoverageStats(pool: Pool): Promise<CoverageStats> {
  const result = await pool.query<CoverageStats>(`
    WITH deceased_actors AS (
      SELECT
        COUNT(*) as total_deceased_actors,
        COUNT(*) FILTER (WHERE has_detailed_death_info = true) as actors_with_death_pages,
        COUNT(*) FILTER (WHERE has_detailed_death_info = false OR has_detailed_death_info IS NULL) as actors_without_death_pages
      FROM actors
      WHERE deathday IS NOT NULL
    ),
    enrichment_stats AS (
      SELECT
        COUNT(*) as enrichment_candidates_count,
        COUNT(*) FILTER (WHERE tmdb_popularity >= 10) as high_priority_count
      FROM actors
      WHERE deathday IS NOT NULL
        AND (has_detailed_death_info = false OR has_detailed_death_info IS NULL)
        AND (enriched_at IS NULL OR enriched_at < NOW() - INTERVAL '30 days')
    )
    SELECT
      da.total_deceased_actors,
      da.actors_with_death_pages,
      da.actors_without_death_pages,
      ROUND(
        CASE
          WHEN da.total_deceased_actors > 0
          THEN (da.actors_with_death_pages::numeric / da.total_deceased_actors::numeric) * 100
          ELSE 0
        END,
        2
      ) as coverage_percentage,
      es.enrichment_candidates_count,
      es.high_priority_count
    FROM deceased_actors da
    CROSS JOIN enrichment_stats es
  `)

  return result.rows[0]
}

/**
 * Get filtered, paginated list of actors for coverage management.
 */
export async function getActorsForCoverage(
  pool: Pool,
  filters: ActorCoverageFilters,
  page: number,
  pageSize: number
): Promise<PaginatedResult<ActorCoverageInfo>> {
  const offset = (page - 1) * pageSize

  // Build WHERE clauses
  const whereClauses: string[] = ["deathday IS NOT NULL"]
  const params: unknown[] = []
  let paramIndex = 1

  if (filters.hasDeathPage !== undefined) {
    if (filters.hasDeathPage) {
      // Has death page: look for explicit true
      whereClauses.push(`has_detailed_death_info = true`)
    } else {
      // Without death page: NULL or false (most are NULL)
      whereClauses.push(`(has_detailed_death_info IS NULL OR has_detailed_death_info = false)`)
    }
  }

  if (filters.minPopularity !== undefined) {
    whereClauses.push(`dof_popularity >= $${paramIndex++}`)
    params.push(filters.minPopularity)
  }

  if (filters.maxPopularity !== undefined) {
    whereClauses.push(`dof_popularity <= $${paramIndex++}`)
    params.push(filters.maxPopularity)
  }

  if (filters.deathDateStart) {
    whereClauses.push(`deathday >= $${paramIndex++}`)
    params.push(filters.deathDateStart)
  }

  if (filters.deathDateEnd) {
    whereClauses.push(`deathday <= $${paramIndex++}`)
    params.push(filters.deathDateEnd)
  }

  if (filters.searchName) {
    whereClauses.push(`name ILIKE $${paramIndex++}`)
    params.push(`%${filters.searchName}%`)
  }

  const whereClause = whereClauses.join(" AND ")

  // Build ORDER BY clause without string interpolation
  const orderBy = filters.orderBy || "popularity"
  const orderDirection = filters.orderDirection || "desc"

  // Map order direction to numeric values for CASE expression
  const isAsc = orderDirection === "asc" ? 1 : 0
  const isDesc = orderDirection === "desc" ? 1 : 0

  // Add order direction as parameters
  params.push(isAsc, isDesc)
  const ascParam = `$${paramIndex++}`
  const descParam = `$${paramIndex++}`

  // Build ORDER BY using CASE expressions instead of string interpolation
  let orderByClause: string
  switch (orderBy) {
    case "death_date":
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN deathday END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN deathday END DESC NULLS LAST`
      break
    case "name":
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN name END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN name END DESC NULLS LAST`
      break
    case "enriched_at":
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN enriched_at END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN enriched_at END DESC NULLS LAST`
      break
    case "popularity":
    default:
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN dof_popularity END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN dof_popularity END DESC NULLS LAST`
      break
  }

  // Use window function to get total count in same query (performance optimization)
  // Eliminates separate COUNT query - significant speedup for large tables
  // Cast popularity to float to ensure JavaScript number type (pg returns numeric as string)
  const dataResult = await pool.query<ActorCoverageInfo & { total_count: string }>(
    `SELECT
       id,
       name,
       tmdb_id,
       deathday,
       dof_popularity::float as popularity,
       has_detailed_death_info,
       enriched_at,
       age_at_death,
       cause_of_death,
       COUNT(*) OVER() as total_count
     FROM actors
     WHERE ${whereClause}
     ORDER BY ${orderByClause}, id ASC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, pageSize, offset]
  )

  const total = dataResult.rows.length > 0 ? parseInt(dataResult.rows[0].total_count, 10) : 0

  // Remove total_count from items
  const items = dataResult.rows.map(({ total_count: _total_count, ...item }) => item)

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get historical coverage trends from snapshots.
 */
export async function getCoverageTrends(
  pool: Pool,
  startDate: string,
  endDate: string,
  granularity: "daily" | "weekly" | "monthly" = "daily"
): Promise<CoverageTrendPoint[]> {
  // For daily granularity, return all snapshots in range
  if (granularity === "daily") {
    const result = await pool.query<CoverageTrendPoint>(
      `SELECT
         captured_at,
         total_deceased_actors,
         actors_with_death_pages,
         actors_without_death_pages,
         coverage_percentage,
         enrichment_candidates_count,
         high_priority_count
       FROM death_coverage_snapshots
       WHERE captured_at >= $1 AND captured_at <= $2
       ORDER BY captured_at ASC`,
      [startDate, endDate]
    )
    return result.rows
  }

  // For weekly/monthly, aggregate snapshots
  const dateFormat = granularity === "weekly" ? "YYYY-IW" : "YYYY-MM"

  const result = await pool.query<CoverageTrendPoint>(
    `SELECT
       MAX(captured_at) as captured_at,
       AVG(total_deceased_actors)::integer as total_deceased_actors,
       AVG(actors_with_death_pages)::integer as actors_with_death_pages,
       AVG(actors_without_death_pages)::integer as actors_without_death_pages,
       AVG(coverage_percentage)::numeric(5,2) as coverage_percentage,
       AVG(enrichment_candidates_count)::integer as enrichment_candidates_count,
       AVG(high_priority_count)::integer as high_priority_count
     FROM death_coverage_snapshots
     WHERE captured_at >= $1 AND captured_at <= $2
     GROUP BY TO_CHAR(captured_at, $3)
     ORDER BY MAX(captured_at) ASC`,
    [startDate, endDate, dateFormat]
  )

  return result.rows
}

/**
 * Get prioritized list of actors for enrichment.
 */
export async function getEnrichmentCandidates(
  pool: Pool,
  minPopularity: number = 5,
  limit: number = 100
): Promise<ActorCoverageInfo[]> {
  // Cast popularity to float to ensure JavaScript number type (pg returns numeric as string)
  const result = await pool.query<ActorCoverageInfo>(
    `SELECT
       id,
       name,
       tmdb_id,
       deathday,
       dof_popularity::float as popularity,
       has_detailed_death_info,
       enriched_at,
       age_at_death,
       cause_of_death
     FROM actors
     WHERE deathday IS NOT NULL
       AND (has_detailed_death_info = false OR has_detailed_death_info IS NULL)
       AND (enriched_at IS NULL OR enriched_at < NOW() - INTERVAL '30 days')
       AND dof_popularity >= $1
     ORDER BY dof_popularity DESC NULLS LAST, deathday DESC
     LIMIT $2`,
    [minPopularity, limit]
  )

  return result.rows
}

/**
 * Capture current coverage snapshot for historical tracking.
 * Called by daily cron job.
 */
export async function captureCurrentSnapshot(pool: Pool): Promise<void> {
  const stats = await getCoverageStats(pool)

  await pool.query(
    `INSERT INTO death_coverage_snapshots (
       captured_at,
       total_deceased_actors,
       actors_with_death_pages,
       actors_without_death_pages,
       coverage_percentage,
       enrichment_candidates_count,
       high_priority_count
     ) VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
    [
      stats.total_deceased_actors,
      stats.actors_with_death_pages,
      stats.actors_without_death_pages,
      stats.coverage_percentage,
      stats.enrichment_candidates_count,
      stats.high_priority_count,
    ]
  )
}
