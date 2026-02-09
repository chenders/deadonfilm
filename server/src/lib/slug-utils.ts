/**
 * URL slug generation utilities for actors, movies, shows, and episodes.
 * Used by both trivia/statistics functions, sitemap generation, and prerender.
 *
 * Uses the slugify library for proper transliteration and edge case handling.
 */

import slugify from "slugify"

const SLUGIFY_OPTIONS = {
  lower: true,
  strict: true, // Strip special characters
  remove: /[*+~.()'"!:@]/g, // Remove specific characters completely
} as const

/**
 * Creates a URL-safe slug from a movie title, year, and ID
 * Example: "Breakfast at Tiffany's", 1961, 14629 → "breakfast-at-tiffanys-1961-14629"
 * Example: "Amélie", 2001, 194 → "amelie-2001-194"
 */
export function createMovieSlug(title: string, releaseYear: number | null, tmdbId: number): string {
  const year = releaseYear?.toString() || "unknown"
  const slug = slugify(title, SLUGIFY_OPTIONS)

  return `${slug}-${year}-${tmdbId}`
}

/**
 * Creates a URL-safe slug from an actor name and ID
 * Example: "Audrey Hepburn", 10560 → "audrey-hepburn-10560"
 * Example: "José García", 123 → "jose-garcia-123"
 * Example: "François Truffaut", 456 → "francois-truffaut-456"
 */
export function createActorSlug(name: string, id: number): string {
  const slug = slugify(name, SLUGIFY_OPTIONS)

  return `${slug}-${id}`
}

/**
 * Creates a URL-safe slug from a TV show name, first air year, and ID
 * Example: "Breaking Bad", 2008, 1396 → "breaking-bad-2008-1396"
 * Example: "Élite", 2018, 76479 → "elite-2018-76479"
 */
export function createShowSlug(name: string, firstAirYear: number | null, tmdbId: number): string {
  const year = firstAirYear?.toString() || "unknown"
  const slug = slugify(name, SLUGIFY_OPTIONS)

  return `${slug}-${year}-${tmdbId}`
}

/**
 * Creates a URL-safe slug for a TV episode.
 * Matches the frontend's createEpisodeSlug() for URL consistency.
 * Example: "Breaking Bad", "Pilot", 1, 1, 1396 → "breaking-bad-s1e1-pilot-1396"
 * Example: "Élite", "Bienvenidos", 1, 1, 76479 → "elite-s1e1-bienvenidos-76479"
 */
export function createEpisodeSlug(
  showName: string,
  episodeName: string,
  seasonNumber: number,
  episodeNumber: number,
  showTmdbId: number
): string {
  const showSlug = slugify(showName, SLUGIFY_OPTIONS)
  const episodeSlug = slugify(episodeName, SLUGIFY_OPTIONS)

  return `${showSlug}-s${seasonNumber}e${episodeNumber}-${episodeSlug}-${showTmdbId}`
}
