/**
 * React Query hook for searching actors by name in the admin coverage API.
 */

import { useQuery } from "@tanstack/react-query"

export interface ActorSearchResult {
  id: number
  name: string
  popularity: number | null
  tmdb_id?: number | null
}

/**
 * Fetches actors matching a search query.
 *
 * @param query - Search query string (minimum 2 characters)
 * @returns Query result with matching actors
 */
export function useActorSearch(query: string) {
  return useQuery({
    queryKey: ["admin", "actor-search", query],
    queryFn: async (): Promise<ActorSearchResult[]> => {
      if (!query || query.length < 2) return []

      const params = new URLSearchParams({
        searchName: query,
        limit: "10",
      })

      const response = await fetch(`/admin/api/coverage/actors?${params.toString()}`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to search actors")
      }

      const data = await response.json()

      // The coverage API returns { items: ActorSearchResult[], total: number }
      return data.items as ActorSearchResult[]
    },
    enabled: query.length >= 2,
    staleTime: 30000, // 30 seconds
  })
}
