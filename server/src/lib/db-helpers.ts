/**
 * Shared database helper functions for route handlers.
 * These provide graceful fallbacks when database is unavailable.
 */

import { getActors, batchUpsertActors, type ActorRecord, type ActorInput } from "./db.js"

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
 * Save deceased persons to database in background (fire-and-forget).
 * Errors are logged but don't propagate to caller.
 */
export function saveDeceasedToDb(persons: ActorInput[]): void {
  if (!process.env.DATABASE_URL) return
  batchUpsertActors(persons).catch((error) => {
    console.error("Database write error:", error)
  })
}
