/**
 * Database module barrel file.
 *
 * This file provides a single entry point for database functionality.
 * For now, it re-exports from the main db.ts file.
 * As we split db.ts into domain modules, exports will be added here.
 *
 * Structure:
 * - ./pool.ts - Connection pool management
 * - ./types.ts - Type definitions (interfaces, type aliases)
 * - ./stats.ts - Site statistics and sync state functions
 */

// Re-export pool functions
export { getPool, resetPool, queryWithRetry, initDatabase } from "./pool.js"

// Re-export stats functions
export {
  getSiteStats,
  getSyncState,
  updateSyncState,
  getAllActorTmdbIds,
  getDeceasedTmdbIds,
  getAllMovieTmdbIds,
} from "./stats.js"

// Re-export all types
export type * from "./types.js"
