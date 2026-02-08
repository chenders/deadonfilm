/**
 * Related content database functions.
 *
 * Functions for finding related actors, movies, and shows based on
 * shared attributes like cause of death, birth decade, or shared cast members.
 */

import { getPool } from "./pool.js"

// ============================================================================
// Types
// ============================================================================

export interface RelatedActor {
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  deathday: string | null
  causeOfDeath: string | null
  birthday: string | null
}

export interface RelatedMovie {
  tmdbId: number
  title: string
  releaseDate: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  sharedCastCount: number
}

export interface RelatedShow {
  tmdbId: number
  name: string
  firstAirDate: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  sharedCastCount: number
}

// ============================================================================
// Related actors
// ============================================================================

const RELATED_ACTORS_LIMIT = 5

/**
 * Find actors related by same cause of death or same birth decade.
 * Prioritizes cause of death matches, then falls back to birth decade.
 *
 * @param actorId - The actor's internal ID (used for self-exclusion)
 * @param causeOfDeath - The actor's cause of death (null if unknown)
 * @param birthDecade - The start year of the actor's birth decade (e.g., 1940)
 */
export async function getRelatedActors(
  actorId: number,
  causeOfDeath: string | null,
  birthDecade: number | null
): Promise<RelatedActor[]> {
  const db = getPool()

  // Try cause of death match first (if provided)
  if (causeOfDeath) {
    const result = await db.query<{
      id: number
      tmdb_id: number | null
      name: string
      profile_path: string | null
      deathday: string | null
      cause_of_death: string | null
      birthday: string | null
    }>(
      `SELECT a.id, a.tmdb_id, a.name, a.profile_path, a.deathday, a.cause_of_death, a.birthday
       FROM actors a
       WHERE a.cause_of_death = $1
         AND a.id != $2
         AND a.is_obscure IS NOT TRUE
         AND a.deathday IS NOT NULL
       ORDER BY a.tmdb_popularity DESC NULLS LAST
       LIMIT $3`,
      [causeOfDeath, actorId, RELATED_ACTORS_LIMIT]
    )

    if (result.rows.length > 0) {
      return result.rows.map(mapActorRow)
    }
  }

  // Fall back to birth decade match (if provided)
  if (birthDecade !== null) {
    const decadeEnd = birthDecade + 9
    const result = await db.query<{
      id: number
      tmdb_id: number | null
      name: string
      profile_path: string | null
      deathday: string | null
      cause_of_death: string | null
      birthday: string | null
    }>(
      `SELECT a.id, a.tmdb_id, a.name, a.profile_path, a.deathday, a.cause_of_death, a.birthday
       FROM actors a
       WHERE a.birthday IS NOT NULL
         AND EXTRACT(YEAR FROM a.birthday) >= $1
         AND EXTRACT(YEAR FROM a.birthday) <= $2
         AND a.id != $3
         AND a.is_obscure IS NOT TRUE
         AND a.deathday IS NOT NULL
       ORDER BY a.tmdb_popularity DESC NULLS LAST
       LIMIT $4`,
      [birthDecade, decadeEnd, actorId, RELATED_ACTORS_LIMIT]
    )

    return result.rows.map(mapActorRow)
  }

  return []
}

function mapActorRow(row: {
  id: number
  tmdb_id: number | null
  name: string
  profile_path: string | null
  deathday: string | null
  cause_of_death: string | null
  birthday: string | null
}): RelatedActor {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    name: row.name,
    profilePath: row.profile_path,
    deathday: row.deathday,
    causeOfDeath: row.cause_of_death,
    birthday: row.birthday,
  }
}

// ============================================================================
// Related movies
// ============================================================================

const RELATED_MOVIES_LIMIT = 5

/**
 * Find movies related by shared cast members.
 * Orders by number of shared cast members, then by TMDB popularity.
 *
 * @param movieTmdbId - The movie's TMDB ID
 */
export async function getRelatedMovies(movieTmdbId: number): Promise<RelatedMovie[]> {
  const db = getPool()

  const result = await db.query<{
    tmdb_id: number
    title: string
    release_date: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
    shared_cast_count: number
  }>(
    `WITH source_cast AS (
       SELECT actor_id
       FROM actor_movie_appearances
       WHERE movie_tmdb_id = $1
     )
     SELECT
       m.tmdb_id,
       m.title,
       m.release_date,
       m.poster_path,
       COALESCE(m.deceased_count, 0)::int AS deceased_count,
       COALESCE(m.cast_count, 0)::int AS cast_count,
       COUNT(ama.actor_id)::int AS shared_cast_count
     FROM actor_movie_appearances ama
     JOIN source_cast sc ON ama.actor_id = sc.actor_id
     JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
     WHERE ama.movie_tmdb_id != $1
       AND m.is_obscure IS NOT TRUE
     GROUP BY m.tmdb_id, m.title, m.release_date, m.poster_path, m.deceased_count, m.cast_count
     ORDER BY shared_cast_count DESC, m.tmdb_popularity DESC NULLS LAST
     LIMIT $2`,
    [movieTmdbId, RELATED_MOVIES_LIMIT]
  )

  return result.rows.map((row) => ({
    tmdbId: row.tmdb_id,
    title: row.title,
    releaseDate: row.release_date,
    posterPath: row.poster_path,
    deceasedCount: row.deceased_count,
    castCount: row.cast_count,
    sharedCastCount: row.shared_cast_count,
  }))
}

// ============================================================================
// Related shows
// ============================================================================

const RELATED_SHOWS_LIMIT = 5

/**
 * Find shows related by shared cast members.
 * Uses DISTINCT on actor_id per show to avoid counting the same actor
 * multiple times across episodes.
 * Orders by number of shared cast members, then by TMDB popularity.
 *
 * @param showTmdbId - The show's TMDB ID
 */
export async function getRelatedShows(showTmdbId: number): Promise<RelatedShow[]> {
  const db = getPool()

  const result = await db.query<{
    tmdb_id: number
    name: string
    first_air_date: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
    shared_cast_count: number
  }>(
    `WITH source_cast AS (
       SELECT DISTINCT actor_id
       FROM actor_show_appearances
       WHERE show_tmdb_id = $1
     ),
     shared_actors AS (
       SELECT DISTINCT asa.show_tmdb_id, asa.actor_id
       FROM actor_show_appearances asa
       JOIN source_cast sc ON asa.actor_id = sc.actor_id
       WHERE asa.show_tmdb_id != $1
     )
     SELECT
       s.tmdb_id,
       s.name,
       s.first_air_date,
       s.poster_path,
       COALESCE(s.deceased_count, 0)::int AS deceased_count,
       COALESCE(s.cast_count, 0)::int AS cast_count,
       COUNT(sa.actor_id)::int AS shared_cast_count
     FROM shared_actors sa
     JOIN shows s ON sa.show_tmdb_id = s.tmdb_id
     WHERE s.is_obscure IS NOT TRUE
     GROUP BY s.tmdb_id, s.name, s.first_air_date, s.poster_path, s.deceased_count, s.cast_count
     ORDER BY shared_cast_count DESC, s.tmdb_popularity DESC NULLS LAST
     LIMIT $2`,
    [showTmdbId, RELATED_SHOWS_LIMIT]
  )

  return result.rows.map((row) => ({
    tmdbId: row.tmdb_id,
    name: row.name,
    firstAirDate: row.first_air_date,
    posterPath: row.poster_path,
    deceasedCount: row.deceased_count,
    castCount: row.cast_count,
    sharedCastCount: row.shared_cast_count,
  }))
}
