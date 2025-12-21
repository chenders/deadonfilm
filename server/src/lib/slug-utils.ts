/**
 * URL slug generation utilities for actors and movies.
 * Used by both trivia/statistics functions and sitemap generation.
 */

/**
 * Creates a URL-safe slug from a movie title, year, and ID
 * Example: "Breakfast at Tiffany's", 1961, 14629 → "breakfast-at-tiffanys-1961-14629"
 */
export function createMovieSlug(title: string, releaseYear: number | null, tmdbId: number): string {
  const year = releaseYear?.toString() || "unknown"
  const slug = title
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove apostrophes (straight, modifier, curly)
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

  return `${slug}-${year}-${tmdbId}`
}

/**
 * Creates a URL-safe slug from an actor name and ID
 * Example: "Audrey Hepburn", 10560 → "audrey-hepburn-10560"
 */
export function createActorSlug(name: string, tmdbId: number): string {
  const slug = name
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove apostrophes (straight, modifier, curly)
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

  return `${slug}-${tmdbId}`
}

/**
 * Creates a URL-safe slug from a TV show name, first air year, and ID
 * Example: "Breaking Bad", 2008, 1396 → "breaking-bad-2008-1396"
 */
export function createShowSlug(name: string, firstAirYear: number | null, tmdbId: number): string {
  const year = firstAirYear?.toString() || "unknown"
  const slug = name
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove apostrophes (straight, modifier, curly)
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

  return `${slug}-${year}-${tmdbId}`
}
