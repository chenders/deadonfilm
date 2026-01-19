import { useQuery } from "@tanstack/react-query"
import { getDeathsByCause } from "@/services/api"

export interface DeathsByCauseOptions {
  page?: number
  includeObscure?: boolean
}

export function useDeathsByCause(causeSlug: string, options: DeathsByCauseOptions = {}) {
  const { page = 1, includeObscure = false } = options

  return useQuery({
    queryKey: ["deaths-by-cause", causeSlug, page, includeObscure],
    queryFn: () => getDeathsByCause(causeSlug, { page, includeObscure }),
    enabled: !!causeSlug,
  })
}
