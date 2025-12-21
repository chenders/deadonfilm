import { useQuery } from "@tanstack/react-query"
import { getPopularMovies } from "@/services/api"

export function usePopularMovies(limit: number = 10) {
  return useQuery({
    queryKey: ["popular-movies", limit],
    queryFn: () => getPopularMovies(limit),
    staleTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
  })
}
