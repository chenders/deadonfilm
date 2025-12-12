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
