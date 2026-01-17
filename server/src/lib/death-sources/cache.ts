/**
 * Query cache for death enrichment sources.
 *
 * Stores all API responses permanently to prevent duplicate queries and enable
 * offline analysis. Responses over 50KB are gzip-compressed.
 */

import { createHash } from "crypto"
import { gzip, gunzip } from "zlib"
import { promisify } from "util"
import { getPool } from "../db.js"
import type { DataSourceType } from "./types.js"

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// Compress responses larger than this threshold
const COMPRESSION_THRESHOLD_BYTES = 50 * 1024 // 50KB

// ============================================================================
// Types
// ============================================================================

/**
 * Cached query result from the database.
 */
export interface CachedQueryResult {
  id: number
  sourceType: DataSourceType
  actorId: number | null
  queryString: string
  queryHash: string
  responseStatus: number | null
  responseRaw: unknown
  isCompressed: boolean
  responseSizeBytes: number | null
  errorMessage: string | null
  queriedAt: Date
  responseTimeMs: number | null
  costUsd: number | null
}

/**
 * Data to store in the cache.
 */
export interface CacheEntry {
  sourceType: DataSourceType
  actorId?: number | null
  queryString: string
  responseStatus?: number | null
  responseData?: unknown
  errorMessage?: string | null
  responseTimeMs?: number | null
  costUsd?: number | null
}

// ============================================================================
// Hash Functions
// ============================================================================

/**
 * Generate a SHA256 hash for cache lookup.
 * Combines source type and query string for uniqueness.
 */
export function generateQueryHash(sourceType: DataSourceType, queryString: string): string {
  const input = `${sourceType}:${queryString}`
  return createHash("sha256").update(input, "utf8").digest("hex")
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Check if a query exists in the cache.
 * Returns the cached result if found, null otherwise.
 */
export async function getCachedQuery(
  sourceType: DataSourceType,
  queryString: string
): Promise<CachedQueryResult | null> {
  const pool = getPool()
  const queryHash = generateQueryHash(sourceType, queryString)

  const result = await pool.query<{
    id: number
    source_type: string
    actor_id: number | null
    query_string: string
    query_hash: string
    response_status: number | null
    response_raw: unknown
    response_compressed: Buffer | null
    is_compressed: boolean
    response_size_bytes: number | null
    error_message: string | null
    queried_at: Date
    response_time_ms: number | null
    cost_usd: string | null
  }>(
    `SELECT id, source_type, actor_id, query_string, query_hash,
            response_status, response_raw, response_compressed, is_compressed,
            response_size_bytes, error_message, queried_at, response_time_ms, cost_usd
     FROM source_query_cache
     WHERE source_type = $1 AND query_hash = $2`,
    [sourceType, queryHash]
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]

  // Decompress if necessary
  let responseRaw = row.response_raw
  if (row.is_compressed && row.response_compressed) {
    try {
      const decompressed = await gunzipAsync(row.response_compressed)
      responseRaw = JSON.parse(decompressed.toString("utf8"))
    } catch {
      // If decompression fails, return null raw data
      responseRaw = null
    }
  }

  return {
    id: row.id,
    sourceType: row.source_type as DataSourceType,
    actorId: row.actor_id,
    queryString: row.query_string,
    queryHash: row.query_hash,
    responseStatus: row.response_status,
    responseRaw,
    isCompressed: row.is_compressed,
    responseSizeBytes: row.response_size_bytes,
    errorMessage: row.error_message,
    queriedAt: row.queried_at,
    responseTimeMs: row.response_time_ms,
    costUsd: row.cost_usd ? parseFloat(row.cost_usd) : null,
  }
}

/**
 * Store a query result in the cache.
 * Compresses large responses automatically.
 */
export async function setCachedQuery(entry: CacheEntry): Promise<void> {
  const pool = getPool()
  const queryHash = generateQueryHash(entry.sourceType, entry.queryString)

  // Serialize response data
  const responseJson = entry.responseData !== undefined ? JSON.stringify(entry.responseData) : null
  const responseSizeBytes = responseJson ? Buffer.byteLength(responseJson, "utf8") : null

  // Determine if compression is needed
  let responseRaw: unknown = null
  let responseCompressed: Buffer | null = null
  let isCompressed = false

  if (responseJson && responseSizeBytes !== null) {
    if (responseSizeBytes > COMPRESSION_THRESHOLD_BYTES) {
      // Compress large responses
      responseCompressed = await gzipAsync(Buffer.from(responseJson, "utf8"))
      isCompressed = true
    } else {
      // Store small responses as JSONB
      responseRaw = entry.responseData
    }
  }

  // Upsert into cache (update if exists, insert if not)
  await pool.query(
    `INSERT INTO source_query_cache (
       source_type, actor_id, query_string, query_hash,
       response_status, response_raw, response_compressed, is_compressed,
       response_size_bytes, error_message, queried_at, response_time_ms, cost_usd
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
     ON CONFLICT (source_type, query_hash) DO UPDATE SET
       actor_id = COALESCE(EXCLUDED.actor_id, source_query_cache.actor_id),
       response_status = EXCLUDED.response_status,
       response_raw = EXCLUDED.response_raw,
       response_compressed = EXCLUDED.response_compressed,
       is_compressed = EXCLUDED.is_compressed,
       response_size_bytes = EXCLUDED.response_size_bytes,
       error_message = EXCLUDED.error_message,
       queried_at = NOW(),
       response_time_ms = EXCLUDED.response_time_ms,
       cost_usd = EXCLUDED.cost_usd`,
    [
      entry.sourceType,
      entry.actorId ?? null,
      entry.queryString,
      queryHash,
      entry.responseStatus ?? null,
      responseRaw,
      responseCompressed,
      isCompressed,
      responseSizeBytes,
      entry.errorMessage ?? null,
      entry.responseTimeMs ?? null,
      entry.costUsd ?? null,
    ]
  )
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Get cache statistics for monitoring and debugging.
 */
export interface CacheStats {
  totalEntries: number
  entriesBySource: Record<string, number>
  totalSizeBytes: number
  compressedEntries: number
  errorEntries: number
  oldestEntry: Date | null
  newestEntry: Date | null
}

export async function getCacheStats(): Promise<CacheStats> {
  const pool = getPool()

  const [countResult, sizeResult, compressedResult, errorResult, dateResult] = await Promise.all([
    pool.query<{ source_type: string; count: string }>(
      `SELECT source_type, COUNT(*) as count
       FROM source_query_cache
       GROUP BY source_type`
    ),
    pool.query<{ total_size: string }>(
      `SELECT COALESCE(SUM(response_size_bytes), 0) as total_size
       FROM source_query_cache`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM source_query_cache
       WHERE is_compressed = true`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM source_query_cache
       WHERE error_message IS NOT NULL`
    ),
    pool.query<{ oldest: Date | null; newest: Date | null }>(
      `SELECT MIN(queried_at) as oldest, MAX(queried_at) as newest
       FROM source_query_cache`
    ),
  ])

  const entriesBySource: Record<string, number> = {}
  let totalEntries = 0
  for (const row of countResult.rows) {
    entriesBySource[row.source_type] = parseInt(row.count, 10)
    totalEntries += parseInt(row.count, 10)
  }

  return {
    totalEntries,
    entriesBySource,
    totalSizeBytes: parseInt(sizeResult.rows[0].total_size, 10),
    compressedEntries: parseInt(compressedResult.rows[0].count, 10),
    errorEntries: parseInt(errorResult.rows[0].count, 10),
    oldestEntry: dateResult.rows[0].oldest,
    newestEntry: dateResult.rows[0].newest,
  }
}

/**
 * Get cost statistics by source type.
 */
export interface CostStats {
  totalCostUsd: number
  costBySource: Record<string, number>
  queriesWithCost: number
}

export async function getCostStats(): Promise<CostStats> {
  const pool = getPool()

  const result = await pool.query<{
    source_type: string
    total_cost: string
    query_count: string
  }>(
    `SELECT source_type,
            COALESCE(SUM(cost_usd), 0) as total_cost,
            COUNT(*) as query_count
     FROM source_query_cache
     WHERE cost_usd IS NOT NULL AND cost_usd > 0
     GROUP BY source_type`
  )

  const costBySource: Record<string, number> = {}
  let totalCostUsd = 0
  let queriesWithCost = 0

  for (const row of result.rows) {
    const cost = parseFloat(row.total_cost)
    costBySource[row.source_type] = cost
    totalCostUsd += cost
    queriesWithCost += parseInt(row.query_count, 10)
  }

  return {
    totalCostUsd,
    costBySource,
    queriesWithCost,
  }
}

// ============================================================================
// Cache Maintenance
// ============================================================================

/**
 * Get cached queries for a specific actor.
 * Useful for debugging and analysis.
 */
export async function getCachedQueriesForActor(actorId: number): Promise<CachedQueryResult[]> {
  const pool = getPool()

  const result = await pool.query<{
    id: number
    source_type: string
    actor_id: number | null
    query_string: string
    query_hash: string
    response_status: number | null
    response_raw: unknown
    response_compressed: Buffer | null
    is_compressed: boolean
    response_size_bytes: number | null
    error_message: string | null
    queried_at: Date
    response_time_ms: number | null
    cost_usd: string | null
  }>(
    `SELECT id, source_type, actor_id, query_string, query_hash,
            response_status, response_raw, response_compressed, is_compressed,
            response_size_bytes, error_message, queried_at, response_time_ms, cost_usd
     FROM source_query_cache
     WHERE actor_id = $1
     ORDER BY queried_at DESC`,
    [actorId]
  )

  const results: CachedQueryResult[] = []
  for (const row of result.rows) {
    let responseRaw = row.response_raw
    if (row.is_compressed && row.response_compressed) {
      try {
        const decompressed = await gunzipAsync(row.response_compressed)
        responseRaw = JSON.parse(decompressed.toString("utf8"))
      } catch {
        responseRaw = null
      }
    }

    results.push({
      id: row.id,
      sourceType: row.source_type as DataSourceType,
      actorId: row.actor_id,
      queryString: row.query_string,
      queryHash: row.query_hash,
      responseStatus: row.response_status,
      responseRaw,
      isCompressed: row.is_compressed,
      responseSizeBytes: row.response_size_bytes,
      errorMessage: row.error_message,
      queriedAt: row.queried_at,
      responseTimeMs: row.response_time_ms,
      costUsd: row.cost_usd ? parseFloat(row.cost_usd) : null,
    })
  }

  return results
}

/**
 * Delete cached queries older than a specified date.
 * Use with caution - the cache is meant to be permanent.
 */
export async function deleteCachedQueriesOlderThan(date: Date): Promise<number> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM source_query_cache WHERE queried_at < $1`, [date])
  return result.rowCount ?? 0
}

/**
 * Delete all cached queries for a specific source.
 * Useful when a source's response format changes.
 */
export async function deleteCachedQueriesForSource(sourceType: DataSourceType): Promise<number> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM source_query_cache WHERE source_type = $1`, [
    sourceType,
  ])
  return result.rowCount ?? 0
}

/**
 * Web search source types that can be cleared together.
 */
const WEB_SEARCH_SOURCES: DataSourceType[] = [
  "duckduckgo" as DataSourceType,
  "google_search" as DataSourceType,
  "bing_search" as DataSourceType,
  "brave_search" as DataSourceType,
]

/**
 * Clear all cached web search results.
 * Use when upgrading search functionality (e.g., adding link following).
 */
export async function clearWebSearchCache(): Promise<{
  totalDeleted: number
  deletedBySource: Record<string, number>
}> {
  const pool = getPool()
  const deletedBySource: Record<string, number> = {}
  let totalDeleted = 0

  for (const sourceType of WEB_SEARCH_SOURCES) {
    const result = await pool.query(`DELETE FROM source_query_cache WHERE source_type = $1`, [
      sourceType,
    ])
    const count = result.rowCount ?? 0
    if (count > 0) {
      deletedBySource[sourceType] = count
      totalDeleted += count
    }
  }

  return { totalDeleted, deletedBySource }
}

/**
 * Clear all cached queries for a specific actor.
 * Use to re-process a specific actor with new settings.
 */
export async function clearCacheForActor(actorId: number): Promise<number> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM source_query_cache WHERE actor_id = $1`, [actorId])
  return result.rowCount ?? 0
}

/**
 * Clear all cached queries for multiple actors.
 */
export async function clearCacheForActors(actorIds: number[]): Promise<number> {
  if (actorIds.length === 0) return 0

  const pool = getPool()
  const result = await pool.query(`DELETE FROM source_query_cache WHERE actor_id = ANY($1)`, [
    actorIds,
  ])
  return result.rowCount ?? 0
}

/**
 * Clear the entire source query cache.
 * WARNING: This deletes all cached data permanently!
 */
export async function clearAllCache(): Promise<number> {
  const pool = getPool()
  const result = await pool.query(`DELETE FROM source_query_cache`)
  return result.rowCount ?? 0
}

/**
 * Reset cause_of_death_checked_at for actors to allow re-selection.
 * Use with cache clearing to fully re-process actors.
 */
export async function resetActorEnrichmentStatus(options?: {
  actorIds?: number[]
  sourceTypes?: DataSourceType[]
}): Promise<number> {
  const pool = getPool()

  if (options?.actorIds && options.actorIds.length > 0) {
    // Reset specific actors
    const result = await pool.query(
      `UPDATE actors SET cause_of_death_checked_at = NULL WHERE id = ANY($1)`,
      [options.actorIds]
    )
    return result.rowCount ?? 0
  } else if (options?.sourceTypes && options.sourceTypes.length > 0) {
    // Reset actors who were processed by specific sources
    const result = await pool.query(
      `UPDATE actors SET cause_of_death_checked_at = NULL
       WHERE id IN (
         SELECT DISTINCT actor_id FROM source_query_cache
         WHERE source_type = ANY($1) AND actor_id IS NOT NULL
       )`,
      [options.sourceTypes]
    )
    return result.rowCount ?? 0
  } else {
    // Reset all actors with checked_at set
    const result = await pool.query(
      `UPDATE actors SET cause_of_death_checked_at = NULL
       WHERE cause_of_death_checked_at IS NOT NULL`
    )
    return result.rowCount ?? 0
  }
}
