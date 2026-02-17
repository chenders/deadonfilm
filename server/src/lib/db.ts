/**
 * Database functions module.
 *
 * Pool management functions are imported from ./db/pool.js.
 * This file contains all domain-specific database functions.
 */

// Re-export pool functions for backward compatibility
export { getPool, resetPool, queryWithRetry } from "./db/pool.js"

// Re-export stats functions for backward compatibility
export {
  getSiteStats,
  clearSiteStatsCache,
  getSyncState,
  updateSyncState,
  getAllActorTmdbIds,
  getDeceasedTmdbIds,
  getAllMovieTmdbIds,
} from "./db/stats.js"

// Re-export types that were previously defined in this file
export type { SiteStats, SyncStateRecord } from "./db/types.js"

// Re-export trivia functions for backward compatibility
export {
  getMostCursedMovie,
  getTrivia,
  getDeathsThisWeek,
  getDeathsThisWeekSimple,
  getPopularMovies,
  getRandomPopularMovies,
} from "./db/trivia.js"

// Re-export actor functions for backward compatibility
export {
  getActor,
  getActors,
  upsertActor,
  batchUpsertActors,
  updateDeathInfo,
  updateDeathInfoByActorId,
  getActorById,
  getActorByEitherIdWithSlug,
  getDeceasedByMonthDay,
  getActorFilmography,
  getActorShowFilmography,
  getDeceasedActorsFromTopMovies,
} from "./db/actors.js"

// Re-export actor types for backward compatibility
export type {
  ActorRecord,
  ActorInput,
  ActorMovieAppearanceRecord,
  ActorFilmographyMovie,
  ActorFilmographyShow,
  DeathInfoSource,
  DatePrecision,
  MovieAppearanceType,
} from "./db/types.js"

// Re-export movie functions for backward compatibility
export { getMovie, upsertMovie, getHighMortalityMovies, getMaxValidMinDeaths } from "./db/movies.js"

// Re-export movie types for backward compatibility
export type { MovieRecord, HighMortalityOptions } from "./db/types.js"

// Re-export show functions for backward compatibility
export {
  getShow,
  upsertShow,
  updateShowExternalIds,
  getSeasons,
  upsertSeason,
  getEpisodes,
  getEpisodeCountsBySeasonFromDb,
  upsertEpisode,
} from "./db/shows.js"

// Re-export show types for backward compatibility
export type { ShowRecord, SeasonRecord, EpisodeRecord } from "./db/types.js"

// Re-export appearances functions for backward compatibility
export {
  upsertActorMovieAppearance,
  batchUpsertActorMovieAppearances,
  getActorMovies,
  upsertShowActorAppearance,
  batchUpsertShowActorAppearances,
  getShowActors,
} from "./db/appearances.js"

// Re-export appearances types for backward compatibility
export type { ShowActorAppearanceRecord } from "./db/types.js"

// Re-export deaths-discovery functions for backward compatibility
export {
  getDeathsByDecade,
  getRecentDeaths,
  getForeverYoungMovies,
  getForeverYoungMoviesPaginated,
  getCovidDeaths,
  UNNATURAL_DEATH_CATEGORIES,
  getUnnaturalDeaths,
  getAllDeaths,
  getDeathWatchActors,
} from "./db/deaths-discovery.js"

// Re-export deaths-discovery types for backward compatibility
export type {
  DeathByDecadeRecord,
  DeathsByDecadeOptions,
  ForeverYoungMovie,
  ForeverYoungMovieRecord,
  ForeverYoungOptions,
  CovidDeathOptions,
  UnnaturalDeathsOptions,
  UnnaturalDeathCategory,
  AllDeathsOptions,
  DeathWatchOptions,
  DeathWatchActorRecord,
} from "./db/types.js"

// Re-export cause-categories functions for backward compatibility
export {
  CAUSE_CATEGORIES,
  getCauseCategories,
  getDeathsByCause,
  getCauseFromSlug,
  getDecadeCategories,
  getCauseCategoryIndex,
  getCauseCategory,
  getCauseFromSlugInCategory,
  getSpecificCause,
} from "./db/cause-categories.js"
export type { CauseCategoryKey } from "./db/cause-categories.js"

// Re-export cause-categories types for backward compatibility
export type {
  CauseCategory,
  DeathByCauseRecord,
  DeathsByCauseOptions,
  DecadeCategory,
  CauseCategoryStats,
  CauseCategoryIndexResponse,
  CauseCategoryDetailResponse,
  CauseCategoryOptions,
  SpecificCauseResponse,
  SpecificCauseOptions,
} from "./db/types.js"

// Re-export death-circumstances functions for backward compatibility
export {
  getActorDeathCircumstances,
  getActorDeathCircumstances as getActorDeathCircumstancesByActorId,
  getActorDeathCircumstancesByTmdbId,
  getNotableDeaths,
  hasDetailedDeathInfo,
} from "./db/death-circumstances.js"

// Re-export in-detail functions
export { getInDetailActors } from "./db/in-detail.js"
export type { InDetailResponse } from "./db/types.js"

// Re-export death-circumstances types for backward compatibility
export type {
  ProjectInfo,
  RelatedCelebrity,
  SourceEntry,
  DeathSources,
  ActorDeathCircumstancesRecord,
  NotableDeathActor,
  NotableDeathsOptions,
  NotableDeathsResponse,
} from "./db/types.js"

// Import getPool for local use
import { getPool } from "./db/pool.js"

// Import types for local use (also re-exported above)
import type { DeathInfoSource } from "./db/types.js"
// Options for getCursedActors query
export interface CursedActorsOptions {
  limit?: number
  offset?: number
  minMovies?: number
  actorStatus?: "living" | "deceased" | "all"
  fromYear?: number
  toYear?: number
}

// Cursed actor record returned from database
export interface CursedActorRecord {
  actor_id: number
  actor_tmdb_id: number | null
  actor_name: string
  is_deceased: boolean
  total_movies: number
  total_actual_deaths: number
  total_expected_deaths: number
  curse_score: number
}

// Get "cursed actors" - actors with high co-star mortality
// Ranks actors by total excess deaths (actual - expected) across their filmography
export async function getCursedActors(options: CursedActorsOptions = {}): Promise<{
  actors: CursedActorRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0, minMovies = 2, actorStatus = "all", fromYear, toYear } = options

  const db = getPool()

  // Build dynamic WHERE clause
  const conditions: string[] = ["m.expected_deaths IS NOT NULL"]
  const params: (number | string)[] = []
  let paramIndex = 1

  // Actor status filter (is_deceased derived from actors.deathday IS NOT NULL)
  if (actorStatus === "living") {
    conditions.push(`a.deathday IS NULL`)
  } else if (actorStatus === "deceased") {
    conditions.push(`a.deathday IS NOT NULL`)
  }
  // "all" means no filter on deceased status

  // Year range filters
  if (fromYear !== undefined) {
    conditions.push(`m.release_year >= $${paramIndex}`)
    params.push(fromYear)
    paramIndex++
  }
  if (toYear !== undefined) {
    conditions.push(`m.release_year <= $${paramIndex}`)
    params.push(toYear)
    paramIndex++
  }

  const whereClause = conditions.join(" AND ")

  // Add pagination params
  params.push(minMovies) // for HAVING clause
  const minMoviesParamIndex = paramIndex++
  params.push(limit)
  const limitParamIndex = paramIndex++
  params.push(offset)
  const offsetParamIndex = paramIndex++

  const query = `
    SELECT
      aa.actor_id,
      a.tmdb_id as actor_tmdb_id,
      a.name as actor_name,
      (a.deathday IS NOT NULL) as is_deceased,
      COUNT(DISTINCT aa.movie_tmdb_id)::integer as total_movies,
      SUM(m.deceased_count)::integer as total_actual_deaths,
      ROUND(SUM(m.expected_deaths)::numeric, 1) as total_expected_deaths,
      ROUND((SUM(m.deceased_count) - SUM(m.expected_deaths))::numeric, 1) as curse_score,
      COUNT(*) OVER() as total_count
    FROM actor_movie_appearances aa
    JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
    JOIN actors a ON aa.actor_id = a.id
    WHERE ${whereClause}
    GROUP BY aa.actor_id, a.tmdb_id, a.name, a.deathday
    HAVING COUNT(DISTINCT aa.movie_tmdb_id) >= $${minMoviesParamIndex}
    ORDER BY curse_score DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `

  const result = await db.query(query, params)

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

  // Remove the total_count field from each row
  const actors = result.rows.map(
    ({ total_count: _, ...actor }: { total_count: string } & CursedActorRecord) => actor
  )

  return { actors, totalCount }
}

// ============================================================================
// Movies by Genre functions (SEO category pages)
// ============================================================================

export interface GenreCategory {
  genre: string
  count: number
  slug: string
}

export async function getGenreCategories(): Promise<GenreCategory[]> {
  const db = getPool()

  // Unnest the genres array and count movies per genre
  const result = await db.query<{ genre: string; count: string }>(`
    SELECT unnest(genres) as genre, COUNT(*) as count
    FROM movies
    WHERE genres IS NOT NULL
      AND array_length(genres, 1) > 0
      AND deceased_count > 0
    GROUP BY genre
    HAVING COUNT(*) >= 5
    ORDER BY count DESC, genre
  `)

  return result.rows.map((row) => ({
    genre: row.genre,
    count: parseInt(row.count, 10),
    slug: row.genre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  }))
}

export interface MovieByGenreRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

export interface MoviesByGenreOptions {
  limit?: number
  offset?: number
}

export async function getMoviesByGenre(
  genre: string,
  options: MoviesByGenreOptions = {}
): Promise<{ movies: MovieByGenreRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM movies
     WHERE $1 = ANY(genres)
       AND deceased_count > 0`,
    [genre]
  )
  const totalCount = parseInt(countResult.rows[0].count, 10)

  // Get paginated results, sorted by mortality surprise score (cursed movies first)
  const result = await db.query<MovieByGenreRecord>(
    `SELECT tmdb_id, title, release_year, poster_path, deceased_count,
            cast_count, expected_deaths, mortality_surprise_score
     FROM movies
     WHERE $1 = ANY(genres)
       AND deceased_count > 0
     ORDER BY mortality_surprise_score DESC NULLS LAST, deceased_count DESC, title
     LIMIT $2 OFFSET $3`,
    [genre, limit, offset]
  )

  return { movies: result.rows, totalCount }
}

// Find the original genre name from a slug
export async function getGenreFromSlug(slug: string): Promise<string | null> {
  const db = getPool()

  // Get all genres and find the one matching the slug
  const result = await db.query<{ genre: string }>(`
    SELECT DISTINCT unnest(genres) as genre
    FROM movies
    WHERE genres IS NOT NULL
      AND array_length(genres, 1) > 0
  `)

  for (const row of result.rows) {
    const genreSlug = row.genre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    if (genreSlug === slug) {
      return row.genre
    }
  }

  return null
}

// Deceased actor with episode appearances for show page
export interface DeceasedShowActor {
  id: number
  tmdb_id: number | null
  name: string
  profile_path: string | null
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  cause_of_death_source: DeathInfoSource
  cause_of_death_details: string | null
  cause_of_death_details_source: DeathInfoSource
  wikipedia_url: string | null
  age_at_death: number | null
  years_lost: number | null
  total_episodes: number
  episodes: Array<{
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>
}

// Get all deceased actors for a show with their episode appearances
export async function getDeceasedActorsForShow(showTmdbId: number): Promise<DeceasedShowActor[]> {
  const db = getPool()

  // First get all deceased actors with their aggregated episode count
  const actorsResult = await db.query<{
    id: number
    tmdb_id: number | null
    name: string
    profile_path: string | null
    birthday: string | null
    deathday: string
    cause_of_death: string | null
    cause_of_death_source: DeathInfoSource
    cause_of_death_details: string | null
    cause_of_death_details_source: DeathInfoSource
    wikipedia_url: string | null
    age_at_death: number | null
    years_lost: number | null
    total_episodes: number
  }>(
    `SELECT
       a.id,
       a.tmdb_id,
       a.name,
       a.profile_path,
       a.birthday,
       a.deathday,
       a.cause_of_death,
       a.cause_of_death_source,
       a.cause_of_death_details,
       a.cause_of_death_details_source,
       a.wikipedia_url,
       a.age_at_death,
       a.years_lost,
       COUNT(DISTINCT (asa.season_number, asa.episode_number))::int as total_episodes
     FROM actors a
     JOIN actor_show_appearances asa ON asa.actor_id = a.id
     WHERE asa.show_tmdb_id = $1
       AND a.deathday IS NOT NULL
     GROUP BY a.id, a.tmdb_id, a.name, a.profile_path, a.birthday, a.deathday,
              a.cause_of_death, a.cause_of_death_source, a.cause_of_death_details,
              a.cause_of_death_details_source, a.wikipedia_url, a.age_at_death, a.years_lost
     ORDER BY a.deathday DESC`,
    [showTmdbId]
  )

  if (actorsResult.rows.length === 0) {
    return []
  }

  // Get episode appearances for all deceased actors (using internal id)
  const actorIds = actorsResult.rows.map((a) => a.id)
  const episodesResult = await db.query<{
    actor_id: number
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>(
    `SELECT
       asa.actor_id,
       asa.season_number,
       asa.episode_number,
       e.name as episode_name,
       asa.character_name
     FROM actor_show_appearances asa
     LEFT JOIN episodes e ON e.show_tmdb_id = asa.show_tmdb_id
       AND e.season_number = asa.season_number
       AND e.episode_number = asa.episode_number
     WHERE asa.show_tmdb_id = $1
       AND asa.actor_id = ANY($2)
     ORDER BY asa.season_number, asa.episode_number`,
    [showTmdbId, actorIds]
  )

  // Group episodes by actor (using internal id)
  const episodesByActor = new Map<
    number,
    Array<{
      season_number: number
      episode_number: number
      episode_name: string | null
      character_name: string | null
    }>
  >()
  for (const ep of episodesResult.rows) {
    const existing = episodesByActor.get(ep.actor_id) || []
    existing.push({
      season_number: ep.season_number,
      episode_number: ep.episode_number,
      episode_name: ep.episode_name,
      character_name: ep.character_name,
    })
    episodesByActor.set(ep.actor_id, existing)
  }

  return actorsResult.rows.map((actor) => ({
    ...actor,
    episodes: episodesByActor.get(actor.id) || [],
  }))
}

export interface LivingShowActor {
  id: number
  tmdb_id: number | null
  name: string
  profile_path: string | null
  birthday: string | null
  total_episodes: number
  episodes: Array<{
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>
}

// Get all living actors for a show with their episode appearances
export async function getLivingActorsForShow(showTmdbId: number): Promise<LivingShowActor[]> {
  const db = getPool()

  // First get all living actors with their aggregated episode count
  const actorsResult = await db.query<{
    id: number
    tmdb_id: number | null
    name: string
    profile_path: string | null
    birthday: string | null
    total_episodes: number
  }>(
    `SELECT
       a.id,
       a.tmdb_id,
       a.name,
       a.profile_path,
       a.birthday,
       COUNT(DISTINCT (asa.season_number, asa.episode_number))::int as total_episodes
     FROM actors a
     JOIN actor_show_appearances asa ON asa.actor_id = a.id
     WHERE asa.show_tmdb_id = $1
       AND a.deathday IS NULL
     GROUP BY a.id, a.tmdb_id, a.name, a.profile_path, a.birthday
     ORDER BY total_episodes DESC, a.name`,
    [showTmdbId]
  )

  if (actorsResult.rows.length === 0) {
    return []
  }

  // Get episode appearances for all living actors (using internal id)
  const actorIds = actorsResult.rows.map((a) => a.id)
  const episodesResult = await db.query<{
    actor_id: number
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>(
    `SELECT
       asa.actor_id,
       asa.season_number,
       asa.episode_number,
       e.name as episode_name,
       asa.character_name
     FROM actor_show_appearances asa
     LEFT JOIN episodes e ON e.show_tmdb_id = asa.show_tmdb_id
       AND e.season_number = asa.season_number
       AND e.episode_number = asa.episode_number
     WHERE asa.show_tmdb_id = $1
       AND asa.actor_id = ANY($2)
     ORDER BY asa.season_number, asa.episode_number`,
    [showTmdbId, actorIds]
  )

  // Group episodes by actor (using internal id)
  const episodesByActor = new Map<
    number,
    Array<{
      season_number: number
      episode_number: number
      episode_name: string | null
      character_name: string | null
    }>
  >()
  for (const ep of episodesResult.rows) {
    const existing = episodesByActor.get(ep.actor_id) || []
    existing.push({
      season_number: ep.season_number,
      episode_number: ep.episode_number,
      episode_name: ep.episode_name,
      character_name: ep.character_name,
    })
    episodesByActor.set(ep.actor_id, existing)
  }

  return actorsResult.rows.map((actor) => ({
    ...actor,
    episodes: episodesByActor.get(actor.id) || [],
  }))
}
