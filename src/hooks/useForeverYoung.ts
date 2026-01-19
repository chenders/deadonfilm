import { useQuery } from "@tanstack/react-query"
import { getForeverYoungMovies } from "@/services/api"

export function useForeverYoung(page: number = 1) {
  return useQuery({
    queryKey: ["forever-young", page],
    queryFn: () => getForeverYoungMovies(page),
    retry: 1,
  })
}
