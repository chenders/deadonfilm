/**
 * React Query hooks for admin TMDB sync management.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"
import { adminApi } from "@/services/api"

// ============================================================================
// Types
// ============================================================================

export interface LastSyncInfo {
  type: string
  completedAt: string
  itemsChecked: number
  itemsUpdated: number
  newDeathsFound: number
}

export interface SyncStatus {
  lastSync: LastSyncInfo | null
  isRunning: boolean
  currentSyncId: number | null
  currentSyncStartedAt: string | null
}

export interface SyncHistoryItem {
  id: number
  syncType: string
  startedAt: string
  completedAt: string | null
  status: "running" | "completed" | "failed"
  itemsChecked: number
  itemsUpdated: number
  newDeathsFound: number
  errorMessage: string | null
  parameters: Record<string, unknown> | null
  triggeredBy: string | null
}

export interface SyncHistoryResponse {
  history: SyncHistoryItem[]
}

export interface TriggerSyncParams {
  days?: number
  types?: ("people" | "movies" | "shows")[]
  dryRun?: boolean
}

export interface TriggerSyncResult {
  syncId: number
  message: string
  syncType: string
  days: number
  dryRun: boolean
}

export interface SyncDetails {
  id: number
  syncType: string
  startedAt: string
  completedAt: string | null
  status: "running" | "completed" | "failed"
  itemsChecked: number
  itemsUpdated: number
  newDeathsFound: number
  errorMessage: string | null
  parameters: Record<string, unknown> | null
  triggeredBy: string | null
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchSyncStatus(): Promise<SyncStatus> {
  const response = await fetch(adminApi("/sync/status"), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch sync status")
  }

  return response.json()
}

async function fetchSyncHistory(limit: number = 20): Promise<SyncHistoryResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
  })

  const response = await fetch(adminApi(`/sync/history?${params.toString()}`), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch sync history")
  }

  return response.json()
}

async function triggerSync(params: TriggerSyncParams): Promise<TriggerSyncResult> {
  const response = await fetch(adminApi("/sync/tmdb"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(errorData.error?.message || "Failed to trigger sync")
  }

  return response.json()
}

async function fetchSyncDetails(syncId: number): Promise<SyncDetails> {
  const response = await fetch(adminApi(`/sync/${syncId}`), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch sync details")
  }

  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch current sync status.
 */
export function useSyncStatus(): UseQueryResult<SyncStatus> {
  return useQuery({
    queryKey: ["admin", "sync", "status"],
    queryFn: fetchSyncStatus,
    staleTime: 10000, // 10 seconds - refresh more frequently for running sync
    refetchInterval: (query) => {
      // Poll every 5 seconds if a sync is running
      const data = query.state.data as SyncStatus | undefined
      return data?.isRunning ? 5000 : false
    },
  })
}

/**
 * Hook to fetch sync history.
 */
export function useSyncHistory(limit: number = 20): UseQueryResult<SyncHistoryResponse> {
  return useQuery({
    queryKey: ["admin", "sync", "history", limit],
    queryFn: () => fetchSyncHistory(limit),
    staleTime: 30000, // 30 seconds
  })
}

/**
 * Hook to trigger a TMDB sync operation.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      // Invalidate status and history to reflect the new sync
      queryClient.invalidateQueries({ queryKey: ["admin", "sync"] })
    },
  })
}

/**
 * Hook to fetch details of a specific sync operation.
 */
export function useSyncDetails(
  syncId: number | null,
  options?: { enabled?: boolean }
): UseQueryResult<SyncDetails> {
  return useQuery({
    queryKey: ["admin", "sync", "details", syncId],
    queryFn: () => fetchSyncDetails(syncId!),
    enabled: syncId !== null && (options?.enabled ?? true),
    staleTime: 10000,
    refetchInterval: (query) => {
      // Poll every 5 seconds if sync is still running
      const data = query.state.data as SyncDetails | undefined
      return data?.status === "running" ? 5000 : false
    },
  })
}
