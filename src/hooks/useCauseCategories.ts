import { useQuery } from "@tanstack/react-query"
import { getCauseCategories } from "@/services/api"

export function useCauseCategories() {
  return useQuery({
    queryKey: ["cause-categories"],
    queryFn: getCauseCategories,
    staleTime: 60 * 60 * 1000, // 1 hour - categories change rarely
  })
}
