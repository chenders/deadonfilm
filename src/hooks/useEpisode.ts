import { useQuery } from "@tanstack/react-query"
import { getEpisode } from "@/services/api"

export function useEpisode(showId: number, seasonNumber: number, episodeNumber: number) {
  return useQuery({
    queryKey: ["episode", showId, seasonNumber, episodeNumber],
    queryFn: () => getEpisode(showId, seasonNumber, episodeNumber),
    enabled: showId > 0 && seasonNumber > 0 && episodeNumber > 0,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  })
}
