import { useQuery } from "@tanstack/react-query"
import { getDeathWatch, type DeathWatchOptions } from "@/services/api"

export function useDeathWatch(options: DeathWatchOptions = {}) {
  return useQuery({
    queryKey: ["death-watch", options],
    queryFn: () => getDeathWatch(options),
    retry: 1,
  })
}
