/**
 * React Query hooks for admin enrichment review workflow.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"

// ============================================================================
// Types
// ============================================================================

export interface EnrichmentPendingReview {
  enrichment_run_actor_id: number
  run_id: number
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  deathday: string | null
  cause_of_death: string | null
  overall_confidence: number
  cause_confidence: string | null
  winning_source: string | null
  cost_usd: string
  created_at: string
}

export interface EnrichmentReviewDetail {
  enrichment_run_actor_id: number
  run_id: number
  actor_id: number
  actor_name: string
  actor_tmdb_id: number | null
  winning_source: string | null
  cost_usd: string
  overall_confidence: number
  staging: {
    deathday: string | null
    cause_of_death: string | null
    cause_of_death_details: string | null
    age_at_death: number | null
    years_lost: number | null
    violent_death: boolean | null
    has_detailed_death_info: boolean | null
    circumstances: string | null
    location_of_death: string | null
  }
  production: {
    deathday: string | null
    cause_of_death: string | null
    cause_of_death_details: string | null
    age_at_death: number | null
    years_lost: number | null
    violent_death: boolean | null
    has_detailed_death_info: boolean | null
    circumstances: string | null
    location_of_death: string | null
  }
  confidence_breakdown: {
    cause_confidence: number | null
    details_confidence: number | null
    deathday_confidence: number | null
    birthday_confidence: number | null
    circumstances_confidence: number | null
  }
  raw_response: string | null
}

export interface PendingReviewFilters {
  runId?: number
  minConfidence?: number
  causeConfidence?: "high" | "medium" | "low" | "disputed"
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface EditEnrichmentRequest {
  deathday?: string | null
  cause_of_death?: string | null
  cause_of_death_details?: string | null
  age_at_death?: number | null
  years_lost?: number | null
  violent_death?: boolean | null
  has_detailed_death_info?: boolean | null
  circumstances?: string | null
  location_of_death?: string | null
}

export interface RejectEnrichmentRequest {
  reason: string
}

export interface CommitEnrichmentStats {
  approvedCount: number
  actorCount: number
  totalCost: number
  actors: Array<{ actor_id: number; actor_name: string }>
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchPendingEnrichments(
  page: number,
  pageSize: number,
  filters: PendingReviewFilters
): Promise<PaginatedResult<EnrichmentPendingReview>> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  if (filters.runId !== undefined) params.append("runId", filters.runId.toString())
  if (filters.minConfidence !== undefined)
    params.append("minConfidence", filters.minConfidence.toString())
  if (filters.causeConfidence) params.append("causeConfidence", filters.causeConfidence)

  const response = await fetch(`/admin/api/enrichment/pending-review?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch pending enrichments")
  }

  return response.json()
}

async function fetchEnrichmentReviewDetail(
  enrichmentRunActorId: number
): Promise<EnrichmentReviewDetail> {
  const response = await fetch(`/admin/api/enrichment/review/${enrichmentRunActorId}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch enrichment review detail")
  }

  return response.json()
}

async function approveEnrichment(enrichmentRunActorId: number): Promise<{ success: boolean }> {
  const response = await fetch(`/admin/api/enrichment/review/${enrichmentRunActorId}/approve`, {
    method: "POST",
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to approve enrichment")
  }

  return response.json()
}

async function rejectEnrichment(
  enrichmentRunActorId: number,
  data: RejectEnrichmentRequest
): Promise<{ success: boolean }> {
  const response = await fetch(`/admin/api/enrichment/review/${enrichmentRunActorId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to reject enrichment")
  }

  return response.json()
}

async function editEnrichment(
  enrichmentRunActorId: number,
  data: EditEnrichmentRequest
): Promise<{ success: boolean }> {
  const response = await fetch(`/admin/api/enrichment/review/${enrichmentRunActorId}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to edit enrichment")
  }

  return response.json()
}

async function commitEnrichmentRun(runId: number): Promise<CommitEnrichmentStats> {
  const response = await fetch(`/admin/api/enrichment/runs/${runId}/commit`, {
    method: "POST",
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || "Failed to commit enrichment run")
  }

  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch paginated list of pending enrichments.
 * Polls every 30 seconds when there are pending items.
 */
export function usePendingEnrichments(
  page: number,
  pageSize: number,
  filters: PendingReviewFilters = {}
): UseQueryResult<PaginatedResult<EnrichmentPendingReview>> {
  return useQuery({
    queryKey: ["admin", "enrichment", "review", "pending", page, pageSize, filters],
    queryFn: () => fetchPendingEnrichments(page, pageSize, filters),
    refetchInterval: (query) => {
      // Poll every 30 seconds if there are pending items
      const data = query.state.data
      if (data && data.total > 0) {
        return 30000
      }
      return false
    },
    staleTime: 0, // Always fetch fresh data
  })
}

/**
 * Hook to fetch detailed information about a single enrichment for review.
 */
export function useEnrichmentReviewDetail(
  enrichmentRunActorId: number
): UseQueryResult<EnrichmentReviewDetail> {
  return useQuery({
    queryKey: ["admin", "enrichment", "review", "detail", enrichmentRunActorId],
    queryFn: () => fetchEnrichmentReviewDetail(enrichmentRunActorId),
    staleTime: 30000, // 30 seconds
    enabled: !!enrichmentRunActorId,
  })
}

/**
 * Mutation hook to approve an enrichment.
 */
export function useApproveEnrichment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: approveEnrichment,
    onSuccess: () => {
      // Invalidate pending list to refresh counts
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "review", "pending"] })
    },
  })
}

/**
 * Mutation hook to reject an enrichment.
 */
export function useRejectEnrichment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RejectEnrichmentRequest }) =>
      rejectEnrichment(id, data),
    onSuccess: () => {
      // Invalidate pending list to refresh counts
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "review", "pending"] })
    },
  })
}

/**
 * Mutation hook to edit enrichment staging data.
 */
export function useEditEnrichment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditEnrichmentRequest }) =>
      editEnrichment(id, data),
    onSuccess: (_, variables) => {
      // Invalidate detail view to show updated data
      queryClient.invalidateQueries({
        queryKey: ["admin", "enrichment", "review", "detail", variables.id],
      })
    },
  })
}

/**
 * Mutation hook to commit approved enrichments to production.
 */
export function useCommitEnrichmentRun() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: commitEnrichmentRun,
    onSuccess: () => {
      // Invalidate all review queries to refresh UI
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "review"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "enrichment", "runs"] })
    },
  })
}
