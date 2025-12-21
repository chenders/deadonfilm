import { useQuery } from "@tanstack/react-query"
import { getShow } from "@/services/api"

export function useShow(showId: number) {
  return useQuery({
    queryKey: ["shows", showId],
    queryFn: () => getShow(showId),
    enabled: showId > 0,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
  })
}
