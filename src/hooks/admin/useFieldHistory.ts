/**
 * React Query hook for lazy-loading field history.
 */

import { useQuery } from "@tanstack/react-query"

export interface FieldHistoryEntry {
  id: number
  old_value: string | null
  new_value: string | null
  source: string
  batch_id: string | null
  created_at: string
}

interface FieldHistoryResponse {
  field: string
  history: FieldHistoryEntry[]
  total: number
  hasMore: boolean
}

async function fetchFieldHistory(
  actorId: number,
  fieldName: string
): Promise<FieldHistoryResponse> {
  const response = await fetch(`/admin/api/actors/${actorId}/history/${fieldName}`, {
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to fetch history" } }))
    throw new Error(error.error?.message || "Failed to fetch history")
  }

  return response.json()
}

export interface UseFieldHistoryResult {
  history: FieldHistoryEntry[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  total: number
  hasMore: boolean
}

export function useFieldHistory(
  actorId: number | undefined,
  fieldName: string,
  enabled: boolean
): UseFieldHistoryResult {
  const query = useQuery({
    queryKey: ["admin", "actor", actorId, "history", fieldName],
    queryFn: () => fetchFieldHistory(actorId!, fieldName),
    enabled: enabled && !!actorId,
    staleTime: 60000, // 1 minute
  })

  return {
    history: query.data?.history ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    total: query.data?.total ?? 0,
    hasMore: query.data?.hasMore ?? false,
  }
}
