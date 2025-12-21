import { useQuery } from "@tanstack/react-query"
import { getGenreCategories, getMoviesByGenre } from "@/services/api"

export function useGenreCategories() {
  return useQuery({
    queryKey: ["genre-categories"],
    queryFn: getGenreCategories,
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

export function useMoviesByGenre(genreSlug: string, page: number = 1) {
  return useQuery({
    queryKey: ["movies-by-genre", genreSlug, page],
    queryFn: () => getMoviesByGenre(genreSlug, page),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!genreSlug,
  })
}
