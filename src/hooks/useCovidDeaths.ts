import { useQuery } from "@tanstack/react-query"
import { getCovidDeaths } from "@/services/api"

export interface CovidDeathsOptions {
  page?: number
  includeObscure?: boolean
}

export function useCovidDeaths(options: CovidDeathsOptions = {}) {
  const { page = 1, includeObscure = false } = options

  return useQuery({
    queryKey: ["covid-deaths", page, includeObscure],
    queryFn: () => getCovidDeaths({ page, includeObscure }),
    retry: 1,
  })
}
