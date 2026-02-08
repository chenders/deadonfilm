import { useQuery } from "@tanstack/react-query"
import { getRelatedActors, getRelatedMovies, getRelatedShows } from "@/services/api"

export function useRelatedActors(actorId: number) {
  return useQuery({
    queryKey: ["relatedActors", actorId],
    queryFn: () => getRelatedActors(actorId),
    enabled: actorId > 0,
  })
}

export function useRelatedMovies(movieId: number) {
  return useQuery({
    queryKey: ["relatedMovies", movieId],
    queryFn: () => getRelatedMovies(movieId),
    enabled: movieId > 0,
  })
}

export function useRelatedShows(showId: number) {
  return useQuery({
    queryKey: ["relatedShows", showId],
    queryFn: () => getRelatedShows(showId),
    enabled: showId > 0,
  })
}
