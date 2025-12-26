import { useQuery } from "@tanstack/react-query"
import { getAllDeaths } from "@/services/api"

export interface AllDeathsOptions {
  page?: number
  includeObscure?: boolean
}

export function useAllDeaths(options: AllDeathsOptions = {}) {
  const { page = 1, includeObscure = false } = options

  return useQuery({
    queryKey: ["all-deaths", page, includeObscure],
    queryFn: () => getAllDeaths({ page, includeObscure }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
