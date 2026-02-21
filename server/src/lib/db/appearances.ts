/**
 * Actor appearances database functions.
 *
 * Functions for managing actor appearances in movies and TV shows.
 */

import { getPool } from "./pool.js"
import type { ActorMovieAppearanceRecord, ShowActorAppearanceRecord } from "./types.js"

// ============================================================================
// Shared deduplication helper
// ============================================================================

/** Deduplicate records by a composite key, keeping the entry with the lowest
 *  non-null billing_order. When both entries have null billing_order, keeps the first. */
function deduplicateByKey<T extends { billing_order: number | null }>(
  items: T[],
  keyFn: (item: T) => string
): T[] {
  const bestByKey = new Map<string, T>()
  for (const item of items) {
    const key = keyFn(item)
    const existing = bestByKey.get(key)
    if (!existing) {
      bestByKey.set(key, item)
      continue
    }
    if (
      (existing.billing_order == null && item.billing_order != null) ||
      (existing.billing_order != null &&
        item.billing_order != null &&
        item.billing_order < existing.billing_order)
    ) {
      bestByKey.set(key, item)
    }
  }
  return Array.from(bestByKey.values())
}

// ============================================================================
// Movie actor appearances
// ============================================================================

// Insert or update an actor movie appearance
export async function upsertActorMovieAppearance(
  appearance: ActorMovieAppearanceRecord
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO actor_movie_appearances (actor_id, movie_tmdb_id, character_name, billing_order, age_at_filming, appearance_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (actor_id, movie_tmdb_id) DO UPDATE SET
       character_name = EXCLUDED.character_name,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming,
       appearance_type = EXCLUDED.appearance_type`,
    [
      appearance.actor_id,
      appearance.movie_tmdb_id,
      appearance.character_name,
      appearance.billing_order,
      appearance.age_at_filming,
      appearance.appearance_type,
    ]
  )
}

// Batch insert actor movie appearances using bulk VALUES for efficiency
// Wraps all chunks in a single transaction for all-or-nothing behavior
export async function batchUpsertActorMovieAppearances(
  appearances: ActorMovieAppearanceRecord[]
): Promise<void> {
  if (appearances.length === 0) return

  // Deduplicate by (actor_id, movie_tmdb_id) — TMDB credits can list the same
  // actor multiple times (e.g., dual roles).
  const deduped = deduplicateByKey(appearances, (a) => `${a.actor_id}:${a.movie_tmdb_id}`)

  const db = getPool()
  const client = await db.connect()

  try {
    await client.query("BEGIN")

    // Process in chunks of 100 to avoid query size limits
    const CHUNK_SIZE = 100
    for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
      const chunk = deduped.slice(i, i + CHUNK_SIZE)

      // Build VALUES clause with numbered parameters (6 columns)
      const values: unknown[] = []
      const placeholders = chunk.map((appearance, index) => {
        const offset = index * 6
        values.push(
          appearance.actor_id,
          appearance.movie_tmdb_id,
          appearance.character_name,
          appearance.billing_order,
          appearance.age_at_filming,
          appearance.appearance_type
        )
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
      })

      await client.query(
        `INSERT INTO actor_movie_appearances (
           actor_id, movie_tmdb_id, character_name, billing_order, age_at_filming, appearance_type
         )
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (actor_id, movie_tmdb_id) DO UPDATE SET
           character_name = EXCLUDED.character_name,
           billing_order = EXCLUDED.billing_order,
           age_at_filming = EXCLUDED.age_at_filming,
           appearance_type = EXCLUDED.appearance_type`,
        values
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Get all movies an actor has appeared in (with actor info from actors table)
export async function getActorMovies(
  actorTmdbId: number
): Promise<(ActorMovieAppearanceRecord & { actor_name: string; is_deceased: boolean })[]> {
  const db = getPool()
  const result = await db.query<
    ActorMovieAppearanceRecord & { actor_name: string; is_deceased: boolean }
  >(
    `SELECT ama.*, a.name as actor_name, a.deathday IS NOT NULL as is_deceased
     FROM actor_movie_appearances ama
     JOIN actors a ON ama.actor_id = a.id
     WHERE a.tmdb_id = $1`,
    [actorTmdbId]
  )
  return result.rows
}

// ============================================================================
// Show actor appearances
// ============================================================================

// Insert or update a show actor appearance
export async function upsertShowActorAppearance(
  appearance: ShowActorAppearanceRecord
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO actor_show_appearances (
       actor_id, show_tmdb_id, season_number, episode_number,
       character_name, appearance_type, billing_order, age_at_filming
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (actor_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
       character_name = EXCLUDED.character_name,
       appearance_type = EXCLUDED.appearance_type,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming`,
    [
      appearance.actor_id,
      appearance.show_tmdb_id,
      appearance.season_number,
      appearance.episode_number,
      appearance.character_name,
      appearance.appearance_type,
      appearance.billing_order,
      appearance.age_at_filming,
    ]
  )
}

// Batch insert show actor appearances using bulk VALUES for efficiency
// Wraps all chunks in a single transaction for all-or-nothing behavior
export async function batchUpsertShowActorAppearances(
  appearances: ShowActorAppearanceRecord[]
): Promise<void> {
  if (appearances.length === 0) return

  // Deduplicate by (actor_id, show_tmdb_id, season_number, episode_number) —
  // TMDB credits can list the same actor multiple times per episode.
  const deduped = deduplicateByKey(
    appearances,
    (a) => `${a.actor_id}:${a.show_tmdb_id}:${a.season_number}:${a.episode_number}`
  )

  const db = getPool()
  const client = await db.connect()

  try {
    await client.query("BEGIN")

    // Process in chunks of 100 to avoid query size limits
    const CHUNK_SIZE = 100
    for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
      const chunk = deduped.slice(i, i + CHUNK_SIZE)

      // Build VALUES clause with numbered parameters (8 columns now)
      const values: unknown[] = []
      const placeholders = chunk.map((appearance, index) => {
        const offset = index * 8
        values.push(
          appearance.actor_id,
          appearance.show_tmdb_id,
          appearance.season_number,
          appearance.episode_number,
          appearance.character_name,
          appearance.appearance_type,
          appearance.billing_order,
          appearance.age_at_filming
        )
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
      })

      await client.query(
        `INSERT INTO actor_show_appearances (
           actor_id, show_tmdb_id, season_number, episode_number,
           character_name, appearance_type, billing_order, age_at_filming
         )
         VALUES ${placeholders.join(", ")}
         ON CONFLICT (actor_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
           character_name = EXCLUDED.character_name,
           appearance_type = EXCLUDED.appearance_type,
           billing_order = EXCLUDED.billing_order,
           age_at_filming = EXCLUDED.age_at_filming`,
        values
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Get unique actors for a show (aggregated across all episodes)
export async function getShowActors(showTmdbId: number): Promise<
  Array<{
    actorId: number
    actorTmdbId: number | null
    actorName: string
    isDeceased: boolean
  }>
> {
  const db = getPool()
  const result = await db.query<{
    actor_id: number
    actor_tmdb_id: number | null
    actor_name: string
    is_deceased: boolean
  }>(
    `SELECT DISTINCT asa.actor_id, a.tmdb_id as actor_tmdb_id, a.name as actor_name, (a.deathday IS NOT NULL) as is_deceased
     FROM actor_show_appearances asa
     JOIN actors a ON asa.actor_id = a.id
     WHERE asa.show_tmdb_id = $1
     ORDER BY a.name`,
    [showTmdbId]
  )
  return result.rows.map((row) => ({
    actorId: row.actor_id,
    actorTmdbId: row.actor_tmdb_id,
    actorName: row.actor_name,
    isDeceased: row.is_deceased,
  }))
}
