import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"
import { adminApi } from "@/services/api"
import { useToast } from "@/contexts/ToastContext"

// ============================================================================
// Types
// ============================================================================

export interface ActorAdminMetadata {
  actorId: number
  biography: {
    hasContent: boolean
    generatedAt: string | null
    sourceType: string | null
  }
  enrichment: {
    enrichedAt: string | null
    source: string | null
    version: string | null
    causeOfDeathSource: string | null
    hasCircumstances: boolean
    circumstancesEnrichedAt: string | null
  }
  dataQuality: {
    hasDetailedDeathInfo: boolean
    isObscure: boolean
    deathdayConfidence: string | null
  }
  adminEditorUrl: string
}

interface EnrichInlineResult {
  success: boolean
  fieldsUpdated: string[]
  sourcesUsed: string[]
  durationMs: number
  message?: string
}

interface EnrichBioInlineResult {
  success: boolean
  enriched: boolean
  message?: string
  data?: {
    narrativeTeaser: string | null
    narrativeConfidence: string | null
    lifeNotableFactors: string[]
    hasSubstantiveContent: boolean
  }
  durationMs: number
  stats: {
    sourcesAttempted: number
    sourcesSucceeded: number
    totalCostUsd: number
    processingTimeMs: number
  }
}

interface GenerateBiographyResult {
  success: boolean
  result: {
    biography: string | null
    hasSubstantiveContent: boolean
    sourceUrl: string | null
    sourceType: string | null
    costUsd?: number
    latencyMs?: number
  }
  message?: string
}

// ============================================================================
// API functions
// ============================================================================

async function fetchActorAdminMetadata(actorId: number): Promise<ActorAdminMetadata> {
  const response = await fetch(adminApi(`/actors/${actorId}/metadata`), {
    credentials: "include",
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      error?: { message?: string }
    }
    throw new Error(errorData.error?.message || "Failed to fetch actor metadata")
  }

  return response.json()
}

async function regenerateBiography(actorId: number): Promise<GenerateBiographyResult> {
  const response = await fetch(adminApi("/biographies/generate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ actorId }),
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(errorData.error?.message || "Failed to generate biography")
  }

  return response.json()
}

async function enrichBioInline(actorId: number): Promise<EnrichBioInlineResult> {
  const response = await fetch(adminApi(`/actors/${actorId}/enrich-bio-inline`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(errorData.error?.message || `HTTP error ${response.status}`)
  }

  return response.json()
}

async function enrichActorInline(actorId: number): Promise<EnrichInlineResult> {
  const response = await fetch(adminApi(`/actors/${actorId}/enrich-inline`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  })

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(errorData.error?.message || "Failed to enrich actor")
  }

  return response.json()
}

// ============================================================================
// Hooks
// ============================================================================

export function useActorAdminMetadata(
  actorId: number,
  enabled: boolean
): UseQueryResult<ActorAdminMetadata> {
  return useQuery({
    queryKey: ["admin", "actor-metadata", actorId],
    queryFn: () => fetchActorAdminMetadata(actorId),
    enabled,
    staleTime: 30000,
  })
}

export function useRegenerateBiography(actorId: number) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: () => regenerateBiography(actorId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["actors"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "actor-metadata", actorId] })
      if (data.result?.hasSubstantiveContent) {
        toast.success("Biography regenerated")
      } else {
        toast.info("No substantial biography available")
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useInlineEnrichDeath(actorId: number) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: () => enrichActorInline(actorId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["actors"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "actor-metadata", actorId] })
      if (data.fieldsUpdated.length > 0) {
        toast.success(`Enriched: ${data.fieldsUpdated.join(", ")}`)
      } else {
        toast.info(data.message || "No new enrichment data found")
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useInlineEnrichBio(actorId: number) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: () => enrichBioInline(actorId),
    onSuccess: (data: EnrichBioInlineResult) => {
      queryClient.invalidateQueries({ queryKey: ["actors"] })
      queryClient.invalidateQueries({ queryKey: ["admin", "actor-metadata", actorId] })
      queryClient.invalidateQueries({ queryKey: ["actor"] })

      if (data.enriched) {
        toast.success(`Biography enriched ($${data.stats.totalCostUsd.toFixed(3)})`)
      } else {
        toast.info(data.message || "No biographical content found")
      }
    },
    onError: (error: Error) => {
      toast.error(`Bio enrichment failed: ${error.message}`)
    },
  })
}
