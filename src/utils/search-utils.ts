import type { UnifiedSearchResult, SearchMediaType } from "@/types"

export function getMediaBadge(mediaType: "movie" | "tv" | "person") {
  switch (mediaType) {
    case "tv":
      return { label: "TV", className: "bg-living/20 text-living-dark" }
    case "person":
      return { label: "Person", className: "bg-brown-medium/15 text-brown-medium" }
    default:
      return { label: "Film", className: "bg-brown-medium/10 text-brown-medium" }
  }
}

export function getPersonSubtitle(result: UnifiedSearchResult): string {
  if (result.is_deceased && result.death_year && result.birth_year) {
    const age = result.death_year - result.birth_year
    return `Died ${result.death_year} (age ${age})`
  }
  if (result.is_deceased && result.death_year) {
    return `Died ${result.death_year}`
  }
  if (result.birth_year) {
    return `b. ${result.birth_year}`
  }
  return ""
}

export function isValidMediaType(value: string | null): value is SearchMediaType {
  return value === "all" || value === "movie" || value === "tv" || value === "person"
}
