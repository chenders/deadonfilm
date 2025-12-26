import { useQuery } from "@tanstack/react-query"
import { getUnnaturalDeaths, type UnnaturalDeathsParams } from "@/services/api"

export interface UnnaturalDeathsOptions {
  page?: number
  category?: UnnaturalDeathsParams["category"]
  showSelfInflicted?: boolean
  includeObscure?: boolean
}

export function useUnnaturalDeaths(options: UnnaturalDeathsOptions = {}) {
  const { page = 1, category = "all", showSelfInflicted = false, includeObscure = false } = options

  return useQuery({
    queryKey: ["unnatural-deaths", page, category, showSelfInflicted, includeObscure],
    queryFn: () => getUnnaturalDeaths({ page, category, showSelfInflicted, includeObscure }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
