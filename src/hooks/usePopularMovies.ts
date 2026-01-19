import { useQuery } from "@tanstack/react-query"
import { getPopularMovies } from "@/services/api"

export function usePopularMovies(limit: number = 10) {
  return useQuery({
    queryKey: ["popular-movies", limit],
    queryFn: () => getPopularMovies(limit),
    retry: 1,
  })
}
