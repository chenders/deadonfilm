/**
 * React Query hooks for admin analytics (costs and page visits).
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

// ============================================================================
// Types - Cost Analytics
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
// Types - Page Visit Analytics
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

export interface EntryExitResult {
  entry: EntryExitPage[]
  exit: EntryExitPage[]
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
// API Functions - Cost Analytics
// ============================================================================

async function fetchCostBySource(
  startDate?: string,
  endDate?: string
): Promise<CostBySourceResult> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)

  const queryString = params.toString()
  const url = `/admin/api/analytics/costs/by-source${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, {
    credentials: "include", // Include cookies for authentication
  })

  if (!response.ok) {
    throw new Error("Failed to fetch cost by source analytics")
  }

  return response.json()
}

// ============================================================================
// API Functions - Page Visit Analytics
// ============================================================================

async function fetchPageVisitStats(startDate?: string, endDate?: string): Promise<PageVisitStats> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)

  const queryString = params.toString()
  const url = `/admin/api/analytics/page-visits/stats${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, { credentials: "include" })

  if (!response.ok) {
    throw new Error("Failed to fetch page visit stats")
  }

  return response.json()
}

async function fetchInternalReferralsOverTime(
  startDate?: string,
  endDate?: string,
  granularity: "hour" | "day" | "week" = "day"
): Promise<TimeSeriesPoint[]> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)
  params.append("granularity", granularity)

  const queryString = params.toString()
  const url = `/admin/api/analytics/page-visits/internal-referrals-over-time${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, { credentials: "include" })

  if (!response.ok) {
    throw new Error("Failed to fetch internal referrals over time")
  }

  return response.json()
}

async function fetchNavigationPaths(
  startDate?: string,
  endDate?: string,
  limit: number = 20
): Promise<NavigationPath[]> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)
  params.append("limit", limit.toString())

  const queryString = params.toString()
  const url = `/admin/api/analytics/page-visits/navigation-paths${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, { credentials: "include" })

  if (!response.ok) {
    throw new Error("Failed to fetch navigation paths")
  }

  return response.json()
}

async function fetchPopularPages(
  startDate?: string,
  endDate?: string,
  limit: number = 20
): Promise<PopularPage[]> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)
  params.append("limit", limit.toString())

  const queryString = params.toString()
  const url = `/admin/api/analytics/page-visits/popular-pages${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, { credentials: "include" })

  if (!response.ok) {
    throw new Error("Failed to fetch popular pages")
  }

  return response.json()
}

async function fetchHourlyPatterns(startDate?: string, endDate?: string): Promise<HourlyPattern[]> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)

  const queryString = params.toString()
  const url = `/admin/api/analytics/page-visits/hourly-patterns${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, { credentials: "include" })

  if (!response.ok) {
    throw new Error("Failed to fetch hourly patterns")
  }

  return response.json()
}

async function fetchEntryExitPages(
  startDate?: string,
  endDate?: string,
  limit: number = 20
): Promise<EntryExitResult> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)
  params.append("limit", limit.toString())

  const queryString = params.toString()
  const url = `/admin/api/analytics/page-visits/entry-exit${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, { credentials: "include" })

  if (!response.ok) {
    throw new Error("Failed to fetch entry/exit pages")
  }

  return response.json()
}

// ============================================================================
// Hooks - Cost Analytics
// ============================================================================

/**
 * Fetch cost analytics aggregated by death source.
 */
export function useCostBySource(
  startDate?: string,
  endDate?: string
): UseQueryResult<CostBySourceResult> {
  return useQuery({
    queryKey: ["admin", "analytics", "costs", "by-source", startDate, endDate],
    queryFn: () => fetchCostBySource(startDate, endDate),
    staleTime: 60000, // 1 minute cache
  })
}

// ============================================================================
// Hooks - Page Visit Analytics
// ============================================================================

/**
 * Fetch overall page visit statistics summary.
 */
export function usePageVisitStats(
  startDate?: string,
  endDate?: string
): UseQueryResult<PageVisitStats> {
  return useQuery({
    queryKey: ["admin", "analytics", "page-visits", "stats", startDate, endDate],
    queryFn: () => fetchPageVisitStats(startDate, endDate),
    staleTime: 60000, // 1 minute cache
  })
}

/**
 * Fetch internal referrals over time as a time series.
 */
export function useInternalReferralsOverTime(
  startDate?: string,
  endDate?: string,
  granularity: "hour" | "day" | "week" = "day"
): UseQueryResult<TimeSeriesPoint[]> {
  return useQuery({
    queryKey: [
      "admin",
      "analytics",
      "page-visits",
      "internal-referrals-over-time",
      startDate,
      endDate,
      granularity,
    ],
    queryFn: () => fetchInternalReferralsOverTime(startDate, endDate, granularity),
    staleTime: 60000, // 1 minute cache
  })
}

/**
 * Fetch the most common navigation paths.
 */
export function useNavigationPaths(
  startDate?: string,
  endDate?: string,
  limit: number = 20
): UseQueryResult<NavigationPath[]> {
  return useQuery({
    queryKey: ["admin", "analytics", "page-visits", "navigation-paths", startDate, endDate, limit],
    queryFn: () => fetchNavigationPaths(startDate, endDate, limit),
    staleTime: 60000, // 1 minute cache
  })
}

/**
 * Fetch the most popular pages by internal referrals.
 */
export function usePopularPages(
  startDate?: string,
  endDate?: string,
  limit: number = 20
): UseQueryResult<PopularPage[]> {
  return useQuery({
    queryKey: ["admin", "analytics", "page-visits", "popular-pages", startDate, endDate, limit],
    queryFn: () => fetchPopularPages(startDate, endDate, limit),
    staleTime: 60000, // 1 minute cache
  })
}

/**
 * Fetch navigation patterns by hour of day.
 */
export function useHourlyPatterns(
  startDate?: string,
  endDate?: string
): UseQueryResult<HourlyPattern[]> {
  return useQuery({
    queryKey: ["admin", "analytics", "page-visits", "hourly-patterns", startDate, endDate],
    queryFn: () => fetchHourlyPatterns(startDate, endDate),
    staleTime: 60000, // 1 minute cache
  })
}

/**
 * Fetch entry and exit pages.
 */
export function useEntryExitPages(
  startDate?: string,
  endDate?: string,
  limit: number = 20
): UseQueryResult<EntryExitResult> {
  return useQuery({
    queryKey: ["admin", "analytics", "page-visits", "entry-exit", startDate, endDate, limit],
    queryFn: () => fetchEntryExitPages(startDate, endDate, limit),
    staleTime: 60000, // 1 minute cache
  })
}
