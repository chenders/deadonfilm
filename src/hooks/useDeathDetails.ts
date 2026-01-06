import { useQuery } from "@tanstack/react-query"
import { getActorDeathDetails, getNotableDeaths, type NotableDeathsParams } from "@/services/api"

/**
 * Hook to fetch detailed death circumstances for an actor
 */
export function useActorDeathDetails(actorId: number) {
  return useQuery({
    queryKey: ["actor-death-details", actorId],
    queryFn: () => getActorDeathDetails(actorId),
    enabled: actorId > 0,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  })
}

/**
 * Hook to fetch paginated list of actors with notable death information
 */
export function useNotableDeaths(params: NotableDeathsParams = {}) {
  const { page = 1, pageSize = 50, filter = "all", includeObscure = false } = params

  return useQuery({
    queryKey: ["notable-deaths", page, pageSize, filter, includeObscure],
    queryFn: () => getNotableDeaths({ page, pageSize, filter, includeObscure }),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
}
