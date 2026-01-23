/**
 * React Query hooks for admin page view analytics.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

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

// ============================================================================
// API Functions
// ============================================================================

async function fetchPageViewSummary(
  startDate: string,
  endDate: string,
  pageType: string = "all"
): Promise<PageViewSummary> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    pageType,
  })

  const response = await fetch(`/admin/api/page-views/summary?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch page view summary")
  }

  return response.json()
}

async function fetchTopViewedPages(
  pageType: string,
  startDate: string,
  endDate: string,
  limit: number
): Promise<TopViewedPage[]> {
  const params = new URLSearchParams({
    pageType,
    startDate,
    endDate,
    limit: limit.toString(),
  })

  const response = await fetch(`/admin/api/page-views/top-viewed?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch top viewed pages")
  }

  return response.json()
}

async function fetchPageViewTrends(
  startDate: string,
  endDate: string,
  granularity: "daily" | "weekly" | "monthly"
): Promise<PageViewTrendPoint[]> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    granularity,
  })

  const response = await fetch(`/admin/api/page-views/trends?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch page view trends")
  }

  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch page view summary statistics.
 */
export function usePageViewSummary(
  startDate: string,
  endDate: string,
  pageType: string = "all"
): UseQueryResult<PageViewSummary> {
  return useQuery({
    queryKey: ["admin", "page-views", "summary", startDate, endDate, pageType],
    queryFn: () => fetchPageViewSummary(startDate, endDate, pageType),
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Hook to fetch most viewed pages by type.
 */
export function useTopViewedPages(
  pageType: string,
  startDate: string,
  endDate: string,
  limit: number = 20
): UseQueryResult<TopViewedPage[]> {
  return useQuery({
    queryKey: ["admin", "page-views", "top-viewed", pageType, startDate, endDate, limit],
    queryFn: () => fetchTopViewedPages(pageType, startDate, endDate, limit),
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Hook to fetch page view trends over time.
 */
export function usePageViewTrends(
  startDate: string,
  endDate: string,
  granularity: "daily" | "weekly" | "monthly" = "daily"
): UseQueryResult<PageViewTrendPoint[]> {
  return useQuery({
    queryKey: ["admin", "page-views", "trends", startDate, endDate, granularity],
    queryFn: () => fetchPageViewTrends(startDate, endDate, granularity),
    staleTime: 600000, // 10 minutes
  })
}
