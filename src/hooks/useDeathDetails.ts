import { useQuery } from "@tanstack/react-query"
import { getActorDeathDetails, getNotableDeaths, type NotableDeathsParams } from "@/services/api"

/**
 * Hook to fetch detailed death circumstances for an actor
 */
export function useActorDeathDetails(slug: string) {
  return useQuery({
    queryKey: ["actor-death-details", slug],
    queryFn: () => getActorDeathDetails(slug),
    enabled: !!slug,
  })
}

/**
 * Hook to fetch paginated list of actors with notable death information
 */
export function useNotableDeaths(params: NotableDeathsParams = {}) {
  const { page = 1, pageSize = 50, filter = "all", includeObscure = false, sort, dir } = params

  return useQuery({
    queryKey: ["notable-deaths", page, pageSize, filter, includeObscure, sort, dir],
    queryFn: () => getNotableDeaths({ page, pageSize, filter, includeObscure, sort, dir }),
  })
}
