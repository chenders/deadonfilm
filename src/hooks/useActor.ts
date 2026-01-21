import { useQuery } from "@tanstack/react-query"
import { getActor } from "@/services/api"

export function useActor(actorId: number) {
  return useQuery({
    queryKey: ["actors", actorId],
    queryFn: () => getActor(actorId),
    enabled: actorId > 0,
  })
}
