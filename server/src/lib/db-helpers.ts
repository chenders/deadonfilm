/**
 * Shared database helper functions for route handlers.
 * These provide graceful fallbacks when database is unavailable.
 */

import { getActors, getPool, batchUpsertActors, type ActorRecord, type ActorInput } from "./db.js"

/**
 * Safely get actors from database, returning empty map if DB unavailable.
 * Used by route handlers that need to check for cached actor data.
 */
export async function getActorsIfAvailable(tmdbIds: number[]): Promise<Map<number, ActorRecord>> {
  if (!process.env.DATABASE_URL) return new Map()
  try {
    return await getActors(tmdbIds)
  } catch (error) {
    console.error("Database read error:", error)
    return new Map()
  }
}

/**
 * Safely get actors by internal IDs from database, returning empty map if DB unavailable.
 * Unlike getActorsIfAvailable (which queries by tmdb_id), this queries by actors.id.
 * Used by route handlers after switching to internal actor IDs.
 */
export async function getActorsByInternalIds(ids: number[]): Promise<Map<number, ActorRecord>> {
  if (!process.env.DATABASE_URL || ids.length === 0) return new Map()
  try {
    const db = getPool()
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ")
    const result = await db.query<ActorRecord>(
      `SELECT * FROM actors WHERE id IN (${placeholders})`,
      ids
    )
    const map = new Map<number, ActorRecord>()
    for (const row of result.rows) {
      map.set(row.id, row)
    }
    return map
  } catch (error) {
    console.error("Database read error:", error)
    return new Map()
  }
}

/**
 * Save deceased persons to database in background (fire-and-forget).
 * Errors are logged but don't propagate to caller.
 */
export function saveDeceasedToDb(persons: ActorInput[]): void {
  if (!process.env.DATABASE_URL) return
  batchUpsertActors(persons).catch((error) => {
    console.error("Database write error:", error)
  })
}
