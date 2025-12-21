import { useQuery } from "@tanstack/react-query"
import { getUnnaturalDeaths, type UnnaturalDeathsParams } from "@/services/api"

export function useUnnaturalDeaths(params: UnnaturalDeathsParams = {}) {
  const { page = 1, category = "all", hideSuicides = false } = params

  return useQuery({
    queryKey: ["unnatural-deaths", page, category, hideSuicides],
    queryFn: () => getUnnaturalDeaths({ page, category, hideSuicides }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
