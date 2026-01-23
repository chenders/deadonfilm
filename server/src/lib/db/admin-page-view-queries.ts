/**
 * Database queries for admin page view analytics.
 *
 * Provides queries for:
 * - Page view summary statistics
 * - Top viewed pages by type
 * - Page view trends over time
 * - Page view tracking (public endpoint)
 */

import { Pool } from "pg"

// ============================================================================
// Types
// ============================================================================

export interface PageViewSummary {
  total_views: number
  death_page_views: number
  movie_views: number
  show_views: number
  episode_views: number
  unique_entities_viewed: number
}

export interface TopViewedPage {
  page_type: "movie" | "show" | "episode" | "actor_death"
  entity_id: number
  view_count: number
  last_viewed_at: string
  // Entity details (joined from respective tables)
  entity_name?: string
  entity_title?: string
  entity_slug?: string
  entity_year?: number
  entity_tmdb_id?: number
}

export interface PageViewTrendPoint {
  date: string
  total_views: number
  movie_views: number
  show_views: number
  episode_views: number
  actor_death_views: number
}

export interface TrackPageViewData {
  pageType: "movie" | "show" | "episode" | "actor_death"
  entityId: number
  path: string
  referrer?: string
  userAgent?: string
}

// ============================================================================
// Page View Summary
// ============================================================================

/**
 * Get aggregated page view statistics.
 */
export async function getPageViewSummary(
  pool: Pool,
  startDate: string,
  endDate: string,
  pageType?: string
): Promise<PageViewSummary> {
  const params: unknown[] = [startDate, endDate]
  let typeFilter = ""

  if (pageType && pageType !== "all") {
    typeFilter = "AND page_type = $3"
    params.push(pageType)
  }

  const result = await pool.query<PageViewSummary>(
    `SELECT
       COUNT(*) as total_views,
       COUNT(*) FILTER (WHERE page_type = 'actor_death') as death_page_views,
       COUNT(*) FILTER (WHERE page_type = 'movie') as movie_views,
       COUNT(*) FILTER (WHERE page_type = 'show') as show_views,
       COUNT(*) FILTER (WHERE page_type = 'episode') as episode_views,
       COUNT(DISTINCT (page_type, entity_id)) as unique_entities_viewed
     FROM page_views
     WHERE viewed_at >= $1 AND viewed_at <= $2 ${typeFilter}`,
    params
  )

  return result.rows[0]
}

/**
 * Get most viewed pages by type.
 */
export async function getTopViewedPages(
  pool: Pool,
  pageType: string,
  startDate: string,
  endDate: string,
  limit: number
): Promise<TopViewedPage[]> {
  // Different queries depending on page type to join entity details
  if (pageType === "actor_death") {
    const result = await pool.query<TopViewedPage>(
      `SELECT
         pv.page_type,
         pv.entity_id,
         COUNT(*) as view_count,
         MAX(pv.viewed_at) as last_viewed_at,
         a.name as entity_name,
         a.tmdb_id as entity_tmdb_id
       FROM page_views pv
       JOIN actors a ON a.id = pv.entity_id
       WHERE pv.page_type = 'actor_death'
         AND pv.viewed_at >= $1 AND pv.viewed_at <= $2
       GROUP BY pv.page_type, pv.entity_id, a.name, a.tmdb_id
       ORDER BY view_count DESC
       LIMIT $3`,
      [startDate, endDate, limit]
    )
    return result.rows
  }

  if (pageType === "movie") {
    const result = await pool.query<TopViewedPage>(
      `SELECT
         pv.page_type,
         pv.entity_id,
         COUNT(*) as view_count,
         MAX(pv.viewed_at) as last_viewed_at,
         m.title as entity_title,
         m.slug as entity_slug,
         m.release_year as entity_year,
         m.tmdb_id as entity_tmdb_id
       FROM page_views pv
       JOIN movies m ON m.id = pv.entity_id
       WHERE pv.page_type = 'movie'
         AND pv.viewed_at >= $1 AND pv.viewed_at <= $2
       GROUP BY pv.page_type, pv.entity_id, m.title, m.slug, m.release_year, m.tmdb_id
       ORDER BY view_count DESC
       LIMIT $3`,
      [startDate, endDate, limit]
    )
    return result.rows
  }

  if (pageType === "show") {
    const result = await pool.query<TopViewedPage>(
      `SELECT
         pv.page_type,
         pv.entity_id,
         COUNT(*) as view_count,
         MAX(pv.viewed_at) as last_viewed_at,
         s.name as entity_title,
         s.slug as entity_slug,
         s.first_air_year as entity_year,
         s.tmdb_id as entity_tmdb_id
       FROM page_views pv
       JOIN shows s ON s.id = pv.entity_id
       WHERE pv.page_type = 'show'
         AND pv.viewed_at >= $1 AND pv.viewed_at <= $2
       GROUP BY pv.page_type, pv.entity_id, s.name, s.slug, s.first_air_year, s.tmdb_id
       ORDER BY view_count DESC
       LIMIT $3`,
      [startDate, endDate, limit]
    )
    return result.rows
  }

  if (pageType === "episode") {
    const result = await pool.query<TopViewedPage>(
      `SELECT
         pv.page_type,
         pv.entity_id,
         COUNT(*) as view_count,
         MAX(pv.viewed_at) as last_viewed_at,
         e.name as entity_title,
         e.slug as entity_slug,
         s.tmdb_id as entity_tmdb_id
       FROM page_views pv
       JOIN episodes e ON e.id = pv.entity_id
       JOIN shows s ON s.id = e.show_id
       WHERE pv.page_type = 'episode'
         AND pv.viewed_at >= $1 AND pv.viewed_at <= $2
       GROUP BY pv.page_type, pv.entity_id, e.name, e.slug, s.tmdb_id
       ORDER BY view_count DESC
       LIMIT $3`,
      [startDate, endDate, limit]
    )
    return result.rows
  }

  // All types
  const result = await pool.query<TopViewedPage>(
    `SELECT
       page_type,
       entity_id,
       COUNT(*) as view_count,
       MAX(viewed_at) as last_viewed_at
     FROM page_views
     WHERE viewed_at >= $1 AND viewed_at <= $2
     GROUP BY page_type, entity_id
     ORDER BY view_count DESC
     LIMIT $3`,
    [startDate, endDate, limit]
  )
  return result.rows
}

/**
 * Get page view trends over time.
 */
export async function getPageViewTrends(
  pool: Pool,
  startDate: string,
  endDate: string,
  granularity: "daily" | "weekly" | "monthly" = "daily"
): Promise<PageViewTrendPoint[]> {
  const dateFormat =
    granularity === "daily" ? "YYYY-MM-DD" : granularity === "weekly" ? "YYYY-IW" : "YYYY-MM"

  const result = await pool.query<PageViewTrendPoint>(
    `SELECT
       TO_CHAR(viewed_at, $3) as date,
       COUNT(*) as total_views,
       COUNT(*) FILTER (WHERE page_type = 'movie') as movie_views,
       COUNT(*) FILTER (WHERE page_type = 'show') as show_views,
       COUNT(*) FILTER (WHERE page_type = 'episode') as episode_views,
       COUNT(*) FILTER (WHERE page_type = 'actor_death') as actor_death_views
     FROM page_views
     WHERE viewed_at >= $1 AND viewed_at <= $2
     GROUP BY TO_CHAR(viewed_at, $3)
     ORDER BY date ASC`,
    [startDate, endDate, dateFormat]
  )

  return result.rows
}

/**
 * Track a page view (public endpoint).
 * Called by frontend when users view content.
 */
export async function trackPageView(pool: Pool, data: TrackPageViewData): Promise<void> {
  await pool.query(
    `INSERT INTO page_views (page_type, entity_id, path, referrer, user_agent, viewed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [data.pageType, data.entityId, data.path, data.referrer || null, data.userAgent || null]
  )
}
