import { useQuery } from "@tanstack/react-query"
import { getOnThisDay } from "@/services/api"

export function useOnThisDay() {
  return useQuery({
    queryKey: ["on-this-day"],
    queryFn: getOnThisDay,
    retry: 1,
  })
}
