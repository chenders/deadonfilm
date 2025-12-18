import { useQuery } from "@tanstack/react-query"
import { getForeverYoungMovies } from "@/services/api"

export function useForeverYoung(page: number = 1) {
  return useQuery({
    queryKey: ["forever-young", page],
    queryFn: () => getForeverYoungMovies(page),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  })
}
