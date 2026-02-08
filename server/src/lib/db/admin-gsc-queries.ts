/**
 * Database queries for Google Search Console snapshot data.
 *
 * Stores and retrieves historical GSC data for trend analysis
 * beyond GSC's native 16-month retention window.
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface SearchPerformanceSnapshot {
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface TopQuerySnapshot {
  date: string
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface TopPageSnapshot {
  date: string
  page_url: string
  page_type: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface PageTypePerformanceSnapshot {
  date: string
  page_type: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface IndexingStatusSnapshot {
  date: string
  total_submitted: number
  total_indexed: number
  index_details: Record<string, { submitted: number; indexed: number }>
}

export interface GscAlert {
  id: number
  alert_type: string
  severity: string
  message: string
  details: Record<string, unknown>
  acknowledged: boolean
  acknowledged_at: string | null
  created_at: string
}

// ============================================================================
// Search Performance
// ============================================================================

export async function upsertSearchPerformance(
  pool: Pool,
  data: Omit<SearchPerformanceSnapshot, "fetched_at"> & { search_type?: string }
): Promise<void> {
  await pool.query(
    `INSERT INTO gsc_search_performance (date, search_type, clicks, impressions, ctr, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (date, search_type)
     DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
    [data.date, data.search_type || "web", data.clicks, data.impressions, data.ctr, data.position]
  )
}

export async function getSearchPerformanceHistory(
  pool: Pool,
  startDate: string,
  endDate: string,
  searchType = "web"
): Promise<SearchPerformanceSnapshot[]> {
  const result = await pool.query<SearchPerformanceSnapshot>(
    `SELECT date::text, clicks, impressions, ctr::numeric as ctr, position::numeric as position
     FROM gsc_search_performance
     WHERE date >= $1 AND date <= $2 AND search_type = $3
     ORDER BY date ASC`,
    [startDate, endDate, searchType]
  )
  return result.rows.map((row) => ({
    ...row,
    ctr: Number(row.ctr),
    position: Number(row.position),
  }))
}

// ============================================================================
// Top Queries
// ============================================================================

export async function upsertTopQuery(
  pool: Pool,
  data: Omit<TopQuerySnapshot, "fetched_at">
): Promise<void> {
  await pool.query(
    `INSERT INTO gsc_top_queries (date, query, clicks, impressions, ctr, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (date, query)
     DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
    [data.date, data.query, data.clicks, data.impressions, data.ctr, data.position]
  )
}

export async function getTopQueriesHistory(
  pool: Pool,
  startDate: string,
  endDate: string,
  limit = 50
): Promise<TopQuerySnapshot[]> {
  const result = await pool.query<TopQuerySnapshot>(
    `SELECT query,
            SUM(clicks)::integer as clicks,
            SUM(impressions)::integer as impressions,
            CASE WHEN SUM(impressions) > 0
              THEN (SUM(clicks)::numeric / SUM(impressions))
              ELSE 0
            END as ctr,
            CASE WHEN SUM(impressions) > 0
              THEN SUM(position::numeric * impressions) / SUM(impressions)
              ELSE 0
            END as position,
            MIN(date)::text as date
     FROM gsc_top_queries
     WHERE date >= $1 AND date <= $2
     GROUP BY query
     ORDER BY clicks DESC
     LIMIT $3`,
    [startDate, endDate, limit]
  )
  return result.rows.map((row) => ({
    ...row,
    ctr: Number(row.ctr),
    position: Number(row.position),
  }))
}

// ============================================================================
// Top Pages
// ============================================================================

export async function upsertTopPage(
  pool: Pool,
  data: Omit<TopPageSnapshot, "fetched_at">
): Promise<void> {
  await pool.query(
    `INSERT INTO gsc_top_pages (date, page_url, page_type, clicks, impressions, ctr, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (date, page_url)
     DO UPDATE SET page_type = $3, clicks = $4, impressions = $5, ctr = $6, position = $7, fetched_at = now()`,
    [
      data.date,
      data.page_url,
      data.page_type,
      data.clicks,
      data.impressions,
      data.ctr,
      data.position,
    ]
  )
}

export async function getTopPagesHistory(
  pool: Pool,
  startDate: string,
  endDate: string,
  limit = 50
): Promise<TopPageSnapshot[]> {
  const result = await pool.query<TopPageSnapshot>(
    `SELECT page_url,
            page_type,
            SUM(clicks)::integer as clicks,
            SUM(impressions)::integer as impressions,
            CASE WHEN SUM(impressions) > 0
              THEN (SUM(clicks)::numeric / SUM(impressions))
              ELSE 0
            END as ctr,
            CASE WHEN SUM(impressions) > 0
              THEN SUM(position::numeric * impressions) / SUM(impressions)
              ELSE 0
            END as position,
            MIN(date)::text as date
     FROM gsc_top_pages
     WHERE date >= $1 AND date <= $2
     GROUP BY page_url, page_type
     ORDER BY clicks DESC
     LIMIT $3`,
    [startDate, endDate, limit]
  )
  return result.rows.map((row) => ({
    ...row,
    ctr: Number(row.ctr),
    position: Number(row.position),
  }))
}

// ============================================================================
// Page Type Performance
// ============================================================================

export async function upsertPageTypePerformance(
  pool: Pool,
  data: Omit<PageTypePerformanceSnapshot, "fetched_at">
): Promise<void> {
  await pool.query(
    `INSERT INTO gsc_page_type_performance (date, page_type, clicks, impressions, ctr, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (date, page_type)
     DO UPDATE SET clicks = $3, impressions = $4, ctr = $5, position = $6, fetched_at = now()`,
    [data.date, data.page_type, data.clicks, data.impressions, data.ctr, data.position]
  )
}

export async function getPageTypePerformanceHistory(
  pool: Pool,
  startDate: string,
  endDate: string
): Promise<PageTypePerformanceSnapshot[]> {
  const result = await pool.query<PageTypePerformanceSnapshot>(
    `SELECT page_type,
            SUM(clicks)::integer as clicks,
            SUM(impressions)::integer as impressions,
            CASE WHEN SUM(impressions) > 0
              THEN (SUM(clicks)::numeric / SUM(impressions))
              ELSE 0
            END as ctr,
            CASE WHEN SUM(impressions) > 0
              THEN SUM(position::numeric * impressions) / SUM(impressions)
              ELSE 0
            END as position,
            MIN(date)::text as date
     FROM gsc_page_type_performance
     WHERE date >= $1 AND date <= $2
     GROUP BY page_type
     ORDER BY impressions DESC`,
    [startDate, endDate]
  )
  return result.rows.map((row) => ({
    ...row,
    ctr: Number(row.ctr),
    position: Number(row.position),
  }))
}

// ============================================================================
// Indexing Status
// ============================================================================

export async function upsertIndexingStatus(
  pool: Pool,
  data: Omit<IndexingStatusSnapshot, "fetched_at">
): Promise<void> {
  await pool.query(
    `INSERT INTO gsc_indexing_status (date, total_submitted, total_indexed, index_details)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (date)
     DO UPDATE SET total_submitted = $2, total_indexed = $3, index_details = $4, fetched_at = now()`,
    [data.date, data.total_submitted, data.total_indexed, JSON.stringify(data.index_details)]
  )
}

export async function getIndexingStatusHistory(
  pool: Pool,
  startDate: string,
  endDate: string
): Promise<IndexingStatusSnapshot[]> {
  const result = await pool.query<IndexingStatusSnapshot>(
    `SELECT date::text, total_submitted, total_indexed, index_details
     FROM gsc_indexing_status
     WHERE date >= $1 AND date <= $2
     ORDER BY date ASC`,
    [startDate, endDate]
  )
  return result.rows
}

// ============================================================================
// Alerts
// ============================================================================

export async function createGscAlert(
  pool: Pool,
  data: Pick<GscAlert, "alert_type" | "severity" | "message" | "details">
): Promise<GscAlert> {
  const result = await pool.query<GscAlert>(
    `INSERT INTO gsc_alerts (alert_type, severity, message, details)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.alert_type, data.severity, data.message, JSON.stringify(data.details)]
  )
  return result.rows[0]
}

export async function getGscAlerts(
  pool: Pool,
  options: { acknowledged?: boolean; limit?: number } = {}
): Promise<GscAlert[]> {
  const { acknowledged, limit = 50 } = options
  const params: unknown[] = [limit]
  let whereClause = ""

  if (acknowledged !== undefined) {
    params.push(acknowledged)
    whereClause = `WHERE acknowledged = $${params.length}`
  }

  const result = await pool.query<GscAlert>(
    `SELECT id, alert_type, severity, message, details,
            acknowledged, acknowledged_at, created_at
     FROM gsc_alerts
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $1`,
    params
  )
  return result.rows
}

export async function acknowledgeGscAlert(pool: Pool, alertId: number): Promise<void> {
  await pool.query(
    `UPDATE gsc_alerts SET acknowledged = true, acknowledged_at = now() WHERE id = $1`,
    [alertId]
  )
}
