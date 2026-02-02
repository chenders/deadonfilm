/**
 * React Query hooks for admin death detail coverage management.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query"

// ============================================================================
// Types
// ============================================================================

export interface CoverageStats {
  total_deceased_actors: number
  actors_with_death_pages: number
  actors_without_death_pages: number
  coverage_percentage: number
  enrichment_candidates_count: number
  high_priority_count: number
}

export interface ActorCoverageInfo {
  id: number
  name: string
  tmdb_id: number | null
  deathday: string | null
  popularity: number
  has_detailed_death_info: boolean
  enriched_at: string | null
  age_at_death: number | null
  cause_of_death: string | null
}

export interface CoverageTrendPoint {
  captured_at: string
  total_deceased_actors: number
  actors_with_death_pages: number
  actors_without_death_pages: number
  coverage_percentage: number
  enrichment_candidates_count: number
  high_priority_count: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ActorCoverageFilters {
  hasDeathPage?: boolean
  minPopularity?: number
  maxPopularity?: number
  deathDateStart?: string
  deathDateEnd?: string
  searchName?: string
  causeOfDeath?: string
  orderBy?: "death_date" | "popularity" | "name" | "enriched_at"
  orderDirection?: "asc" | "desc"
}

export interface CauseOfDeathOption {
  value: string
  label: string
  count: number
}

export interface ActorPreviewMovie {
  title: string
  releaseYear: number | null
  character: string | null
  popularity: number
}

export interface ActorPreviewShow {
  name: string
  firstAirYear: number | null
  character: string | null
  episodeCount: number
}

export interface ActorPreviewData {
  topMovies: ActorPreviewMovie[]
  topShows: ActorPreviewShow[]
  totalMovies: number
  totalShows: number
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchCoverageStats(): Promise<CoverageStats> {
  const response = await fetch("/admin/api/coverage/stats", {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch coverage stats")
  }

  return response.json()
}

async function fetchActorsForCoverage(
  page: number,
  pageSize: number,
  filters: ActorCoverageFilters
): Promise<PaginatedResult<ActorCoverageInfo>> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  })

  if (filters.hasDeathPage !== undefined) {
    params.append("hasDeathPage", filters.hasDeathPage.toString())
  }
  if (filters.minPopularity !== undefined) {
    params.append("minPopularity", filters.minPopularity.toString())
  }
  if (filters.maxPopularity !== undefined) {
    params.append("maxPopularity", filters.maxPopularity.toString())
  }
  if (filters.deathDateStart) {
    params.append("deathDateStart", filters.deathDateStart)
  }
  if (filters.deathDateEnd) {
    params.append("deathDateEnd", filters.deathDateEnd)
  }
  if (filters.searchName) {
    params.append("searchName", filters.searchName)
  }
  if (filters.orderBy) {
    params.append("orderBy", filters.orderBy)
  }
  if (filters.orderDirection) {
    params.append("orderDirection", filters.orderDirection)
  }
  if (filters.causeOfDeath) {
    params.append("causeOfDeath", filters.causeOfDeath)
  }

  const response = await fetch(`/admin/api/coverage/actors?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch actors for coverage")
  }

  return response.json()
}

async function fetchCoverageTrends(
  startDate: string,
  endDate: string,
  granularity: "daily" | "weekly" | "monthly"
): Promise<CoverageTrendPoint[]> {
  const params = new URLSearchParams({
    startDate,
    endDate,
    granularity,
  })

  const response = await fetch(`/admin/api/coverage/trends?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch coverage trends")
  }

  return response.json()
}

async function fetchCausesOfDeath(): Promise<CauseOfDeathOption[]> {
  const response = await fetch("/admin/api/coverage/causes", {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch causes of death")
  }

  return response.json()
}

async function fetchActorPreview(actorId: number): Promise<ActorPreviewData> {
  const response = await fetch(`/admin/api/coverage/actors/${actorId}/preview`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch actor preview")
  }

  return response.json()
}

async function fetchEnrichmentCandidates(
  minPopularity: number = 5,
  limit: number = 100
): Promise<ActorCoverageInfo[]> {
  const params = new URLSearchParams({
    minPopularity: minPopularity.toString(),
    limit: limit.toString(),
  })

  const response = await fetch(`/admin/api/coverage/enrichment-candidates?${params.toString()}`, {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error("Failed to fetch enrichment candidates")
  }

  return response.json()
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to fetch real-time coverage statistics.
 */
export function useCoverageStats(): UseQueryResult<CoverageStats> {
  return useQuery({
    queryKey: ["admin", "coverage", "stats"],
    queryFn: fetchCoverageStats,
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Hook to fetch paginated actor list with filtering.
 */
export function useActorsForCoverage(
  page: number,
  pageSize: number,
  filters: ActorCoverageFilters = {}
): UseQueryResult<PaginatedResult<ActorCoverageInfo>> {
  return useQuery({
    queryKey: ["admin", "coverage", "actors", page, pageSize, filters],
    queryFn: () => fetchActorsForCoverage(page, pageSize, filters),
    staleTime: 120000, // 2 minutes
  })
}

/**
 * Hook to fetch historical coverage trends.
 */
export function useCoverageTrends(
  startDate: string,
  endDate: string,
  granularity: "daily" | "weekly" | "monthly" = "daily"
): UseQueryResult<CoverageTrendPoint[]> {
  return useQuery({
    queryKey: ["admin", "coverage", "trends", startDate, endDate, granularity],
    queryFn: () => fetchCoverageTrends(startDate, endDate, granularity),
    staleTime: 900000, // 15 minutes
  })
}

/**
 * Hook to fetch high-priority enrichment candidates.
 */
export function useEnrichmentCandidates(
  minPopularity: number = 5,
  limit: number = 100
): UseQueryResult<ActorCoverageInfo[]> {
  return useQuery({
    queryKey: ["admin", "coverage", "candidates", minPopularity, limit],
    queryFn: () => fetchEnrichmentCandidates(minPopularity, limit),
    staleTime: 300000, // 5 minutes
  })
}

/**
 * Hook to fetch distinct causes of death for filtering.
 */
export function useCausesOfDeath(): UseQueryResult<CauseOfDeathOption[]> {
  return useQuery({
    queryKey: ["admin", "coverage", "causes"],
    queryFn: fetchCausesOfDeath,
    staleTime: 900000, // 15 minutes
  })
}

/**
 * Hook to fetch actor preview data for hover card.
 * Only fetches when actorId is provided (non-null).
 */
export function useActorPreview(actorId: number | null): UseQueryResult<ActorPreviewData> {
  return useQuery({
    queryKey: ["admin", "coverage", "actor-preview", actorId],
    queryFn: () => fetchActorPreview(actorId!),
    enabled: actorId !== null,
    staleTime: 300000, // 5 minutes
  })
}
