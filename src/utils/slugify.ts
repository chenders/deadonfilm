/**
 * Creates a URL-safe slug from a movie title, year, and ID
 * Example: "Breakfast at Tiffany's" (1961), ID 14629 → "breakfast-at-tiffanys-1961-14629"
 */
export function createMovieSlug(title: string, releaseDate: string, id: number): string {
  const year = releaseDate ? releaseDate.slice(0, 4) : "unknown"
  const slug = title
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove straight ('), modifier (ʼ), and curly (') apostrophes
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

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
 */
export function createActorSlug(name: string, id: number): string {
  const slug = name
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove straight ('), modifier (ʼ), and curly (') apostrophes
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

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
 */
export function createShowSlug(name: string, firstAirDate: string | null, id: number): string {
  const year = firstAirDate ? firstAirDate.slice(0, 4) : "unknown"
  const slug = name
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "") // Remove straight ('), modifier (ʼ), and curly (') apostrophes
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/(^-|-$)/g, "") // Remove leading/trailing hyphens

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
  const showSlug = showName
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

  const episodeSlug = episodeName
    .toLowerCase()
    .replace(/['\u02BC\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")

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
