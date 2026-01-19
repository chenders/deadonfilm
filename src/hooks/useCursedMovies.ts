import { useQuery } from "@tanstack/react-query"
import { getCursedMovies, type CursedMoviesOptions } from "@/services/api"

export function useCursedMovies(options: CursedMoviesOptions = {}) {
  return useQuery({
    queryKey: ["cursed-movies", options],
    queryFn: () => getCursedMovies(options),
    retry: 1,
  })
}
