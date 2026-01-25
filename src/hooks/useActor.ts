import { useQuery } from "@tanstack/react-query"
import { getActor } from "@/services/api"

export function useActor(slug: string) {
  return useQuery({
    queryKey: ["actors", slug],
    queryFn: () => getActor(slug),
    enabled: !!slug,
  })
}
