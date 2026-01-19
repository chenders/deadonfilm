import { useQuery } from "@tanstack/react-query"
import { getDeathsByDecade, getDecadeCategories } from "@/services/api"

export function useDecadeCategories() {
  return useQuery({
    queryKey: ["decade-categories"],
    queryFn: getDecadeCategories,
  })
}

export interface DeathsByDecadeOptions {
  page?: number
  includeObscure?: boolean
}

export function useDeathsByDecade(decade: string, options: DeathsByDecadeOptions = {}) {
  const { page = 1, includeObscure = false } = options

  return useQuery({
    queryKey: ["deaths-by-decade", decade, page, includeObscure],
    queryFn: () => getDeathsByDecade(decade, { page, includeObscure }),
    enabled: !!decade,
  })
}
