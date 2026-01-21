import { useQuery } from "@tanstack/react-query"
import { getTrivia } from "@/services/api"

export function useTrivia() {
  return useQuery({
    queryKey: ["trivia"],
    queryFn: getTrivia,
    retry: 1,
  })
}
