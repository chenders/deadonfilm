/**
 * URL slug generation utilities for actors and movies.
 * Used by both trivia/statistics functions and sitemap generation.
 *
 * Uses the slugify library for proper transliteration and edge case handling.
 */

import slugify from "slugify"

/**
 * Creates a URL-safe slug from a movie title, year, and ID
 * Example: "Breakfast at Tiffany's", 1961, 14629 → "breakfast-at-tiffanys-1961-14629"
 * Example: "Amélie", 2001, 194 → "amelie-2001-194"
 */
export function createMovieSlug(title: string, releaseYear: number | null, tmdbId: number): string {
  const year = releaseYear?.toString() || "unknown"
  const slug = slugify(title, {
    lower: true,
    strict: true, // Strip special characters
    remove: /[*+~.()'"!:@]/g, // Remove specific characters completely
  })

  return `${slug}-${year}-${tmdbId}`
}

/**
 * Creates a URL-safe slug from an actor name and ID
 * Example: "Audrey Hepburn", 10560 → "audrey-hepburn-10560"
 * Example: "José García", 123 → "jose-garcia-123"
 * Example: "François Truffaut", 456 → "francois-truffaut-456"
 */
export function createActorSlug(name: string, id: number): string {
  const slug = slugify(name, {
    lower: true,
    strict: true, // Strip special characters
    remove: /[*+~.()'"!:@]/g, // Remove specific characters completely
  })

  return `${slug}-${id}`
}

/**
 * Creates a URL-safe slug from a TV show name, first air year, and ID
 * Example: "Breaking Bad", 2008, 1396 → "breaking-bad-2008-1396"
 * Example: "Élite", 2018, 76479 → "elite-2018-76479"
 */
export function createShowSlug(name: string, firstAirYear: number | null, tmdbId: number): string {
  const year = firstAirYear?.toString() || "unknown"
  const slug = slugify(name, {
    lower: true,
    strict: true, // Strip special characters
    remove: /[*+~.()'"!:@]/g, // Remove specific characters completely
  })

  return `${slug}-${year}-${tmdbId}`
}
