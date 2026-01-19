import { useQuery } from "@tanstack/react-query"
import { getSiteStats } from "@/services/api"

export function useSiteStats() {
  return useQuery({
    queryKey: ["site-stats"],
    queryFn: getSiteStats,
    retry: 1,
  })
}
