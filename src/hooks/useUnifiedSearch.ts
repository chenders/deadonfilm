import { useQuery } from "@tanstack/react-query"
import { searchAll } from "@/services/api"
import { useDebouncedValue } from "./useDebouncedValue"
import type { SearchMediaType } from "@/types"

export function useUnifiedSearch(query: string, mediaType: SearchMediaType = "all") {
  const debouncedQuery = useDebouncedValue(query, 300)

  return useQuery({
    queryKey: ["search", "unified", debouncedQuery, mediaType],
    queryFn: () => searchAll(debouncedQuery, mediaType),
    enabled: debouncedQuery.length >= 2,
    placeholderData: (previousData) => previousData,
  })
}
