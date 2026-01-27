/**
 * React Query hooks for admin data quality management.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"
import { adminApi } from "@/services/api"

// ============================================================================
// Types
// ============================================================================

export interface DataQualityOverview {
  futureDeathsCount: number
  uncertainDeathsCount: number
  pendingResetCount: number
}

export interface FutureDeathActor {
  id: number
  name: string
  tmdbId: number | null
  deathDate: string
  birthDate: string | null
  popularity: number | null
  issueType: "future_date" | "before_birth" | "unknown"
}

export interface FutureDeathsResponse {
  total: number
  page: number
  pageSize: number
  totalPages: number
  actors: FutureDeathActor[]
}

export interface CleanupFutureDeathsResult {
  cleaned: number
  actorIds: number[]
  duration: number
  dryRun?: boolean
  wouldClean?: number
  actors?: Array<{ id: number; name: string }>
}

export interface UncertainDeathActor {
  id: number
  name: string
  tmdbId: number | null
  deathDate: string
  popularity: number | null
  circumstancesExcerpt: string | null
}

export interface UncertainDeathsResponse {
  total: number
  page: number
  pageSize: number
  totalPages: number
  actors: UncertainDeathActor[]
}

export interface ResetEnrichmentResult {
  reset?: boolean
  actorId?: number
  name?: string
  historyDeleted?: number
  circumstancesDeleted?: number
  dryRun?: boolean
  actor?: {
    id: number
    name: string
    tmdbId: number | null
    hasDetailedDeathInfo: boolean | null
    historyCount: number
  }
  wouldReset?: {
    actorFields: boolean
    historyEntries: number
    circumstancesRecord: boolean
  }
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchDataQualityOverview(): Promise<DataQualityOverview> {
  const response = await fetch(adminApi("/data-quality/overview"), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch data quality overview")
  }

  return response.json()
}

async function fetchFutureDeaths(page: number, pageSize: number): Promise<FutureDeathsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  const response = await fetch(adminApi(`/data-quality/future-deaths?${params.toString()}`), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch future deaths")
  }

  return response.json()
}

async function cleanupFutureDeaths(params: {
  dryRun?: boolean
  actorIds?: number[]
}): Promise<CleanupFutureDeathsResult> {
  const response = await fetch(adminApi("/data-quality/cleanup-future-deaths"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    throw new Error("Failed to cleanup future deaths")
  }

  return response.json()
}

async function fetchUncertainDeaths(
  page: number,
  pageSize: number
): Promise<UncertainDeathsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  const response = await fetch(adminApi(`/data-quality/uncertain-deaths?${params.toString()}`), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch uncertain deaths")
  }

  return response.json()
}

async function resetEnrichment(params: {
  actorId?: number
  tmdbId?: number
  dryRun?: boolean
}): Promise<ResetEnrichmentResult> {
  const response = await fetch(adminApi("/data-quality/reset-enrichment"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(errorData.error?.message || "Failed to reset enrichment")
  }

  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch data quality overview statistics.
 */
export function useDataQualityOverview(): UseQueryResult<DataQualityOverview> {
  return useQuery({
    queryKey: ["admin", "data-quality", "overview"],
    queryFn: fetchDataQualityOverview,
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to fetch paginated list of actors with future/invalid death dates.
 */
export function useFutureDeaths(
  page: number,
  pageSize: number
): UseQueryResult<FutureDeathsResponse> {
  return useQuery({
    queryKey: ["admin", "data-quality", "future-deaths", page, pageSize],
    queryFn: () => fetchFutureDeaths(page, pageSize),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to cleanup actors with future/invalid death dates.
 */
export function useCleanupFutureDeaths() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cleanupFutureDeaths,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "data-quality"] })
    },
  })
}

/**
 * Hook to fetch paginated list of actors with uncertain death information.
 */
export function useUncertainDeaths(
  page: number,
  pageSize: number
): UseQueryResult<UncertainDeathsResponse> {
  return useQuery({
    queryKey: ["admin", "data-quality", "uncertain-deaths", page, pageSize],
    queryFn: () => fetchUncertainDeaths(page, pageSize),
    staleTime: 60000, // 1 minute
  })
}

/**
 * Hook to reset enrichment data for an actor.
 */
export function useResetEnrichment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resetEnrichment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "data-quality"] })
    },
  })
}
