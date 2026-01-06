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
 */

// Re-export pool functions
export { getPool, resetPool, queryWithRetry, initDatabase } from "./pool.js"

// Re-export all types
export type * from "./types.js"
