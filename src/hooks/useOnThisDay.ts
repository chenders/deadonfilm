import { useQuery } from "@tanstack/react-query"
import { getOnThisDay } from "@/services/api"

export function useOnThisDay() {
  return useQuery({
    queryKey: ["on-this-day"],
    queryFn: getOnThisDay,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 1,
  })
}
