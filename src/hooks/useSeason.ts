import { useQuery } from "@tanstack/react-query"
import { getSeason } from "@/services/api"

export function useSeason(showId: number, seasonNumber: number) {
  return useQuery({
    queryKey: ["season", showId, seasonNumber],
    queryFn: () => getSeason(showId, seasonNumber),
    enabled: showId > 0 && seasonNumber > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}
