/**
 * React Query hooks for admin bio enrichment monitoring.
 * Pattern: src/hooks/admin/useEnrichmentRuns.ts
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

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

export interface BioEnrichmentRunProgress {
  status: string
  currentActorIndex: number | null
  currentActorName: string | null
  actorsQueried: number
  actorsProcessed: number
  actorsEnriched: number
  actorsWithSubstantiveContent: number
  totalCostUsd: number
  synthesisCostUsd: number
  sourceCostUsd: number
  progressPercentage: number
  elapsedMs: number
  estimatedTimeRemainingMs: number | null
}

export interface StartBioEnrichmentRequest {
  limit?: number
  minPopularity?: number
  actorIds?: number[]
  confidenceThreshold?: number
  maxCostPerActor?: number
  maxTotalCost?: number
  allowRegeneration?: boolean
  sourceCategories?: {
    free?: boolean
    reference?: boolean
    webSearch?: boolean
    news?: boolean
    obituary?: boolean
    archives?: boolean
  }
}

// ============================================================================
// API helpers
// ============================================================================

const BASE_URL = "/admin/api/biography-enrichment"

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error?.message || `HTTP ${res.status}`)
  }
  return res.json()
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Paginated bio enrichment runs list.
 */
export function useBioEnrichmentRuns(
  page: number,
  pageSize: number,
  filters: BioEnrichmentRunFilters = {}
) {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (filters.startDate) params.set("startDate", filters.startDate)
  if (filters.endDate) params.set("endDate", filters.endDate)
  if (filters.exitReason) params.set("exitReason", filters.exitReason)
  if (filters.status) params.set("status", filters.status)
  if (filters.minCost !== undefined) params.set("minCost", String(filters.minCost))
  if (filters.maxCost !== undefined) params.set("maxCost", String(filters.maxCost))

  return useQuery<PaginatedResult<BioEnrichmentRunSummary>>({
    queryKey: ["bio-enrichment-runs", page, pageSize, filters],
    queryFn: () => fetchJson(`${BASE_URL}/runs?${params}`),
  })
}

/**
 * Single bio enrichment run details.
 */
export function useBioEnrichmentRunDetails(runId: number | undefined) {
  return useQuery<BioEnrichmentRunDetails>({
    queryKey: ["bio-enrichment-run", runId],
    queryFn: () => fetchJson(`${BASE_URL}/runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "running" || status === "pending" ? 5000 : false
    },
  })
}

/**
 * Per-actor results for a bio enrichment run.
 */
export function useBioEnrichmentRunActors(
  runId: number | undefined,
  page: number,
  pageSize: number,
  isRunning?: boolean
) {
  return useQuery<PaginatedResult<BioEnrichmentRunActor>>({
    queryKey: ["bio-enrichment-run-actors", runId, page, pageSize],
    queryFn: () =>
      fetchJson(`${BASE_URL}/runs/${runId}/actors?page=${page}&pageSize=${pageSize}`),
    enabled: !!runId,
    refetchInterval: isRunning ? 5000 : false,
  })
}

/**
 * Source performance stats for a bio enrichment run.
 */
export function useBioRunSourcePerformanceStats(runId: number | undefined, isRunning?: boolean) {
  return useQuery<BioSourcePerformanceStats[]>({
    queryKey: ["bio-enrichment-run-sources", runId],
    queryFn: () => fetchJson(`${BASE_URL}/runs/${runId}/sources/stats`),
    enabled: !!runId,
    refetchInterval: isRunning ? 5000 : false,
  })
}

/**
 * Real-time progress for a running bio enrichment run.
 */
export function useBioEnrichmentRunProgress(runId: number | undefined, enabled?: boolean) {
  return useQuery<BioEnrichmentRunProgress>({
    queryKey: ["bio-enrichment-run-progress", runId],
    queryFn: () => fetchJson(`${BASE_URL}/runs/${runId}/progress`),
    enabled: !!runId && enabled !== false,
    refetchInterval: 3000,
  })
}

/**
 * Start a new bio enrichment run.
 */
export function useStartBioEnrichmentRun() {
  const queryClient = useQueryClient()
  return useMutation<{ success: boolean; runId: number }, Error, StartBioEnrichmentRequest>({
    mutationFn: (config) => postJson(`${BASE_URL}/runs/start`, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bio-enrichment-runs"] })
    },
  })
}

/**
 * Stop a running bio enrichment run.
 */
export function useStopBioEnrichmentRun() {
  const queryClient = useQueryClient()
  return useMutation<{ success: boolean }, Error, number>({
    mutationFn: (runId) => postJson(`${BASE_URL}/runs/${runId}/stop`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bio-enrichment-runs"] })
      queryClient.invalidateQueries({ queryKey: ["bio-enrichment-run"] })
    },
  })
}
