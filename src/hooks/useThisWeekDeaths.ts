import { useQuery } from "@tanstack/react-query"
import { getThisWeekDeaths } from "@/services/api"

export function useThisWeekDeaths() {
  return useQuery({
    queryKey: ["this-week-deaths"],
    queryFn: getThisWeekDeaths,
    staleTime: 30 * 60 * 1000, // 30 minutes - deaths are relatively static
    retry: 1,
  })
}
