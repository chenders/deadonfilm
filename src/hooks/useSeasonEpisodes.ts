import { useQuery } from "@tanstack/react-query"
import { getSeasonEpisodes } from "@/services/api"

export function useSeasonEpisodes(showId: number, seasonNumber: number | null) {
  return useQuery({
    queryKey: ["seasonEpisodes", showId, seasonNumber],
    queryFn: () => getSeasonEpisodes(showId, seasonNumber!),
    enabled: showId > 0 && seasonNumber !== null && seasonNumber > 0,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  })
}
