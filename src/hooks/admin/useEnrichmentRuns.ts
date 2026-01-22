/**
 * React Query hooks for admin enrichment monitoring.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"

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

export interface StartEnrichmentRequest {
  limit?: number
  maxTotalCost?: number
  maxCostPerActor?: number
  sources?: string[]
  dryRun?: boolean
  recentOnly?: boolean
  minPopularity?: number
  confidence?: number
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchEnrichmentRuns(
  page: number,
  pageSize: number,
  filters: EnrichmentRunFilters
): Promise<PaginatedResult<EnrichmentRunSummary>> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  if (filters.startDate) params.append("startDate", filters.startDate)
  if (filters.endDate) params.append("endDate", filters.endDate)
  if (filters.minCost !== undefined) params.append("minCost", filters.minCost.toString())
  if (filters.maxCost !== undefined) params.append("maxCost", filters.maxCost.toString())
  if (filters.exitReason) params.append("exitReason", filters.exitReason)
  if (filters.hasErrors !== undefined) params.append("hasErrors", filters.hasErrors.toString())

  const response = await fetch(`/admin/api/enrichment/runs?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch enrichment runs")
  }

  return response.json()
}

async function fetchEnrichmentRunDetails(runId: number): Promise<EnrichmentRunDetails> {
  const response = await fetch(`/admin/api/enrichment/runs/${runId}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch enrichment run details")
  }

  return response.json()
}

async function fetchEnrichmentRunActors(
  runId: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<EnrichmentRunActor>> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  const response = await fetch(`/admin/api/enrichment/runs/${runId}/actors?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch enrichment run actors")
  }

  return response.json()
}

async function fetchSourcePerformanceStats(
  startDate?: string,
  endDate?: string
): Promise<SourcePerformanceStats[]> {
  const params = new URLSearchParams()
  if (startDate) params.append("startDate", startDate)
  if (endDate) params.append("endDate", endDate)

  const queryString = params.toString()
  const url = `/admin/api/enrichment/sources/stats${queryString ? `?${queryString}` : ""}`

  const response = await fetch(url, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch source performance stats")
  }

  return response.json()
}

async function fetchRunSourcePerformanceStats(runId: number): Promise<SourcePerformanceStats[]> {
  const response = await fetch(`/admin/api/enrichment/runs/${runId}/sources/stats`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch run source performance stats")
  }

  return response.json()
}

async function startEnrichmentRun(config: StartEnrichmentRequest): Promise<{ runId: number }> {
  const response = await fetch("/admin/api/enrichment/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(config),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to start enrichment run")
  }

  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch paginated list of enrichment runs.
 */
export function useEnrichmentRuns(
  page: number,
  pageSize: number,
  filters: EnrichmentRunFilters = {}
): UseQueryResult<PaginatedResult<EnrichmentRunSummary>> {
  return useQuery({
    queryKey: ["admin", "enrichment", "runs", page, pageSize, filters],
    queryFn: () => fetchEnrichmentRuns(page, pageSize, filters),
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Hook to fetch detailed information about a single enrichment run.
 */
export function useEnrichmentRunDetails(runId: number): UseQueryResult<EnrichmentRunDetails> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId],
    queryFn: () => fetchEnrichmentRunDetails(runId),
    staleTime: 60000, // 1 minute
    enabled: !!runId,
  })
}

/**
 * Hook to fetch per-actor results for an enrichment run.
 */
export function useEnrichmentRunActors(
  runId: number,
  page: number,
  pageSize: number
): UseQueryResult<PaginatedResult<EnrichmentRunActor>> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId, "actors", page, pageSize],
    queryFn: () => fetchEnrichmentRunActors(runId, page, pageSize),
    staleTime: 60000, // 1 minute
    enabled: !!runId,
  })
}

/**
 * Hook to fetch aggregated source performance statistics.
 */
export function useSourcePerformanceStats(
  startDate?: string,
  endDate?: string
): UseQueryResult<SourcePerformanceStats[]> {
  return useQuery({
    queryKey: ["admin", "enrichment", "sources", "stats", startDate, endDate],
    queryFn: () => fetchSourcePerformanceStats(startDate, endDate),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch source performance statistics for a specific run.
 */
export function useRunSourcePerformanceStats(
  runId: number
): UseQueryResult<SourcePerformanceStats[]> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId, "sources", "stats"],
    queryFn: () => fetchRunSourcePerformanceStats(runId),
    staleTime: 60000, // 1 minute
    enabled: !!runId,
  })
}

/**
 * Mutation hook to start a new enrichment run.
 */
export function useStartEnrichmentRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: startEnrichmentRun,
    onSuccess: () => {
      // Invalidate runs list to show the new run
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "runs"] })
    },
  })
}
