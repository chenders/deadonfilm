/**
 * Server-side JSON-LD schema builders for prerendered pages.
 *
 * These are server-side copies of the client-side schema builders
 * from src/utils/schema.ts, adapted for use with database record types.
 */

const BASE_URL = "https://deadonfilm.com"

export function buildMovieSchema(
  movie: {
    title: string
    release_date: string | null
    poster_path: string | null
    deceased_count: number | null
    cast_count: number | null
  },
  slug: string
): Record<string, unknown> {
  const deceased = movie.deceased_count ?? 0
  const total = movie.cast_count ?? 0
  const percentage = total > 0 ? Math.round((deceased / total) * 100) : 0

  return {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: movie.title,
    datePublished: movie.release_date || undefined,
    description: `${deceased} of ${total} cast members (${percentage}%) have passed away.`,
    image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
    url: `${BASE_URL}/movie/${slug}`,
  }
}

export function buildPersonSchema(
  actor: {
    name: string
    birthday: string | null
    deathday: string | null
    profile_path: string | null
    tmdb_id: number | null
  },
  slug: string
): Record<string, unknown> {
  const sameAs: string[] = []
  if (actor.tmdb_id) {
    sameAs.push(`https://www.themoviedb.org/person/${actor.tmdb_id}`)
  }

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: actor.name,
    jobTitle: "Actor",
    birthDate: actor.birthday || undefined,
    deathDate: actor.deathday || undefined,
    image: actor.profile_path ? `https://image.tmdb.org/t/p/h632${actor.profile_path}` : undefined,
    url: `${BASE_URL}/actor/${slug}`,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  }
}

export function buildTVSeriesSchema(
  show: {
    name: string
    first_air_date: string | null
    poster_path: string | null
    number_of_seasons: number | null
    number_of_episodes: number | null
    deceased_count: number | null
    cast_count: number | null
  },
  slug: string
): Record<string, unknown> {
  const deceased = show.deceased_count ?? 0
  const total = show.cast_count ?? 0
  const percentage = total > 0 ? Math.round((deceased / total) * 100) : 0

  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: show.name,
    datePublished: show.first_air_date || undefined,
    numberOfSeasons: show.number_of_seasons || undefined,
    numberOfEpisodes: show.number_of_episodes || undefined,
    description: `${deceased} of ${total} cast members (${percentage}%) have passed away.`,
    image: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : undefined,
    url: `${BASE_URL}/show/${slug}`,
  }
}

export function buildTVEpisodeSchema(
  show: { name: string; tmdb_id: number },
  episode: {
    name: string | null
    season_number: number
    episode_number: number
    air_date: string | null
    deceased_count: number | null
    cast_count: number | null
  },
  episodeUrl: string,
  showSlug: string
): Record<string, unknown> {
  const deceased = episode.deceased_count ?? 0
  const total = episode.cast_count ?? 0
  const percentage = total > 0 ? Math.round((deceased / total) * 100) : 0
  const episodeCode = `S${episode.season_number}E${episode.episode_number}`

  return {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    name: episode.name || `Episode ${episode.episode_number}`,
    episodeNumber: episode.episode_number,
    seasonNumber: episode.season_number,
    datePublished: episode.air_date || undefined,
    description: `${deceased} of ${total} cast members (${percentage}%) from ${show.name} ${episodeCode} have passed away.`,
    url: episodeUrl,
    partOfSeries: {
      "@type": "TVSeries",
      name: show.name,
      url: `${BASE_URL}/show/${showSlug}`,
    },
  }
}

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

export function buildBreadcrumbSchema(
  items: Array<{ name: string; url: string }>
): Record<string, unknown> {
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
