import { useQuery } from "@tanstack/react-query"
import { getGenreCategories, getMoviesByGenre } from "@/services/api"

export function useGenreCategories() {
  return useQuery({
    queryKey: ["genre-categories"],
    queryFn: getGenreCategories,
  })
}

export function useMoviesByGenre(genreSlug: string, page: number = 1) {
  return useQuery({
    queryKey: ["movies-by-genre", genreSlug, page],
    queryFn: () => getMoviesByGenre(genreSlug, page),
    enabled: !!genreSlug,
  })
}
