/**
 * Database queries for admin page visit analytics.
 *
 * Provides read-only access to page visit tracking data for understanding
 * internal navigation patterns and user behavior.
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface TimeSeriesPoint {
  timestamp: string
  count: number
}

export interface NavigationPath {
  referrer_path: string
  visited_path: string
  count: number
  percentage: number
}

export interface PopularPage {
  path: string
  internal_referrals: number
  external_referrals: number
  direct_visits: number
  total_visits: number
}

export interface HourlyPattern {
  hour: number
  count: number
}

export interface EntryExitPage {
  path: string
  count: number
  percentage: number
}

export interface PageVisitStats {
  total_visits: number
  internal_referrals: number
  external_referrals: number
  direct_visits: number
  unique_sessions: number
  avg_pages_per_session: number
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get internal referrals over time as a time series.
 * Supports different time granularities (hour, day, week).
 */
export async function getInternalReferralsOverTime(
  pool: Pool,
  startDate?: string,
  endDate?: string,
  granularity: "hour" | "day" | "week" = "day"
): Promise<TimeSeriesPoint[]> {
  const params: (string | undefined)[] = []
  const conditions: string[] = ["is_internal_referral = true"]

  if (startDate) {
    params.push(startDate)
    conditions.push(`visited_at >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    // Treat endDate as an inclusive calendar date by comparing to the start of the next day
    conditions.push(`visited_at < ($${params.length}::date + interval '1 day')`)
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`

  // Determine time truncation based on granularity
  let truncateExpression: string
  switch (granularity) {
    case "hour":
      truncateExpression = "date_trunc('hour', visited_at)"
      break
    case "week":
      truncateExpression = "date_trunc('week', visited_at)"
      break
    case "day":
    default:
      truncateExpression = "date_trunc('day', visited_at)"
      break
  }

  const query = `
    SELECT
      ${truncateExpression} as timestamp,
      COUNT(*) as count
    FROM page_visits
    ${whereClause}
    GROUP BY timestamp
    ORDER BY timestamp ASC
  `

  const result = await pool.query<{ timestamp: Date; count: string }>(
    query,
    params.filter((p): p is string => p !== undefined)
  )

  return result.rows.map((row) => ({
    timestamp: row.timestamp.toISOString(),
    count: parseInt(row.count, 10),
  }))
}

/**
 * Get the most common navigation paths (referrer → visited).
 * Only includes internal referrals.
 */
export async function getTopNavigationPaths(
  pool: Pool,
  startDate?: string,
  endDate?: string,
  limit: number = 20
): Promise<NavigationPath[]> {
  const params: (string | undefined)[] = []
  const conditions: string[] = ["is_internal_referral = true"]

  if (startDate) {
    params.push(startDate)
    conditions.push(`visited_at >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    conditions.push(`visited_at < ($${params.length}::date + interval '1 day')`)
  }

  params.push(limit.toString())
  const limitClause = `LIMIT $${params.length}`

  const whereClause = `WHERE ${conditions.join(" AND ")}`

  const query = `
    WITH path_counts AS (
      SELECT
        referrer_path,
        visited_path,
        COUNT(*) as count
      FROM page_visits
      ${whereClause}
      GROUP BY referrer_path, visited_path
    ),
    total_count AS (
      SELECT SUM(count) as total FROM path_counts
    )
    SELECT
      pc.referrer_path,
      pc.visited_path,
      pc.count,
      ROUND((pc.count::decimal / tc.total * 100), 2) as percentage
    FROM path_counts pc
    CROSS JOIN total_count tc
    ORDER BY pc.count DESC
    ${limitClause}
  `

  const result = await pool.query<{
    referrer_path: string
    visited_path: string
    count: string
    percentage: string
  }>(
    query,
    params.filter((p): p is string => p !== undefined)
  )

  return result.rows.map((row) => ({
    referrer_path: row.referrer_path,
    visited_path: row.visited_path,
    count: parseInt(row.count, 10),
    percentage: parseFloat(row.percentage),
  }))
}

/**
 * Get the most popular pages by internal referrals.
 * Shows breakdown of internal vs external vs direct traffic.
 */
export async function getMostPopularPagesByInternalReferrals(
  pool: Pool,
  startDate?: string,
  endDate?: string,
  limit: number = 20
): Promise<PopularPage[]> {
  const params: (string | undefined)[] = []
  const conditions: string[] = []

  if (startDate) {
    params.push(startDate)
    conditions.push(`visited_at >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    conditions.push(`visited_at < ($${params.length}::date + interval '1 day')`)
  }

  params.push(limit.toString())
  const limitClause = `LIMIT $${params.length}`

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const query = `
    SELECT
      visited_path as path,
      COUNT(*) FILTER (WHERE is_internal_referral = true AND referrer_path IS NOT NULL) as internal_referrals,
      COUNT(*) FILTER (WHERE is_internal_referral = false AND referrer_path IS NOT NULL) as external_referrals,
      COUNT(*) FILTER (WHERE referrer_path IS NULL) as direct_visits,
      COUNT(*) as total_visits
    FROM page_visits
    ${whereClause}
    GROUP BY visited_path
    ORDER BY internal_referrals DESC
    ${limitClause}
  `

  const result = await pool.query<{
    path: string
    internal_referrals: string
    external_referrals: string
    direct_visits: string
    total_visits: string
  }>(
    query,
    params.filter((p): p is string => p !== undefined)
  )

  return result.rows.map((row) => ({
    path: row.path,
    internal_referrals: parseInt(row.internal_referrals, 10),
    external_referrals: parseInt(row.external_referrals, 10),
    direct_visits: parseInt(row.direct_visits, 10),
    total_visits: parseInt(row.total_visits, 10),
  }))
}

/**
 * Get navigation patterns by hour of day (0-23).
 * Shows when users are most active navigating internally.
 */
export async function getNavigationByHourOfDay(
  pool: Pool,
  startDate?: string,
  endDate?: string
): Promise<HourlyPattern[]> {
  const params: (string | undefined)[] = []
  const conditions: string[] = ["is_internal_referral = true"]

  if (startDate) {
    params.push(startDate)
    conditions.push(`visited_at >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    conditions.push(`visited_at < ($${params.length}::date + interval '1 day')`)
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`

  const query = `
    SELECT
      EXTRACT(HOUR FROM visited_at)::integer as hour,
      COUNT(*) as count
    FROM page_visits
    ${whereClause}
    GROUP BY hour
    ORDER BY hour ASC
  `

  const result = await pool.query<{ hour: number; count: string }>(
    query,
    params.filter((p): p is string => p !== undefined)
  )

  return result.rows.map((row) => ({
    hour: row.hour,
    count: parseInt(row.count, 10),
  }))
}

/**
 * Get entry and exit pages.
 * Entry pages: First page in a session
 * Exit pages: Last page in a session
 */
export async function getEntryExitPages(
  pool: Pool,
  startDate?: string,
  endDate?: string,
  limit: number = 20
): Promise<{ entry: EntryExitPage[]; exit: EntryExitPage[] }> {
  const params: (string | undefined)[] = []
  const conditions: string[] = []

  if (startDate) {
    params.push(startDate)
    conditions.push(`visited_at >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    conditions.push(`visited_at < ($${params.length}::date + interval '1 day')`)
  }

  params.push(limit.toString())
  const limitClause = `LIMIT $${params.length}`

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Entry pages: First visit in each session
  const entryQuery = `
    WITH session_first_visits AS (
      SELECT DISTINCT ON (session_id)
        session_id,
        visited_path
      FROM page_visits
      ${whereClause}
      ORDER BY session_id, visited_at ASC
    ),
    entry_counts AS (
      SELECT
        visited_path,
        COUNT(*) as count
      FROM session_first_visits
      GROUP BY visited_path
    ),
    total_entries AS (
      SELECT SUM(count) as total FROM entry_counts
    )
    SELECT
      ec.visited_path as path,
      ec.count,
      ROUND((ec.count::decimal / te.total * 100), 2) as percentage
    FROM entry_counts ec
    CROSS JOIN total_entries te
    ORDER BY ec.count DESC
    ${limitClause}
  `

  // Exit pages: Last visit in each session
  const exitQuery = `
    WITH session_last_visits AS (
      SELECT DISTINCT ON (session_id)
        session_id,
        visited_path
      FROM page_visits
      ${whereClause}
      ORDER BY session_id, visited_at DESC
    ),
    exit_counts AS (
      SELECT
        visited_path,
        COUNT(*) as count
      FROM session_last_visits
      GROUP BY visited_path
    ),
    total_exits AS (
      SELECT SUM(count) as total FROM exit_counts
    )
    SELECT
      ec.visited_path as path,
      ec.count,
      ROUND((ec.count::decimal / te.total * 100), 2) as percentage
    FROM exit_counts ec
    CROSS JOIN total_exits te
    ORDER BY ec.count DESC
    ${limitClause}
  `

  const filteredParams = params.filter((p): p is string => p !== undefined)

  const [entryResult, exitResult] = await Promise.all([
    pool.query<{ path: string; count: string; percentage: string }>(entryQuery, filteredParams),
    pool.query<{ path: string; count: string; percentage: string }>(exitQuery, filteredParams),
  ])

  return {
    entry: entryResult.rows.map((row) => ({
      path: row.path,
      count: parseInt(row.count, 10),
      percentage: parseFloat(row.percentage),
    })),
    exit: exitResult.rows.map((row) => ({
      path: row.path,
      count: parseInt(row.count, 10),
      percentage: parseFloat(row.percentage),
    })),
  }
}

/**
 * Get overall page visit statistics summary.
 */
export async function getPageVisitStats(
  pool: Pool,
  startDate?: string,
  endDate?: string
): Promise<PageVisitStats> {
  const params: (string | undefined)[] = []
  const conditions: string[] = []

  if (startDate) {
    params.push(startDate)
    conditions.push(`visited_at >= $${params.length}`)
  }
  if (endDate) {
    params.push(endDate)
    conditions.push(`visited_at < ($${params.length}::date + interval '1 day')`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  const query = `
    SELECT
      COUNT(*) as total_visits,
      COUNT(*) FILTER (WHERE is_internal_referral = true) as internal_referrals,
      COUNT(*) FILTER (WHERE is_internal_referral = false AND referrer_path IS NOT NULL) as external_referrals,
      COUNT(*) FILTER (WHERE referrer_path IS NULL) as direct_visits,
      COUNT(DISTINCT session_id) as unique_sessions,
      COALESCE(ROUND(COUNT(*)::decimal / NULLIF(COUNT(DISTINCT session_id), 0), 2), 0) as avg_pages_per_session
    FROM page_visits
    ${whereClause}
  `

  const result = await pool.query<{
    total_visits: string
    internal_referrals: string
    external_referrals: string
    direct_visits: string
    unique_sessions: string
    avg_pages_per_session: string
  }>(
    query,
    params.filter((p): p is string => p !== undefined)
  )

  const row = result.rows[0]

  return {
    total_visits: parseInt(row.total_visits, 10),
    internal_referrals: parseInt(row.internal_referrals, 10),
    external_referrals: parseInt(row.external_referrals, 10),
    direct_visits: parseInt(row.direct_visits, 10),
    unique_sessions: parseInt(row.unique_sessions, 10),
    avg_pages_per_session: parseFloat(row.avg_pages_per_session),
  }
}
