import { useQuery } from "@tanstack/react-query"

const API_BASE = "/admin/api/popularity"

// Types matching server response
interface PopularityStats {
  actors: {
    total: number
    withScore: number
    avgScore: number
    avgConfidence: number
    highConfidence: number
    lowConfidence: number
  }
  movies: {
    total: number
    withScore: number
    avgScore: number
    avgWeight: number
  }
  shows: {
    total: number
    withScore: number
    avgScore: number
    avgWeight: number
  }
  distribution: Array<{
    bucket: string
    count: number
  }>
}

interface TopActor {
  id: number
  tmdbId: number | null
  name: string
  dofPopularity: number
  confidence: number
  tmdbPopularity: number | null
  deathday: string | null
  profilePath: string | null
}

interface LowConfidenceActor {
  id: number
  tmdbId: number | null
  name: string
  dofPopularity: number
  confidence: number
  tmdbPopularity: number | null
  movieCount: number
  showCount: number
}

interface MissingActor {
  id: number
  tmdbId: number | null
  name: string
  tmdbPopularity: number | null
  movieCount: number
  showCount: number
}

interface MissingActorsResponse {
  totalMissing: number
  actors: MissingActor[]
}

interface PopularityRun {
  id: number
  job_name: string
  started_at: string
  completed_at: string | null
  status: string
  error_message: string | null
  duration_ms: number | null
}

interface LastRunResponse {
  lastRun: PopularityRun | null
  recentRuns: PopularityRun[]
}

async function fetchWithAuth<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`)
  }
  return response.json()
}

export function usePopularityStats() {
  return useQuery({
    queryKey: ["admin", "popularity", "stats"],
    queryFn: () => fetchWithAuth<PopularityStats>(`${API_BASE}/stats`),
  })
}

export function useTopActors(limit = 100, minConfidence = 0.5) {
  return useQuery({
    queryKey: ["admin", "popularity", "top-actors", limit, minConfidence],
    queryFn: () =>
      fetchWithAuth<{ actors: TopActor[] }>(
        `${API_BASE}/top-actors?limit=${limit}&minConfidence=${minConfidence}`
      ),
  })
}

export function useLowConfidenceActors(limit = 100, maxConfidence = 0.3) {
  return useQuery({
    queryKey: ["admin", "popularity", "low-confidence", limit, maxConfidence],
    queryFn: () =>
      fetchWithAuth<{ actors: LowConfidenceActor[] }>(
        `${API_BASE}/low-confidence?limit=${limit}&maxConfidence=${maxConfidence}`
      ),
  })
}

export function useMissingPopularityActors(limit = 100) {
  return useQuery({
    queryKey: ["admin", "popularity", "missing", limit],
    queryFn: () => fetchWithAuth<MissingActorsResponse>(`${API_BASE}/missing?limit=${limit}`),
  })
}

export function usePopularityLastRun() {
  return useQuery({
    queryKey: ["admin", "popularity", "last-run"],
    queryFn: () => fetchWithAuth<LastRunResponse>(`${API_BASE}/last-run`),
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}
