import { useQuery } from "@tanstack/react-query"
import { getCovidDeaths } from "@/services/api"

export function useCovidDeaths(page: number = 1) {
  return useQuery({
    queryKey: ["covid-deaths", page],
    queryFn: () => getCovidDeaths(page),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
