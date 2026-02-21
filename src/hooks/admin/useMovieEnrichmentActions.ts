import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "@/services/api"
import { useToast } from "@/contexts/ToastContext"

// ============================================================================
// Types
// ============================================================================

interface EnrichmentStatusResponse {
  totalDeceased: number
  needsBioEnrichment: number[]
  needsDeathEnrichment: number[]
}

interface BatchEnrichResult {
  success: boolean
  actorCount: number
  jobId?: string
  runId?: number
  message?: string
}

// ============================================================================
// API functions
// ============================================================================

async function fetchEnrichmentStatus(
  movieTmdbId: number,
  tmdbIds: number[]
): Promise<EnrichmentStatusResponse> {
  const response = await fetch(
    adminApi(`/movies/${movieTmdbId}/enrichment-status?tmdbIds=${tmdbIds.join(",")}`),
    { credentials: "include" }
  )

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(errorData.error?.message || "Failed to fetch enrichment status")
  }

  return response.json()
}

async function batchEnrichBios(movieTmdbId: number, tmdbIds: number[]): Promise<BatchEnrichResult> {
  const response = await fetch(adminApi(`/movies/${movieTmdbId}/enrich-bios`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tmdbIds }),
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(errorData.error?.message || `HTTP error ${response.status}`)
  }

  return response.json()
}

async function batchEnrichDeaths(
  movieTmdbId: number,
  tmdbIds: number[]
): Promise<BatchEnrichResult> {
  const response = await fetch(adminApi(`/movies/${movieTmdbId}/enrich-deaths`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ tmdbIds }),
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(errorData.error?.message || `HTTP error ${response.status}`)
  }

  return response.json()
}

// ============================================================================
// Hooks
// ============================================================================

export function useMovieEnrichmentStatus(movieTmdbId: number, deceasedTmdbIds: number[]) {
  return useQuery({
    queryKey: ["admin", "movie-enrichment-status", movieTmdbId],
    queryFn: () => fetchEnrichmentStatus(movieTmdbId, deceasedTmdbIds),
    enabled: deceasedTmdbIds.length > 0,
    staleTime: 30000,
  })
}

export function useMovieBatchEnrichBios(movieTmdbId: number, deceasedTmdbIds: number[]) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: () => batchEnrichBios(movieTmdbId, deceasedTmdbIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["movie", movieTmdbId] })
      queryClient.invalidateQueries({ queryKey: ["admin", "movie-enrichment-status", movieTmdbId] })

      if (data.actorCount > 0) {
        toast.success(
          `Bio enrichment queued for ${data.actorCount} actor${data.actorCount === 1 ? "" : "s"}`
        )
      } else {
        toast.info(data.message || "All actors already enriched")
      }
    },
    onError: (error: Error) => {
      toast.error(`Bio enrichment failed: ${error.message}`)
    },
  })
}

export function useMovieBatchEnrichDeaths(movieTmdbId: number, deceasedTmdbIds: number[]) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: () => batchEnrichDeaths(movieTmdbId, deceasedTmdbIds),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["movie", movieTmdbId] })
      queryClient.invalidateQueries({ queryKey: ["admin", "movie-enrichment-status", movieTmdbId] })

      if (data.actorCount > 0) {
        toast.success(
          `Death enrichment started for ${data.actorCount} actor${data.actorCount === 1 ? "" : "s"}`
        )
      } else {
        toast.info(data.message || "All actors already enriched")
      }
    },
    onError: (error: Error) => {
      toast.error(`Death enrichment failed: ${error.message}`)
    },
  })
}
