/**
 * React Query hooks for admin cost analytics.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

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
// API Functions
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
// Hooks
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
