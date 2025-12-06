import { useQuery } from "@tanstack/react-query"
import { searchMovies } from "@/services/api"
import { useDebouncedValue } from "./useDebouncedValue"

export function useMovieSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query, 300)

  return useQuery({
    queryKey: ["movies", "search", debouncedQuery],
    queryFn: () => searchMovies(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    placeholderData: (previousData) => previousData,
  })
}
