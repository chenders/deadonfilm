/**
 * Schema.org structured data builders for SEO
 * These generate JSON-LD objects for various page types
 */

import { createActorSlug } from "./slugify"

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

interface MovieCastMember {
  id: number
  name: string
}

/**
 * Build Movie schema for MoviePage
 */
export function buildMovieSchema(
  movie: MovieSchemaInput,
  stats: MovieStats,
  slug: string,
  cast?: MovieCastMember[]
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    datePublished: movie.release_date,
    description: `${stats.deceasedCount} of ${stats.totalCast} cast members (${stats.mortalityPercentage}%) have passed away.`,
    image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
    url: `${BASE_URL}/movie/${slug}`,
  }

  if (cast && cast.length > 0) {
    schema.actor = cast.slice(0, 10).map((person) => ({
      "@type": "Person",
      name: person.name,
      url: `${BASE_URL}/actor/${createActorSlug(person.name, person.id)}`,
    }))
  }

  return schema
}

interface PersonSchemaInput {
  name: string
  birthday: string | null
  deathday: string | null
  biography: string
  profilePath: string | null
  placeOfBirth: string | null
  tmdbId?: number | null
}

/**
 * Build Person schema for ActorPage
 */
export function buildPersonSchema(actor: PersonSchemaInput, slug: string): Record<string, unknown> {
  const sameAs: string[] = []
  if (actor.tmdbId) {
    sameAs.push(`https://www.themoviedb.org/person/${actor.tmdbId}`)
  }

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: actor.name,
    jobTitle: "Actor",
    birthDate: actor.birthday || undefined,
    deathDate: actor.deathday || undefined,
    birthPlace: actor.placeOfBirth || undefined,
    description: actor.biography?.slice(0, 200) || undefined,
    image: actor.profilePath ? `https://image.tmdb.org/t/p/h632${actor.profilePath}` : undefined,
    url: `${BASE_URL}/actor/${slug}`,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
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

/**
 * Build Organization schema for publisher attribution (E-E-A-T)
 */
export function buildOrganizationSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Dead on Film",
    url: BASE_URL,
    description:
      "Movie and TV show cast mortality database using data from TMDB, Wikidata, and other verified sources.",
  }
}

/**
 * Build WebSite schema for homepage SEO
 * Enables sitelinks search box in Google results
 */
export function buildWebsiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Dead on Film",
    alternateName: "DeadOnFilm",
    url: BASE_URL,
    description:
      "Movie cast mortality database. Look up any movie and see which actors have passed away.",
    publisher: {
      "@type": "Organization",
      name: "Dead on Film",
      url: BASE_URL,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${BASE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
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
interface FAQItem {
  question: string
  answer: string
}

/**
 * Build FAQPage schema for FAQ pages
 * Generates JSON-LD that enables rich FAQ results in Google Search
 */
export function buildFAQPageSchema(items: FAQItem[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }
}

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

interface TVSeriesSchemaInput {
  name: string
  firstAirDate: string | null
  posterPath: string | null
  numberOfSeasons: number
  numberOfEpisodes: number
}

interface TVSeriesStats {
  deceasedCount: number
  totalCast: number
  mortalityPercentage: number
}

/**
 * Build TVSeries schema for ShowPage
 */
export function buildTVSeriesSchema(
  show: TVSeriesSchemaInput,
  stats: TVSeriesStats,
  slug: string
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: show.name,
    datePublished: show.firstAirDate || undefined,
    numberOfSeasons: show.numberOfSeasons,
    numberOfEpisodes: show.numberOfEpisodes,
    description: `${stats.deceasedCount} of ${stats.totalCast} cast members (${stats.mortalityPercentage}%) have passed away.`,
    image: show.posterPath ? `https://image.tmdb.org/t/p/w500${show.posterPath}` : undefined,
    url: `${BASE_URL}/show/${slug}`,
  }
}

interface TVEpisodeSchemaInput {
  name: string
  seasonNumber: number
  episodeNumber: number
  airDate: string | null
  overview: string
  runtime: number | null
  stillPath: string | null
}

interface TVEpisodeShowInput {
  name: string
  firstAirDate: string | null
  id: number
}

/**
 * Convert runtime in minutes to ISO 8601 duration (e.g. 45 -> "PT45M")
 */
function toIsoDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `PT${h}H${m}M`
  if (h > 0) return `PT${h}H`
  return `PT${m}M`
}

/**
 * Build TVEpisode schema for EpisodePage
 */
export function buildTVEpisodeSchema(
  show: TVEpisodeShowInput,
  episode: TVEpisodeSchemaInput,
  stats: TVSeriesStats,
  episodeUrl: string,
  showSlug: string
): Record<string, unknown> {
  const episodeCode = `S${episode.seasonNumber}E${episode.episodeNumber}`
  return {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    name: episode.name,
    episodeNumber: episode.episodeNumber,
    seasonNumber: episode.seasonNumber,
    datePublished: episode.airDate || undefined,
    description:
      episode.overview ||
      `${stats.deceasedCount} of ${stats.totalCast} cast members (${stats.mortalityPercentage}%) from ${show.name} ${episodeCode} have passed away.`,
    image: episode.stillPath ? `https://image.tmdb.org/t/p/w500${episode.stillPath}` : undefined,
    duration: episode.runtime != null ? toIsoDuration(episode.runtime) : undefined,
    url: episodeUrl,
    partOfSeries: {
      "@type": "TVSeries",
      name: show.name,
      url: `${BASE_URL}/show/${showSlug}`,
    },
  }
}

interface ArticleSchemaInput {
  title: string
  description: string
  slug: string
  publishedDate: string
  updatedDate?: string
  wordCount: number
  author: string
}

/**
 * Build BlogPosting schema for article pages
 */
export function buildArticleSchema(article: ArticleSchemaInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedDate,
    dateModified: article.updatedDate || article.publishedDate,
    wordCount: article.wordCount,
    url: `${BASE_URL}/articles/${article.slug}`,
    author: {
      "@type": "Organization",
      name: article.author,
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Dead on Film",
      url: BASE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/articles/${article.slug}`,
    },
  }
}

interface CollectionPageItem {
  name: string
  url: string
}

/**
 * Build CollectionPage schema for curated list pages (Death Watch, Forever Young, All Deaths)
 */
export function buildCollectionPageSchema(
  name: string,
  description: string,
  url: string,
  items: CollectionPageItem[]
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: item.url,
        name: item.name,
      })),
    },
  }
}
