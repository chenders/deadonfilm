/**
 * Schema.org structured data builders for SEO
 * These generate JSON-LD objects for various page types
 */

const BASE_URL = "https://deadonfilm.com"

interface MovieSchemaInput {
  title: string
  release_date: string
  poster_path: string | null
}

interface MovieStats {
  deceasedCount: number
  totalCast: number
  mortalityPercentage: number
}

/**
 * Build Movie schema for MoviePage
 */
export function buildMovieSchema(
  movie: MovieSchemaInput,
  stats: MovieStats,
  slug: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    datePublished: movie.release_date,
    description: `${stats.deceasedCount} of ${stats.totalCast} cast members (${stats.mortalityPercentage}%) have passed away.`,
    image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
    url: `${BASE_URL}/movie/${slug}`,
  }
}

interface PersonSchemaInput {
  name: string
  birthday: string | null
  deathday: string | null
  biography: string
  profilePath: string | null
  placeOfBirth: string | null
}

/**
 * Build Person schema for ActorPage
 */
export function buildPersonSchema(actor: PersonSchemaInput, slug: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: actor.name,
    birthDate: actor.birthday || undefined,
    deathDate: actor.deathday || undefined,
    birthPlace: actor.placeOfBirth || undefined,
    description: actor.biography?.slice(0, 200) || undefined,
    image: actor.profilePath ? `https://image.tmdb.org/t/p/h632${actor.profilePath}` : undefined,
    url: `${BASE_URL}/actor/${slug}`,
  }
}

interface BreadcrumbItem {
  name: string
  url: string
}

/**
 * Build BreadcrumbList schema for navigation
 */
export function buildBreadcrumbSchema(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

interface ItemListItem {
  name: string
  url: string
  position: number
}

/**
 * Build ItemList schema for list pages (cursed movies, cursed actors)
 */
export function buildItemListSchema(
  name: string,
  description: string,
  items: ItemListItem[]
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    description,
    numberOfItems: items.length,
    itemListElement: items.map((item) => ({
      "@type": "ListItem",
      position: item.position,
      url: item.url,
      name: item.name,
    })),
  }
}
