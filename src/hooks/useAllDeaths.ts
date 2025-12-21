import { useQuery } from "@tanstack/react-query"
import { getAllDeaths } from "@/services/api"

export function useAllDeaths(page: number = 1) {
  return useQuery({
    queryKey: ["all-deaths", page],
    queryFn: () => getAllDeaths(page),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
