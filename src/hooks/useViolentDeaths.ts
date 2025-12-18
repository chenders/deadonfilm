import { useQuery } from "@tanstack/react-query"
import { getViolentDeaths } from "@/services/api"

export function useViolentDeaths(page: number = 1) {
  return useQuery({
    queryKey: ["violent-deaths", page],
    queryFn: () => getViolentDeaths(page),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
