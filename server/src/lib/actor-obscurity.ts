/**
 * Shared actor obscurity calculation logic.
 *
 * An actor is NOT obscure if ANY of these conditions are true:
 * - Has appeared in a movie with popularity >= 20 (hit film)
 * - Has appeared in a TV show with popularity >= 20 (hit show)
 * - Has 3+ English movies with popularity >= 5 (established in English film market)
 * - Has 3+ English TV shows with popularity >= 5 (established in English TV market)
 * - Has 10+ movies total (prolific film actor)
 * - Has 50+ TV episodes total (prolific TV actor)
 *
 * Used by:
 * - sync-tmdb-changes.ts (recalculates after new death detection)
 * - calculate-actor-obscurity.ts (BullMQ job handler)
 * - backfill-actor-obscure.ts (one-time backfill script)
 */

import { getPool } from "./db.js"

export const OBSCURITY_THRESHOLDS = {
  HIT_MOVIE_POPULARITY: 20,
  HIT_SHOW_POPULARITY: 20,
  ENGLISH_CONTENT_POPULARITY: 5,
  MIN_ENGLISH_MOVIES: 3,
  MIN_ENGLISH_SHOWS: 3,
  MIN_TOTAL_MOVIES: 10,
  MIN_TOTAL_EPISODES: 50,
}

export interface ObscurityResult {
  id: number
  name: string
  oldObscure: boolean
  newObscure: boolean
}

/**
 * Recalculate and update is_obscure for specific actors.
 * Returns the list of actors whose obscurity status changed.
 */
export async function recalculateActorObscurity(actorIds: number[]): Promise<ObscurityResult[]> {
  if (actorIds.length === 0) return []

  const pool = getPool()
  const T = OBSCURITY_THRESHOLDS

  const result = await pool.query<{
    id: number
    name: string
    old_obscure: boolean
    new_obscure: boolean
  }>(
    `
    WITH actor_metrics AS (
      SELECT
        a.id,
        a.name,
        a.is_obscure as old_obscure,
        CASE
          WHEN COALESCE(ma.max_movie_pop, 0) >= $1 THEN false
          WHEN COALESCE(ta.max_show_pop, 0) >= $2 THEN false
          WHEN COALESCE(ma.en_movies_pop5, 0) >= $3 THEN false
          WHEN COALESCE(ta.en_shows_pop5, 0) >= $4 THEN false
          WHEN COALESCE(ma.movie_count, 0) >= $5 THEN false
          WHEN COALESCE(ta.episode_count, 0) >= $6 THEN false
          ELSE true
        END as new_obscure
      FROM actors a
      LEFT JOIN (
        SELECT
          ama.actor_id,
          COUNT(*)::int as movie_count,
          MAX(m.tmdb_popularity) as max_movie_pop,
          COUNT(*) FILTER (WHERE m.original_language = 'en' AND m.tmdb_popularity >= $7)::int as en_movies_pop5
        FROM actor_movie_appearances ama
        JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
        WHERE ama.actor_id = ANY($8)
        GROUP BY ama.actor_id
      ) ma ON ma.actor_id = a.id
      LEFT JOIN (
        SELECT
          asa.actor_id,
          COUNT(*)::int as episode_count,
          MAX(s.tmdb_popularity) as max_show_pop,
          COUNT(DISTINCT asa.show_tmdb_id) FILTER (WHERE s.original_language = 'en' AND s.tmdb_popularity >= $7)::int as en_shows_pop5
        FROM actor_show_appearances asa
        JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
        WHERE asa.actor_id = ANY($8)
        GROUP BY asa.actor_id
      ) ta ON ta.actor_id = a.id
      WHERE a.id = ANY($8)
    )
    UPDATE actors a
    SET
      is_obscure = am.new_obscure,
      updated_at = NOW()
    FROM actor_metrics am
    WHERE a.id = am.id
    RETURNING a.id, am.name, am.old_obscure, am.new_obscure
    `,
    [
      T.HIT_MOVIE_POPULARITY,
      T.HIT_SHOW_POPULARITY,
      T.MIN_ENGLISH_MOVIES,
      T.MIN_ENGLISH_SHOWS,
      T.MIN_TOTAL_MOVIES,
      T.MIN_TOTAL_EPISODES,
      T.ENGLISH_CONTENT_POPULARITY,
      actorIds,
    ]
  )

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    oldObscure: row.old_obscure,
    newObscure: row.new_obscure,
  }))
}
