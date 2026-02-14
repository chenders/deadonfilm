/**
 * React Query hooks for admin cause mappings management.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"
import { adminApi } from "@/services/api"

// ============================================================================
// Types
// ============================================================================

export interface MannerMapping {
  normalizedCause: string
  manner: string
  source: string
  createdAt: string
  actorCount: number
}

export interface MannerMappingsResponse {
  mappings: MannerMapping[]
  totalMapped: number
  totalUnmapped: number
}

export interface Normalization {
  originalCause: string
  normalizedCause: string
  actorCount: number
}

export interface NormalizationsResponse {
  normalizations: Normalization[]
  total: number
}

export interface PreviewEntry {
  normalizedCause: string
  manner: string | null
  currentCategory: string
  proposedCategory: string
  actorCount: number
  changed: boolean
}

export interface PreviewResponse {
  entries: PreviewEntry[]
  summary: {
    totalCauses: number
    changedCauses: number
    totalActorsAffected: number
    movements: Record<string, number>
  }
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchMannerMappings(
  search?: string,
  manner?: string
): Promise<MannerMappingsResponse> {
  const params = new URLSearchParams()
  if (search) params.set("search", search)
  if (manner) params.set("manner", manner)

  const url = params.toString()
    ? adminApi(`/cause-mappings/manner?${params.toString()}`)
    : adminApi("/cause-mappings/manner")

  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) throw new Error("Failed to fetch manner mappings")
  return response.json()
}

async function updateMannerMapping(params: {
  cause: string
  manner: string
}): Promise<{ success: boolean }> {
  const response = await fetch(
    adminApi(`/cause-mappings/manner/${encodeURIComponent(params.cause)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ manner: params.manner }),
    }
  )
  if (!response.ok) throw new Error("Failed to update manner mapping")
  return response.json()
}

async function fetchNormalizations(search?: string): Promise<NormalizationsResponse> {
  const params = new URLSearchParams()
  if (search) params.set("search", search)

  const url = params.toString()
    ? adminApi(`/cause-mappings/normalizations?${params.toString()}`)
    : adminApi("/cause-mappings/normalizations")

  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) throw new Error("Failed to fetch normalizations")
  return response.json()
}

async function updateNormalization(params: {
  originalCause: string
  normalizedCause: string
}): Promise<{ success: boolean }> {
  const response = await fetch(
    adminApi(`/cause-mappings/normalizations/${encodeURIComponent(params.originalCause)}`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ normalizedCause: params.normalizedCause }),
    }
  )
  if (!response.ok) throw new Error("Failed to update normalization")
  return response.json()
}

async function fetchCategoryPreview(changesOnly?: boolean): Promise<PreviewResponse> {
  const params = new URLSearchParams()
  if (changesOnly) params.set("changesOnly", "true")

  const url = params.toString()
    ? adminApi(`/cause-mappings/preview?${params.toString()}`)
    : adminApi("/cause-mappings/preview")

  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) throw new Error("Failed to fetch category preview")
  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

export function useMannerMappings(
  search?: string,
  manner?: string
): UseQueryResult<MannerMappingsResponse> {
  return useQuery({
    queryKey: ["admin", "cause-mappings", "manner", search, manner],
    queryFn: () => fetchMannerMappings(search, manner),
    staleTime: 30000,
  })
}

export function useUpdateMannerMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateMannerMapping,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cause-mappings"] })
    },
  })
}

export function useNormalizations(search?: string): UseQueryResult<NormalizationsResponse> {
  return useQuery({
    queryKey: ["admin", "cause-mappings", "normalizations", search],
    queryFn: () => fetchNormalizations(search),
    staleTime: 30000,
  })
}

export function useUpdateNormalization() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateNormalization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "cause-mappings"] })
    },
  })
}

export function useCategoryPreview(changesOnly?: boolean): UseQueryResult<PreviewResponse> {
  return useQuery({
    queryKey: ["admin", "cause-mappings", "preview", changesOnly],
    queryFn: () => fetchCategoryPreview(changesOnly),
    staleTime: 30000,
  })
}
