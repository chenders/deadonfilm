import { useQuery } from "@tanstack/react-query"
import { getRecentDeaths } from "@/services/api"

export function useRecentDeaths(limit: number = 5) {
  return useQuery({
    queryKey: ["recent-deaths", limit],
    queryFn: () => getRecentDeaths(limit),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  })
}
