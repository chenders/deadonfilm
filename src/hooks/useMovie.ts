import { useQuery } from "@tanstack/react-query"
import { getMovie } from "@/services/api"

export function useMovie(movieId: number) {
  return useQuery({
    queryKey: ["movies", movieId],
    queryFn: () => getMovie(movieId),
    enabled: movieId > 0,
  })
}
