import { useQuery } from "@tanstack/react-query"
import { getAllDeaths } from "@/services/api"

export interface AllDeathsOptions {
  page?: number
  includeObscure?: boolean
  search?: string
}

export function useAllDeaths(options: AllDeathsOptions = {}) {
  const { page = 1, includeObscure = false, search } = options

  return useQuery({
    queryKey: ["all-deaths", page, includeObscure, search],
    queryFn: () => getAllDeaths({ page, includeObscure, search }),
    retry: 1,
  })
}
