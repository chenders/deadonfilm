/**
 * React Query hooks for admin actor editor.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"

// ============================================================================
// Types
// ============================================================================

export interface ActorData {
  id: number
  tmdb_id: number | null
  name: string
  birthday: string | null
  deathday: string | null
  profile_path: string | null
  fallback_profile_url: string | null
  tmdb_popularity: string | null
  cause_of_death: string | null
  cause_of_death_source: string | null
  cause_of_death_details: string | null
  cause_of_death_details_source: string | null
  wikipedia_url: string | null
  age_at_death: number | null
  expected_lifespan: string | null
  years_lost: string | null
  violent_death: boolean | null
  created_at: string
  updated_at: string
  is_obscure: boolean
  tvmaze_person_id: number | null
  thetvdb_person_id: number | null
  imdb_person_id: string | null
  birthday_precision: string | null
  deathday_precision: string | null
  cause_of_death_checked_at: string | null
  death_manner: string | null
  death_categories: string[] | null
  covid_related: boolean | null
  strange_death: boolean | null
  has_detailed_death_info: boolean | null
  deathday_confidence: string | null
  deathday_verification_source: string | null
  deathday_verified_at: string | null
  enriched_at: string | null
  enrichment_source: string | null
  enrichment_version: string | null
  details_fetch_attempts: number
  details_last_fetch_attempt: string | null
  details_fetch_error: string | null
  details_permanently_failed: boolean
  dof_popularity: string | null
  dof_popularity_confidence: string | null
  dof_popularity_updated_at: string | null
}

export interface CircumstancesData {
  id: number
  actor_id: number
  circumstances: string | null
  circumstances_confidence: string | null
  rumored_circumstances: string | null
  cause_confidence: string | null
  details_confidence: string | null
  birthday_confidence: string | null
  deathday_confidence: string | null
  location_of_death: string | null
  last_project: Record<string, unknown> | null
  career_status_at_death: string | null
  posthumous_releases: Record<string, unknown>[] | null
  related_celebrity_ids: number[] | null
  related_celebrities: Record<string, unknown>[] | null
  additional_context: string | null
  notable_factors: string[] | null
  sources: Record<string, unknown>[] | null
  raw_response: Record<string, unknown> | null
  created_at: string
  updated_at: string
  related_deaths: string | null
  enriched_at: string | null
  enrichment_source: string | null
  enrichment_version: string | null
  entity_links: Record<string, unknown> | null
}

export interface DataQualityIssue {
  field: string
  issue: string
  severity: "warning" | "error"
}

export interface FieldChange {
  field_name: string
  old_value: string | null
  new_value: string | null
  source: string
  created_at: string
}

export interface ActorEditorData {
  actor: ActorData
  circumstances: CircumstancesData | null
  dataQualityIssues: DataQualityIssue[]
  recentHistory: FieldChange[]
  editableFields: {
    actor: string[]
    circumstances: string[]
  }
}

export interface UpdateActorRequest {
  actor?: Record<string, unknown>
  circumstances?: Record<string, unknown>
}

export interface UpdateActorResponse {
  success: boolean
  snapshotId: number
  batchId: string
  changes: Array<{
    table: string
    field: string
    oldValue: unknown
    newValue: unknown
  }>
  actor: ActorData
  circumstances: CircumstancesData | null
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchActorForEditing(actorId: number): Promise<ActorEditorData> {
  const response = await fetch(`/admin/api/actors/${actorId}`, {
    credentials: "include",
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to fetch actor" } }))
    throw new Error(error.error?.message || "Failed to fetch actor")
  }

  return response.json()
}

async function updateActor(
  actorId: number,
  data: UpdateActorRequest
): Promise<UpdateActorResponse> {
  const response = await fetch(`/admin/api/actors/${actorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: { message: "Failed to update actor" } }))
    throw new Error(error.error?.message || "Failed to update actor")
  }

  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch actor data for editing.
 */
export function useActorForEditing(actorId: number | undefined): UseQueryResult<ActorEditorData> {
  return useQuery({
    queryKey: ["admin", "actor", "editor", actorId],
    queryFn: () => fetchActorForEditing(actorId!),
    enabled: !!actorId,
    staleTime: 0, // Editor views should always refetch for immediate consistency
  })
}

/**
 * Mutation hook to update actor fields.
 */
export function useUpdateActor(actorId: number | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateActorRequest) => updateActor(actorId!, data),
    onSuccess: (response) => {
      // Update the cached data with the response
      queryClient.setQueryData(
        ["admin", "actor", "editor", actorId],
        (oldData: ActorEditorData | undefined) => {
          if (!oldData) return oldData
          return {
            ...oldData,
            actor: response.actor,
            circumstances: response.circumstances,
          }
        }
      )

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["admin", "actor", "editor", actorId] })
      queryClient.invalidateQueries({ queryKey: ["actor", actorId] })
    },
  })
}

/**
 * Combined hook for the actor editor that provides both data and mutations.
 */
export function useActorEditor(actorId: number | undefined) {
  const query = useActorForEditing(actorId)
  const mutation = useUpdateActor(actorId)

  return {
    // Query state
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    // Mutation
    updateActor: mutation.mutate,
    updateActorAsync: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    updateError: mutation.error,
    lastUpdateResult: mutation.data,

    // Convenience getters
    actor: query.data?.actor,
    circumstances: query.data?.circumstances,
    dataQualityIssues: query.data?.dataQualityIssues ?? [],
    recentHistory: query.data?.recentHistory ?? [],
    editableFields: query.data?.editableFields ?? { actor: [], circumstances: [] },
  }
}
