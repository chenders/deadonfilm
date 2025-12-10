import { useQuery } from "@tanstack/react-query"
import { getCursedMovies } from "@/services/api"

export function useCursedMovies(limit: number = 50) {
  return useQuery({
    queryKey: ["cursed-movies", limit],
    queryFn: () => getCursedMovies(limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
