import { useQuery } from "@tanstack/react-query"
import { getInDetailActors, type InDetailParams } from "@/services/api"

/**
 * Hook to fetch paginated list of actors with thoroughly researched death information
 */
export function useInDetail(params: InDetailParams = {}) {
  const { page = 1, search, sort, dir } = params

  return useQuery({
    queryKey: ["in-detail", page, search, sort, dir],
    queryFn: () => getInDetailActors({ page, search, sort, dir }),
  })
}
