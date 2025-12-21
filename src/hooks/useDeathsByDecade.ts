import { useQuery } from "@tanstack/react-query"
import { getDeathsByDecade, getDecadeCategories } from "@/services/api"

export function useDecadeCategories() {
  return useQuery({
    queryKey: ["decade-categories"],
    queryFn: getDecadeCategories,
    staleTime: 60 * 60 * 1000, // 1 hour
  })
}

export function useDeathsByDecade(decade: string, page: number = 1) {
  return useQuery({
    queryKey: ["deaths-by-decade", decade, page],
    queryFn: () => getDeathsByDecade(decade, page),
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!decade,
  })
}
