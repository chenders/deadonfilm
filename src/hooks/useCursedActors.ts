import { useQuery } from "@tanstack/react-query"
import { getCursedActors, type CursedActorsOptions } from "@/services/api"

export function useCursedActors(options: CursedActorsOptions = {}) {
  return useQuery({
    queryKey: ["cursed-actors", options],
    queryFn: () => getCursedActors(options),
    retry: 1,
  })
}
