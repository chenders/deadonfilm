/**
 * Data fetchers for prerendered pages.
 *
 * Minimal database queries per page type — typically single-row PK lookups.
 * Returns PrerenderPageData for the HTML renderer.
 */

import { getActorById } from "../db/actors.js"
import { getMovie } from "../db/movies.js"
import { getShow } from "../db/shows.js"
import { getPool } from "../db/pool.js"
import {
  createActorSlug,
  createMovieSlug,
  createShowSlug,
  createEpisodeSlug,
} from "../slug-utils.js"
import {
  buildMovieSchema,
  buildPersonSchema,
  buildTVSeriesSchema,
  buildTVEpisodeSchema,
  buildWebsiteSchema,
  buildBreadcrumbSchema,
} from "./schema.js"
import type { PrerenderPageData } from "./renderer.js"
import type { MatchResult } from "./url-patterns.js"
import type { EpisodeRecord, SeasonRecord } from "../db/types.js"

const BASE_URL = "https://deadonfilm.com"
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"

function tmdbPoster(path: string | null): string | undefined {
  return path ? `${TMDB_IMAGE_BASE}/w500${path}` : undefined
}

function tmdbProfile(path: string | null): string | undefined {
  return path ? `${TMDB_IMAGE_BASE}/h632${path}` : undefined
}

/**
 * Fetch page data for a matched URL.
 * Returns null if the entity is not found in the database.
 */
export async function fetchPageData(match: MatchResult): Promise<PrerenderPageData | null> {
  const { pageType, params } = match

  switch (pageType) {
    case "home":
      return getHomePageData()
    case "actor":
      return getActorPageData(Number(params.actorId))
    case "actor-death":
      return getActorDeathPageData(Number(params.actorId))
    case "movie":
      return getMoviePageData(Number(params.tmdbId))
    case "show":
      return getShowPageData(Number(params.tmdbId))
    case "episode":
      return getEpisodePageData(
        Number(params.showTmdbId),
        Number(params.season),
        Number(params.episode)
      )
    case "season":
      return getSeasonPageData(Number(params.tmdbId), Number(params.seasonNumber))
    case "search":
      return getStaticPageData(
        "Search Movies & TV Shows",
        "Search for movies, TV shows, and actors to see mortality statistics.",
        "/search"
      )
    case "forever-young":
      return getStaticPageData(
        "Forever Young — Movies Where No Cast Members Have Died",
        "Discover movies with a perfect survival record — every cast member is still alive.",
        "/forever-young"
      )
    case "covid-deaths":
      return getStaticPageData(
        "COVID-19 Deaths in Film & Television",
        "Actors and performers who died from COVID-19.",
        "/covid-deaths"
      )
    case "unnatural-deaths":
      return getStaticPageData(
        "Unnatural Deaths in Film & Television",
        "Actors who died from accidents, homicides, suicides, and other unnatural causes.",
        "/unnatural-deaths"
      )
    case "death-watch":
      return getStaticPageData(
        "Death Watch — Oldest Living Actors",
        "The oldest living actors from popular movies and TV shows.",
        "/death-watch"
      )
    case "deaths-index":
      return getStaticPageData(
        "Deaths in Film & Television",
        "Browse actor deaths by cause, decade, and more.",
        "/deaths"
      )
    case "deaths-all":
      return getStaticPageData(
        "All Actor Deaths",
        "Complete list of deceased actors in our database.",
        "/deaths/all"
      )
    case "deaths-notable":
      return getStaticPageData(
        "Notable Actor Deaths",
        "Notable and high-profile actor deaths.",
        "/deaths/notable"
      )
    case "deaths-decades":
      return getStaticPageData(
        "Deaths by Decade",
        "Browse actor deaths organized by decade.",
        "/deaths/decades"
      )
    case "deaths-decade":
      return getDecadePageData(params.decade)
    case "deaths-cause":
      return getCausePageData(params.cause)
    case "genres-index":
      return getStaticPageData(
        "Movie Genres — Mortality by Genre",
        "Browse movies by genre and see mortality statistics.",
        "/movies/genres"
      )
    case "genre":
      return getGenrePageData(params.genre)
    case "causes-of-death-index":
      return getStaticPageData(
        "Causes of Death",
        "Browse actor causes of death by category.",
        "/causes-of-death"
      )
    case "causes-of-death-category":
      return getCauseCategoryPageData(params.categorySlug)
    case "causes-of-death-specific":
      return getCauseSpecificPageData(params.categorySlug, params.causeSlug)
    case "about":
      return getStaticPageData(
        "About Dead on Film",
        "Learn about Dead on Film — a movie cast mortality database.",
        "/about"
      )
    case "faq":
      return getStaticPageData(
        "Frequently Asked Questions — Dead on Film",
        "Common questions about Dead on Film, our data sources, and methodology.",
        "/faq"
      )
    case "methodology":
      return getStaticPageData(
        "Methodology — Dead on Film",
        "How we calculate mortality statistics, curse scores, and expected lifespans.",
        "/methodology"
      )
    case "data-sources":
      return getStaticPageData(
        "Data Sources — Dead on Film",
        "Our data sources including TMDB, Wikidata, and SSA actuarial tables.",
        "/data-sources"
      )
    case "articles-index":
      return getStaticPageData(
        "Articles — Dead on Film",
        "Articles and analysis about mortality in film and television.",
        "/articles"
      )
    case "article":
      return getArticlePageData(params.slug)
    default:
      return null
  }
}

function getHomePageData(): PrerenderPageData {
  return {
    title: "Dead on Film — Movie Cast Mortality Database",
    description:
      "Look up any movie or TV show to see which actors have passed away. Mortality statistics, causes of death, and more.",
    ogType: "website",
    canonicalUrl: BASE_URL,
    jsonLd: buildWebsiteSchema(),
    heading: "Dead on Film",
    subheading:
      "Movie cast mortality database. Look up any movie or TV show to see which actors have passed away.",
  }
}

async function getActorPageData(actorId: number): Promise<PrerenderPageData | null> {
  const actor = await getActorById(actorId)
  if (!actor) return null

  const slug = createActorSlug(actor.name, actor.id)
  const canonicalUrl = `${BASE_URL}/actor/${slug}`

  const isDeceased = !!actor.deathday
  const lifeSpan = isDeceased
    ? `(${actor.birthday?.slice(0, 4) || "?"} – ${actor.deathday?.slice(0, 4) || "?"})`
    : actor.birthday
      ? `(born ${actor.birthday.slice(0, 4)})`
      : ""

  const description = isDeceased
    ? `${actor.name} ${lifeSpan}. ${actor.cause_of_death ? `Cause of death: ${actor.cause_of_death}.` : "View filmography and mortality statistics."}`
    : `${actor.name} ${lifeSpan}. View filmography and mortality statistics on Dead on Film.`

  return {
    title: `${actor.name} — Dead on Film`,
    description,
    ogType: "profile",
    imageUrl: tmdbProfile(actor.profile_path),
    canonicalUrl,
    jsonLd: [
      buildPersonSchema(actor, slug),
      buildBreadcrumbSchema([
        { name: "Home", url: BASE_URL },
        { name: actor.name, url: canonicalUrl },
      ]),
    ],
    heading: actor.name,
    subheading: description,
  }
}

async function getActorDeathPageData(actorId: number): Promise<PrerenderPageData | null> {
  const actor = await getActorById(actorId)
  if (!actor || !actor.deathday) return null

  const slug = createActorSlug(actor.name, actor.id)
  const canonicalUrl = `${BASE_URL}/actor/${slug}/death`

  const description = actor.cause_of_death
    ? `How did ${actor.name} die? ${actor.cause_of_death}. Detailed death information and circumstances.`
    : `Death details for ${actor.name}. View cause of death, age at death, and circumstances.`

  return {
    title: `How Did ${actor.name} Die? — Dead on Film`,
    description,
    ogType: "profile",
    imageUrl: tmdbProfile(actor.profile_path),
    canonicalUrl,
    jsonLd: buildPersonSchema(actor, slug),
    heading: `How Did ${actor.name} Die?`,
    subheading: description,
  }
}

async function getMoviePageData(tmdbId: number): Promise<PrerenderPageData | null> {
  const movie = await getMovie(tmdbId)
  if (!movie) return null

  const slug = createMovieSlug(movie.title, movie.release_year, movie.tmdb_id)
  const canonicalUrl = `${BASE_URL}/movie/${slug}`

  const deceased = movie.deceased_count ?? 0
  const total = movie.cast_count ?? 0
  const percentage = total > 0 ? Math.round((deceased / total) * 100) : 0
  const yearStr = movie.release_year ? ` (${movie.release_year})` : ""

  const description = `${movie.title}${yearStr}: ${deceased} of ${total} cast members (${percentage}%) have passed away. View full cast mortality statistics.`

  return {
    title: `${movie.title}${yearStr} — Cast Deaths | Dead on Film`,
    description,
    ogType: "video.movie",
    imageUrl: tmdbPoster(movie.poster_path),
    canonicalUrl,
    jsonLd: [
      buildMovieSchema(movie, slug),
      buildBreadcrumbSchema([
        { name: "Home", url: BASE_URL },
        { name: movie.title, url: canonicalUrl },
      ]),
    ],
    heading: `${movie.title}${yearStr}`,
    subheading: description,
  }
}

async function getShowPageData(tmdbId: number): Promise<PrerenderPageData | null> {
  const show = await getShow(tmdbId)
  if (!show) return null

  const firstAirYear = show.first_air_date ? parseInt(show.first_air_date.slice(0, 4), 10) : null
  const slug = createShowSlug(show.name, firstAirYear, show.tmdb_id)
  const canonicalUrl = `${BASE_URL}/show/${slug}`

  const deceased = show.deceased_count ?? 0
  const total = show.cast_count ?? 0
  const percentage = total > 0 ? Math.round((deceased / total) * 100) : 0
  const yearStr = firstAirYear ? ` (${firstAirYear})` : ""

  const description = `${show.name}${yearStr}: ${deceased} of ${total} cast members (${percentage}%) have passed away. View full cast mortality statistics.`

  return {
    title: `${show.name}${yearStr} — Cast Deaths | Dead on Film`,
    description,
    ogType: "video.tv_show",
    imageUrl: tmdbPoster(show.poster_path),
    canonicalUrl,
    jsonLd: [
      buildTVSeriesSchema(show, slug),
      buildBreadcrumbSchema([
        { name: "Home", url: BASE_URL },
        { name: show.name, url: canonicalUrl },
      ]),
    ],
    heading: `${show.name}${yearStr}`,
    subheading: description,
  }
}

async function getEpisodePageData(
  showTmdbId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<PrerenderPageData | null> {
  const db = getPool()

  // Join episode with show data in a single query
  const result = await db.query<
    EpisodeRecord & {
      show_name: string
      show_poster_path: string | null
      show_first_air_date: string | null
    }
  >(
    `SELECT e.*, s.name as show_name, s.poster_path as show_poster_path, s.first_air_date as show_first_air_date
     FROM episodes e
     JOIN shows s ON s.tmdb_id = e.show_tmdb_id
     WHERE e.show_tmdb_id = $1 AND e.season_number = $2 AND e.episode_number = $3`,
    [showTmdbId, seasonNumber, episodeNumber]
  )

  if (result.rows.length === 0) return null
  const row = result.rows[0]

  const showFirstAirYear = row.show_first_air_date
    ? parseInt(row.show_first_air_date.slice(0, 4), 10)
    : null
  const showSlug = createShowSlug(row.show_name, showFirstAirYear, showTmdbId)

  const episodeCode = `S${seasonNumber}E${episodeNumber}`
  const episodeName = row.name || `Episode ${episodeNumber}`

  // Build episode URL slug using shared slugify utility for proper transliteration
  const fullSlug = createEpisodeSlug(
    row.show_name,
    episodeName,
    seasonNumber,
    episodeNumber,
    showTmdbId
  )
  const canonicalUrl = `${BASE_URL}/episode/${fullSlug}`

  const deceased = row.deceased_count ?? 0
  const total = row.cast_count ?? 0
  const percentage = total > 0 ? Math.round((deceased / total) * 100) : 0

  const description = `${row.show_name} ${episodeCode} "${episodeName}": ${deceased} of ${total} cast members (${percentage}%) have passed away.`

  return {
    title: `${row.show_name} ${episodeCode} — "${episodeName}" | Dead on Film`,
    description,
    ogType: "video.episode",
    imageUrl: tmdbPoster(row.show_poster_path),
    canonicalUrl,
    jsonLd: [
      buildTVEpisodeSchema(
        { name: row.show_name, tmdb_id: showTmdbId },
        row,
        canonicalUrl,
        showSlug
      ),
      buildBreadcrumbSchema([
        { name: "Home", url: BASE_URL },
        { name: row.show_name, url: `${BASE_URL}/show/${showSlug}` },
        { name: `${episodeCode} ${episodeName}`, url: canonicalUrl },
      ]),
    ],
    heading: `${row.show_name} — ${episodeCode}: ${episodeName}`,
    subheading: description,
  }
}

async function getSeasonPageData(
  showTmdbId: number,
  seasonNumber: number
): Promise<PrerenderPageData | null> {
  const db = getPool()

  // Join season with show data in a single query
  const result = await db.query<
    SeasonRecord & {
      show_name: string
      show_poster_path: string | null
      show_first_air_date: string | null
    }
  >(
    `SELECT se.*, s.name as show_name, s.poster_path as show_poster_path, s.first_air_date as show_first_air_date
     FROM seasons se
     JOIN shows s ON s.tmdb_id = se.show_tmdb_id
     WHERE se.show_tmdb_id = $1 AND se.season_number = $2`,
    [showTmdbId, seasonNumber]
  )

  if (result.rows.length === 0) return null
  const row = result.rows[0]

  const showFirstAirYear = row.show_first_air_date
    ? parseInt(row.show_first_air_date.slice(0, 4), 10)
    : null
  const showSlug = createShowSlug(row.show_name, showFirstAirYear, showTmdbId)
  const seasonName = row.name || `Season ${seasonNumber}`
  const title = `${row.show_name} - ${seasonName}`
  const canonicalUrl = `${BASE_URL}/show/${showSlug}/season/${seasonNumber}`

  const deceased = row.deceased_count ?? 0
  const episodeCount = row.episode_count ?? 0

  const description = `${deceased} guest stars from ${row.show_name} ${seasonName} have passed away. Browse all ${episodeCount} episodes.`

  return {
    title: `${title} - Dead on Film`,
    description,
    ogType: "video.tv_show",
    imageUrl: tmdbPoster(row.poster_path || row.show_poster_path),
    canonicalUrl,
    jsonLd: buildBreadcrumbSchema([
      { name: "Home", url: BASE_URL },
      { name: row.show_name, url: `${BASE_URL}/show/${showSlug}` },
      { name: seasonName, url: canonicalUrl },
    ]),
    heading: title,
    subheading: description,
  }
}

function getStaticPageData(title: string, description: string, path: string): PrerenderPageData {
  return {
    title: title.includes("Dead on Film") ? title : `${title} | Dead on Film`,
    description,
    ogType: "website",
    canonicalUrl: `${BASE_URL}${path}`,
    heading: title.replace(/ — Dead on Film$/, "").replace(/ \| Dead on Film$/, ""),
    subheading: description,
  }
}

function getDecadePageData(decade: string): PrerenderPageData {
  const decadeLabel = decade.endsWith("s") ? decade : `${decade}s`
  return getStaticPageData(
    `Actor Deaths in the ${decadeLabel}`,
    `Actors who died in the ${decadeLabel}. Browse by year and cause of death.`,
    `/deaths/decade/${decade}`
  )
}

function getCausePageData(cause: string): PrerenderPageData {
  const causeLabel = cause.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return getStaticPageData(
    `Deaths from ${causeLabel}`,
    `Actors who died from ${causeLabel.toLowerCase()}. View the complete list.`,
    `/deaths/${cause}`
  )
}

function getGenrePageData(genre: string): PrerenderPageData {
  const genreLabel = genre.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return getStaticPageData(
    `${genreLabel} Movies — Mortality Statistics`,
    `Browse ${genreLabel.toLowerCase()} movies and see cast mortality statistics.`,
    `/movies/genre/${genre}`
  )
}

function getCauseCategoryPageData(categorySlug: string): PrerenderPageData {
  const label = categorySlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return getStaticPageData(
    `${label} — Causes of Death`,
    `Browse actors who died from ${label.toLowerCase()}.`,
    `/causes-of-death/${categorySlug}`
  )
}

function getCauseSpecificPageData(categorySlug: string, causeSlug: string): PrerenderPageData {
  const causeLabel = causeSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  const categoryLabel = categorySlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return getStaticPageData(
    `${causeLabel} — ${categoryLabel}`,
    `Actors who died from ${causeLabel.toLowerCase()}. Browse the complete list.`,
    `/causes-of-death/${categorySlug}/${causeSlug}`
  )
}

function getArticlePageData(slug: string): PrerenderPageData {
  const label = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return getStaticPageData(label, `Read "${label}" on Dead on Film.`, `/articles/${slug}`)
}
