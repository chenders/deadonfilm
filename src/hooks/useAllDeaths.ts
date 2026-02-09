import { useQuery } from "@tanstack/react-query"
import { getAllDeaths } from "@/services/api"

export interface AllDeathsOptions {
  page?: number
  includeObscure?: boolean
  search?: string
  sort?: string
  dir?: string
}

export function useAllDeaths(options: AllDeathsOptions = {}) {
  const { page = 1, includeObscure = false, search, sort, dir } = options

  return useQuery({
    queryKey: ["all-deaths", page, includeObscure, search, sort, dir],
    queryFn: () => getAllDeaths({ page, includeObscure, search, sort, dir }),
    retry: 1,
  })
}
