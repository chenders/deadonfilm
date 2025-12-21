import { useQuery } from "@tanstack/react-query"
import { getTrivia } from "@/services/api"

export function useTrivia() {
  return useQuery({
    queryKey: ["trivia"],
    queryFn: getTrivia,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  })
}
