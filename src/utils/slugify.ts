import slugify from "slugify"

/**
 * Shared slugify configuration for consistent slug generation across all entity types.
 * - lower: Convert to lowercase
 * - strict: Remove special characters not replaced by separator
 * - remove: Explicitly remove punctuation that should not appear in slugs
 */
const SLUGIFY_OPTIONS = {
  lower: true,
  strict: true,
  remove: /[*+~.()'"!:@]/g,
} as const

/**
 * Creates a URL-safe slug from a movie title, year, and ID
 * Example: "Breakfast at Tiffany's" (1961), ID 14629 → "breakfast-at-tiffanys-1961-14629"
 * Example: "Amélie" (2001), ID 194 → "amelie-2001-194"
 */
export function createMovieSlug(title: string, releaseDate: string, id: number): string {
  const year = releaseDate ? releaseDate.slice(0, 4) : "unknown"
  const slug = slugify(title, SLUGIFY_OPTIONS)

  return `${slug}-${year}-${id}`
}

/**
 * Extracts the TMDB movie ID from a slug
 * Example: "breakfast-at-tiffanys-1961-14629" → 14629
 */
export function extractMovieId(slug: string): number {
  const match = slug.match(/-(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Extracts the year from a slug for display purposes
 * Example: "breakfast-at-tiffanys-1961-14629" → "1961"
 */
export function extractYearFromSlug(slug: string): string | null {
  const match = slug.match(/-(\d{4})-\d+$/)
  return match ? match[1] : null
}

/**
 * Creates a URL-safe slug from an actor name and ID
 * Example: "John Wayne", ID 4165 → "john-wayne-4165"
 * Example: "Björk", ID 47 → "bjork-47"
 * Example: "José García", ID 123 → "jose-garcia-123"
 */
export function createActorSlug(name: string, id: number): string {
  const slug = slugify(name, SLUGIFY_OPTIONS)

  return `${slug}-${id}`
}

/**
 * Extracts the TMDB actor ID from a slug
 * Example: "john-wayne-4165" → 4165
 */
export function extractActorId(slug: string): number {
  const match = slug.match(/-(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Creates a URL-safe slug from a show name, first air date, and ID
 * Example: "Breaking Bad" (2008), ID 1396 → "breaking-bad-2008-1396"
 * Example: "Élite" (2018), ID 76479 → "elite-2018-76479"
 */
export function createShowSlug(name: string, firstAirDate: string | null, id: number): string {
  const year = firstAirDate ? firstAirDate.slice(0, 4) : "unknown"
  const slug = slugify(name, SLUGIFY_OPTIONS)

  return `${slug}-${year}-${id}`
}

/**
 * Extracts the TMDB show ID from a slug
 * Example: "breaking-bad-2008-1396" → 1396
 */
export function extractShowId(slug: string): number {
  const match = slug.match(/-(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

/**
 * Creates a URL path for a season page using the show slug
 * Example: "Seinfeld" (1989), ID 1400, Season 4 → "/show/seinfeld-1989-1400/season/4"
 */
export function createSeasonPath(
  showName: string,
  firstAirDate: string | null,
  showId: number,
  seasonNumber: number
): string {
  const showSlug = createShowSlug(showName, firstAirDate, showId)
  return `/show/${showSlug}/season/${seasonNumber}`
}

/**
 * Creates a URL-safe slug for an episode
 * Example: "Seinfeld", "The Contest", S4E11, show ID 1400 → "seinfeld-s4e11-the-contest-1400"
 */
export function createEpisodeSlug(
  showName: string,
  episodeName: string,
  seasonNumber: number,
  episodeNumber: number,
  showId: number
): string {
  const showSlug = slugify(showName, SLUGIFY_OPTIONS)
  const episodeSlug = slugify(episodeName, SLUGIFY_OPTIONS)

  return `${showSlug}-s${seasonNumber}e${episodeNumber}-${episodeSlug}-${showId}`
}

/**
 * Extracts show ID, season, and episode from an episode slug
 * Example: "seinfeld-s4e11-the-contest-1400" → { showId: 1400, season: 4, episode: 11 }
 */
export function extractEpisodeInfo(
  slug: string
): { showId: number; season: number; episode: number } | null {
  // Match pattern: anything-sXeY-anything-showId
  const match = slug.match(/-s(\d+)e(\d+)-.*-(\d+)$/)
  if (!match) return null
  return {
    season: parseInt(match[1], 10),
    episode: parseInt(match[2], 10),
    showId: parseInt(match[3], 10),
  }
}
