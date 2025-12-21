import { useQuery } from "@tanstack/react-query"
import { getDeathsByCause } from "@/services/api"

export function useDeathsByCause(causeSlug: string, page: number = 1) {
  return useQuery({
    queryKey: ["deaths-by-cause", causeSlug, page],
    queryFn: () => getDeathsByCause(causeSlug, page),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!causeSlug,
  })
}
