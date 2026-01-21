import { useQuery } from "@tanstack/react-query"
import { getRecentDeaths } from "@/services/api"

export function useRecentDeaths(limit: number = 5) {
  return useQuery({
    queryKey: ["recent-deaths", limit],
    queryFn: () => getRecentDeaths(limit),
    retry: 1,
  })
}
