import { useQuery } from "@tanstack/react-query"
import { getSiteStats } from "@/services/api"

export function useSiteStats() {
  return useQuery({
    queryKey: ["site-stats"],
    queryFn: getSiteStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
