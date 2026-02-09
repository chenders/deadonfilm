import { useQuery } from "@tanstack/react-query"
import { getForeverYoungMovies } from "@/services/api"

export function useForeverYoung(page: number = 1, sort?: string, dir?: string) {
  return useQuery({
    queryKey: ["forever-young", page, sort, dir],
    queryFn: () => getForeverYoungMovies(page, sort, dir),
    retry: 1,
  })
}
