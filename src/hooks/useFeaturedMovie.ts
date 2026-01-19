import { useQuery } from "@tanstack/react-query"
import { getFeaturedMovie } from "@/services/api"

export function useFeaturedMovie() {
  return useQuery({
    queryKey: ["featured-movie"],
    queryFn: getFeaturedMovie,
    retry: 1,
  })
}
