import { useQuery } from "@tanstack/react-query"
import { getFeaturedMovie } from "@/services/api"

export function useFeaturedMovie() {
  return useQuery({
    queryKey: ["featured-movie"],
    queryFn: getFeaturedMovie,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  })
}
