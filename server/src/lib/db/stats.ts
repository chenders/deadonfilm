/**
 * Site statistics and sync state database functions.
 */

import { getPool } from "./pool.js"
import type { SiteStats, SyncStateRecord } from "./types.js"
import { categorizeCauseOfDeath, CAUSE_CATEGORIES } from "../cause-categories.js"

// ============================================================================
// Site Stats caching
// ============================================================================

let siteStatsCache: SiteStats | null = null
let siteStatsCacheExpiry = 0
const SITE_STATS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Clear the site stats cache (used in tests).
 */
export function clearSiteStatsCache(): void {
  siteStatsCache = null
  siteStatsCacheExpiry = 0
}

/**
 * Get aggregated site statistics (cached for 5 minutes).
 */
export async function getSiteStats(): Promise<SiteStats> {
  const now = Date.now()

  // Return cached result if still valid
  if (siteStatsCache && now < siteStatsCacheExpiry) {
    return siteStatsCache
  }

  const db = getPool()

  // Get counts and top cause of death in a single query
  const result = await db.query<{
    total_all_actors: string
    total_deceased_actors: string
    total_movies: string
    top_cause: string | null
    avg_mortality: string | null
    cause_pct: string | null
    cause_known_count: string | null
  }>(`
    SELECT
      (SELECT COUNT(*) FROM actors) as total_all_actors,
      (SELECT COUNT(*) FROM actors WHERE deathday IS NOT NULL) as total_deceased_actors,
      (SELECT COUNT(*) FROM movies WHERE mortality_surprise_score IS NOT NULL) as total_movies,
      (SELECT cause_of_death FROM actors
       WHERE cause_of_death IS NOT NULL
       GROUP BY cause_of_death
       ORDER BY COUNT(*) DESC
       LIMIT 1) as top_cause,
      (SELECT ROUND(AVG(
        CASE WHEN cast_count > 0
          THEN (deceased_count::numeric / cast_count) * 100
          ELSE NULL
        END
      ), 1) FROM movies WHERE cast_count > 0) as avg_mortality,
      (SELECT ROUND(
        COUNT(*) FILTER (WHERE cause_of_death IS NOT NULL)::numeric /
        NULLIF(COUNT(*), 0) * 100, 1
      ) FROM actors WHERE deathday IS NOT NULL) as cause_pct,
      (SELECT COUNT(*) FROM actors WHERE deathday IS NOT NULL AND cause_of_death IS NOT NULL) as cause_known_count
  `)

  const row = result.rows[0]

  // Compute category slug from top cause of death
  let topCauseOfDeathCategorySlug: string | null = null
  if (row.top_cause) {
    const categoryKey = categorizeCauseOfDeath(row.top_cause)
    topCauseOfDeathCategorySlug = CAUSE_CATEGORIES[categoryKey].slug
  }

  const stats: SiteStats = {
    totalActors: parseInt(row.total_all_actors, 10) || 0,
    totalDeceasedActors: parseInt(row.total_deceased_actors, 10) || 0,
    totalMoviesAnalyzed: parseInt(row.total_movies, 10) || 0,
    topCauseOfDeath: row.top_cause,
    topCauseOfDeathCategorySlug,
    avgMortalityPercentage: row.avg_mortality ? parseFloat(row.avg_mortality) : null,
    causeOfDeathPercentage: row.cause_pct ? parseFloat(row.cause_pct) : null,
    actorsWithCauseKnown: row.cause_known_count ? parseInt(row.cause_known_count, 10) : null,
  }

  // Cache the result
  siteStatsCache = stats
  siteStatsCacheExpiry = now + SITE_STATS_CACHE_TTL_MS

  return stats
}

// ============================================================================
// Sync state functions for TMDB Changes API synchronization
// ============================================================================

/**
 * Get sync state for a given sync type.
 * @param syncType - The sync type identifier (e.g., 'person_changes', 'movie_changes')
 * @returns The sync state record, or null if no sync has been run for this type
 */
export async function getSyncState(syncType: string): Promise<SyncStateRecord | null> {
  const db = getPool()
  const result = await db.query<SyncStateRecord>(
    `SELECT sync_type, last_sync_date::text, last_run_at, items_processed, new_deaths_found, movies_updated, errors_count,
            current_phase, last_processed_id, phase_total, phase_completed
     FROM sync_state WHERE sync_type = $1`,
    [syncType]
  )
  return result.rows[0] || null
}

/**
 * Update or insert sync state. Uses COALESCE to preserve existing values
 * when fields are not provided (null/undefined).
 * @param state - Partial sync state with required sync_type. Omit fields to preserve existing DB values.
 */
export async function updateSyncState(
  state: Partial<SyncStateRecord> & { sync_type: string }
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO sync_state (sync_type, last_sync_date, last_run_at, items_processed, new_deaths_found, movies_updated, errors_count, current_phase, last_processed_id, phase_total, phase_completed)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (sync_type) DO UPDATE SET
       last_sync_date = COALESCE($2, sync_state.last_sync_date),
       last_run_at = NOW(),
       items_processed = COALESCE($3, sync_state.items_processed),
       new_deaths_found = COALESCE($4, sync_state.new_deaths_found),
       movies_updated = COALESCE($5, sync_state.movies_updated),
       errors_count = COALESCE($6, sync_state.errors_count),
       current_phase = COALESCE($7, sync_state.current_phase),
       last_processed_id = COALESCE($8, sync_state.last_processed_id),
       phase_total = COALESCE($9, sync_state.phase_total),
       phase_completed = COALESCE($10, sync_state.phase_completed)`,
    [
      state.sync_type,
      state.last_sync_date || null,
      state.items_processed ?? null,
      state.new_deaths_found ?? null,
      state.movies_updated ?? null,
      state.errors_count ?? null,
      state.current_phase ?? null,
      state.last_processed_id ?? null,
      state.phase_total ?? null,
      state.phase_completed ?? null,
    ]
  )
}

// ============================================================================
// ID lookup functions for sync operations
// ============================================================================

/**
 * Get all unique actor TMDB IDs from actor_appearances (excludes actors without TMDB IDs).
 */
export async function getAllActorTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(
    `SELECT DISTINCT a.tmdb_id
     FROM actor_movie_appearances ama
     JOIN actors a ON ama.actor_id = a.id
     WHERE a.tmdb_id IS NOT NULL
     UNION
     SELECT DISTINCT a.tmdb_id
     FROM actor_show_appearances asa
     JOIN actors a ON asa.actor_id = a.id
     WHERE a.tmdb_id IS NOT NULL`
  )
  return new Set(result.rows.map((r) => r.tmdb_id))
}

/**
 * Get all TMDB IDs of deceased persons in our database.
 */
export async function getDeceasedTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(
    `SELECT tmdb_id FROM actors WHERE deathday IS NOT NULL`
  )
  return new Set(result.rows.map((r) => r.tmdb_id))
}

/**
 * Get all movie TMDB IDs from movies table.
 */
export async function getAllMovieTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(`SELECT tmdb_id FROM movies`)
  return new Set(result.rows.map((r) => r.tmdb_id))
}
