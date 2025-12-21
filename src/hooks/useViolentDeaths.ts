import { useQuery } from "@tanstack/react-query"
import { getViolentDeaths } from "@/services/api"

export interface UseViolentDeathsOptions {
  page?: number
  includeSelfInflicted?: boolean
}

export function useViolentDeaths(options: UseViolentDeathsOptions = {}) {
  const { page = 1, includeSelfInflicted = false } = options

  return useQuery({
    queryKey: ["violent-deaths", page, includeSelfInflicted],
    queryFn: () => getViolentDeaths({ page, includeSelfInflicted }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
