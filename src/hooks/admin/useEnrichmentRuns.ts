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
  has_logs: boolean
}

export interface ActorLogEntry {
  timestamp: string
  level: "info" | "warn" | "error" | "debug"
  message: string
  data?: Record<string, unknown>
}

export interface ActorLogsResponse {
  actorName: string
  logEntries: ActorLogEntry[]
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
  minPopularity?: number
  recentOnly?: boolean
  actorIds?: number[]
  free?: boolean
  paid?: boolean
  ai?: boolean
  confidence?: number
  maxCostPerActor?: number
  maxTotalCost?: number
  claudeCleanup?: boolean
  gatherAllSources?: boolean
  followLinks?: boolean
  aiLinkSelection?: boolean
  aiContentExtraction?: boolean
  aiModel?: string
  maxLinks?: number
  maxLinkCost?: number
  topBilledYear?: number
  maxBilling?: number
  topMovies?: number
  usActorsOnly?: boolean
  /** Wikipedia-specific options */
  wikipedia?: {
    /** Use AI (Gemini Flash) for section selection instead of regex. Default: false */
    useAISectionSelection?: boolean
    /** Follow links to related Wikipedia articles. Default: false */
    followLinkedArticles?: boolean
    /** Maximum linked articles to fetch. Default: 2 */
    maxLinkedArticles?: number
    /** Maximum sections to fetch. Default: 10 */
    maxSections?: number
  }
  // Legacy fields
  sources?: string[]
  dryRun?: boolean
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

async function startEnrichmentRun(
  config: StartEnrichmentRequest
): Promise<{ id: number; status: string; message: string }> {
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

async function stopEnrichmentRun(runId: number): Promise<{ stopped: boolean }> {
  const response = await fetch(`/admin/api/enrichment/runs/${runId}/stop`, {
    method: "POST",
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to stop enrichment run")
  }

  return response.json()
}

export interface EnrichmentRunProgress {
  status: string
  currentActorIndex: number | null
  currentActorName: string | null
  actorsQueried: number
  actorsProcessed: number
  actorsEnriched: number
  totalCostUsd: number
  progressPercentage: number
  elapsedMs: number
  estimatedTimeRemainingMs: number | null
}

async function fetchEnrichmentRunProgress(runId: number): Promise<EnrichmentRunProgress> {
  const response = await fetch(`/admin/api/enrichment/runs/${runId}/progress`, {
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to fetch enrichment run progress")
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
    staleTime: 0,
    refetchInterval: (query) => {
      // Self-determine polling: poll every 10s while run is active
      const data = query.state.data
      if (data && data.exit_reason === null && data.completed_at === null) {
        return 10000
      }
      return false
    },
    enabled: !!runId,
  })
}

/**
 * Hook to fetch per-actor results for an enrichment run.
 */
export function useEnrichmentRunActors(
  runId: number,
  page: number,
  pageSize: number,
  isRunning?: boolean
): UseQueryResult<PaginatedResult<EnrichmentRunActor>> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId, "actors", page, pageSize],
    queryFn: () => fetchEnrichmentRunActors(runId, page, pageSize),
    staleTime: isRunning ? 0 : 60000,
    refetchInterval: isRunning ? 5000 : false,
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
  runId: number,
  isRunning?: boolean
): UseQueryResult<SourcePerformanceStats[]> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId, "sources", "stats"],
    queryFn: () => fetchRunSourcePerformanceStats(runId),
    staleTime: isRunning ? 0 : 60000,
    refetchInterval: isRunning ? 10000 : false,
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

/**
 * Mutation hook to stop a running enrichment run.
 */
export function useStopEnrichmentRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: stopEnrichmentRun,
    onSuccess: (_, runId) => {
      // Invalidate the run details and runs list
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "run", runId] })
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "runs"] })
    },
  })
}

/**
 * Hook to fetch real-time progress of a running enrichment run.
 * Polls every 2 seconds if the run is still running.
 */
export function useEnrichmentRunProgress(
  runId: number | null,
  enabled: boolean = true
): UseQueryResult<EnrichmentRunProgress> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId, "progress"],
    queryFn: () => fetchEnrichmentRunProgress(runId!),
    enabled: enabled && !!runId,
    refetchInterval: (query) => {
      // Poll every 2 seconds if status is 'running' or 'pending'
      const data = query.state.data
      if (data?.status === "running" || data?.status === "pending") {
        return 2000
      }
      return false // Stop polling when completed/failed/stopped
    },
    staleTime: 0, // Always fetch fresh data
  })
}

// ============================================================================
// Run Logs Types & Hooks
// ============================================================================

export interface EnrichmentRunLog {
  id: number
  level: "fatal" | "error" | "warn" | "info" | "debug" | "trace"
  source: string
  message: string
  details?: Record<string, unknown>
  request_id?: string
  path?: string
  method?: string
  script_name?: string
  job_name?: string
  error_stack?: string
  created_at: string
}

export interface EnrichmentRunLogsResponse {
  logs: EnrichmentRunLog[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

async function fetchEnrichmentRunLogs(
  runId: number,
  page: number,
  pageSize: number,
  level?: string
): Promise<EnrichmentRunLogsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  if (level) {
    params.append("level", level)
  }

  const response = await fetch(`/admin/api/enrichment/runs/${runId}/logs?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch enrichment run logs")
  }

  return response.json()
}

/**
 * Hook to fetch logs for a specific enrichment run.
 * Supports pagination and optional level filtering.
 */
export function useEnrichmentRunLogs(
  runId: number,
  page: number = 1,
  pageSize: number = 50,
  level?: string,
  isRunning?: boolean
): UseQueryResult<EnrichmentRunLogsResponse> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId, "logs", page, pageSize, level],
    queryFn: () => fetchEnrichmentRunLogs(runId, page, pageSize, level),
    staleTime: isRunning ? 0 : 30000,
    refetchInterval: isRunning ? 15000 : false,
    enabled: !!runId,
  })
}

// ============================================================================
// Actor Logs API
// ============================================================================

async function fetchActorLogs(runId: number, actorId: number): Promise<ActorLogsResponse> {
  const response = await fetch(`/admin/api/enrichment/runs/${runId}/actors/${actorId}/logs`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch actor enrichment logs")
  }

  return response.json()
}

/**
 * Hook to fetch per-actor enrichment log entries.
 */
export function useActorEnrichmentLogs(
  runId: number,
  actorId: number | null
): UseQueryResult<ActorLogsResponse> {
  return useQuery({
    queryKey: ["admin", "enrichment", "run", runId, "actors", actorId, "logs"],
    queryFn: () => fetchActorLogs(runId, actorId!),
    staleTime: 60000,
    enabled: !!runId && !!actorId,
  })
}

// ============================================================================
// Batch API Types
// ============================================================================

export interface BatchJobInfo {
  id: number
  batchId: string
  jobType: string
  status: "pending" | "processing" | "completed" | "failed" | "cancelled"
  createdAt: string
  completedAt?: string | null
  totalItems: number
  processedItems: number
  successfulItems: number
  failedItems: number
  progress: number
  parameters?: Record<string, unknown> | null
  errorMessage?: string | null
  costUsd?: number | null
}

export interface BatchStatusResponse {
  activeBatch: BatchJobInfo | null
  queueDepth: number
}

export interface BatchHistoryResponse {
  history: BatchJobInfo[]
}

export interface BatchSubmitRequest {
  limit?: number
  minPopularity?: number
  jobType?: "cause-of-death" | "death-details"
}

export interface BatchSubmitResponse {
  batchId: string | null
  jobId?: number
  jobType?: string
  actorsSubmitted: number
  message: string
}

export interface BatchCheckResponse {
  batchId: string
  status: string
  totalItems: number
  processedItems: number
  successfulItems: number
  failedItems: number
  progress: number
}

export interface BatchProcessRequest {
  dryRun?: boolean
}

export interface BatchProcessResponse {
  batchId: string
  processed?: number
  successful?: number
  failed?: number
  dryRun?: boolean
  wouldProcess?: number
  message: string
}

export interface RefetchDetailsRequest {
  limit?: number
  popularOnly?: boolean
  minPopularity?: number
  dryRun?: boolean
}

export interface RefetchDetailsResponse {
  actorsQueued?: number
  wouldQueue?: number
  dryRun: boolean
  actors?: Array<{ id: number; name: string; popularity: number | null }>
  message: string
}

// ============================================================================
// Batch API Functions
// ============================================================================

async function fetchBatchStatus(): Promise<BatchStatusResponse> {
  const response = await fetch("/admin/api/enrichment/batch/status", {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch batch status")
  }

  return response.json()
}

async function fetchBatchHistory(limit: number = 10): Promise<BatchHistoryResponse> {
  const params = new URLSearchParams({ limit: limit.toString() })
  const response = await fetch(`/admin/api/enrichment/batch/history?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch batch history")
  }

  return response.json()
}

async function submitBatch(request: BatchSubmitRequest): Promise<BatchSubmitResponse> {
  const response = await fetch("/admin/api/enrichment/batch/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(error.error?.message || "Failed to submit batch")
  }

  return response.json()
}

async function checkBatchStatus(batchId: string): Promise<BatchCheckResponse> {
  const response = await fetch(`/admin/api/enrichment/batch/${batchId}/check`, {
    method: "POST",
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to check batch status")
  }

  return response.json()
}

async function processBatch(
  batchId: string,
  request: BatchProcessRequest
): Promise<BatchProcessResponse> {
  const response = await fetch(`/admin/api/enrichment/batch/${batchId}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(error.error?.message || "Failed to process batch")
  }

  return response.json()
}

async function refetchDetails(request: RefetchDetailsRequest): Promise<RefetchDetailsResponse> {
  const response = await fetch("/admin/api/enrichment/refetch-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error("Failed to queue refetch details")
  }

  return response.json()
}

// ============================================================================
// Batch API Hooks
// ============================================================================

/**
 * Hook to fetch current batch job status.
 */
export function useBatchStatus(): UseQueryResult<BatchStatusResponse> {
  return useQuery({
    queryKey: ["admin", "enrichment", "batch", "status"],
    queryFn: fetchBatchStatus,
    staleTime: 10000, // 10 seconds
    refetchInterval: (query) => {
      // Poll every 5 seconds if there's an active batch
      const data = query.state.data
      return data?.activeBatch ? 5000 : false
    },
  })
}

/**
 * Hook to fetch batch job history.
 */
export function useBatchHistory(limit: number = 10): UseQueryResult<BatchHistoryResponse> {
  return useQuery({
    queryKey: ["admin", "enrichment", "batch", "history", limit],
    queryFn: () => fetchBatchHistory(limit),
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Mutation hook to submit a new batch job.
 */
export function useSubmitBatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: submitBatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "batch"] })
    },
  })
}

/**
 * Mutation hook to check batch status.
 */
export function useCheckBatchStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: checkBatchStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "batch", "status"] })
    },
  })
}

/**
 * Mutation hook to process batch results.
 */
export function useProcessBatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ batchId, request }: { batchId: string; request: BatchProcessRequest }) =>
      processBatch(batchId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "batch"] })
    },
  })
}

/**
 * Mutation hook to queue actors for detail refetch.
 */
export function useRefetchDetails() {
  return useMutation({
    mutationFn: refetchDetails,
  })
}
