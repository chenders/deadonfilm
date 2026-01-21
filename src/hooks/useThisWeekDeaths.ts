import { useQuery } from "@tanstack/react-query"
import { getThisWeekDeaths } from "@/services/api"

export function useThisWeekDeaths() {
  return useQuery({
    queryKey: ["this-week-deaths"],
    queryFn: getThisWeekDeaths,
    retry: 1,
  })
}
