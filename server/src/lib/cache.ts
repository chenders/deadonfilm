/**
 * Cache utilities for server-side Redis caching.
 * Provides type-safe get/set operations with automatic serialization.
 */
import { getRedisClient } from "./redis.js"
import { logger } from "./logger.js"
import newrelic from "newrelic"
import { getRecentDeaths, getSiteStats, getDeathsThisWeekSimple } from "./db.js"
import {
  instrumentedGet,
  instrumentedSet,
  instrumentedDel,
  instrumentedScan,
} from "./redis-instrumentation.js"

// Cache key prefixes for different data types
export const CACHE_PREFIX = {
  RECENT_DEATHS: "recent-deaths",
  THIS_WEEK: "this-week",
  STATS: "stats",
  TRIVIA: "trivia",
  CURSED_MOVIES: "cursed-movies",
  CURSED_ACTORS: "cursed-actors",
  DEATH_WATCH: "death-watch",
  CAUSES: "causes",
  DECADES: "decades",
  MOVIE: "movie",
  ACTOR: "actor",
  SHOW: "show",
  POPULAR_MOVIES: "popular-movies",
  COVID_DEATHS: "covid-deaths",
  UNNATURAL_DEATHS: "unnatural-deaths",
  FEATURED_MOVIE: "featured-movie",
  GENRES: "genres",
  DEATHS: "deaths",
  CACHE_METADATA: "cache-metadata",
} as const

/**
 * Metadata about the death cache state.
 * Stored when caches are rebuilt.
 */
export interface DeathCacheMetadata {
  lastRebuiltAt: string
  mostRecentDeath?: {
    name: string
    deathday: string
  }
}

// TTL values in seconds
// Using long TTLs since we invalidate/rebuild caches when data changes
export const CACHE_TTL = {
  SHORT: 300, // 5 minutes - search results, transient data
  WEEK: 604800, // 1 week - standard TTL for data invalidated on change
} as const

/**
 * Build a cache key from prefix and optional parameters.
 * Parameters are sorted for consistent key generation.
 */
export function buildCacheKey(prefix: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) {
    return prefix
  }
  // Sort keys for consistent cache key generation
  const sortedParams = Object.keys(params)
    .sort()
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => `${k}:${params[k]}`)
    .join(":")
  return sortedParams ? `${prefix}:${sortedParams}` : prefix
}

/**
 * Cache key descriptors for each entity type.
 * These define ALL cache keys associated with an entity.
 * When invalidating, ALL keys for that entity should be cleared.
 */
export const CACHE_KEYS = {
  actor: (actorId: number) => ({
    profile: buildCacheKey(CACHE_PREFIX.ACTOR, { id: actorId }),
    death: buildCacheKey(CACHE_PREFIX.ACTOR, { id: actorId, type: "death" }),
  }),
  movie: (tmdbId: number) => ({
    details: buildCacheKey(CACHE_PREFIX.MOVIE, { id: tmdbId }),
  }),
  show: (tmdbId: number) => ({
    details: buildCacheKey(CACHE_PREFIX.SHOW, { id: tmdbId }),
  }),
} as const

/**
 * Get all cache keys for an actor. Use this to see exactly what keys exist.
 */
export function getActorCacheKeys(actorId: number): string[] {
  const keys = CACHE_KEYS.actor(actorId)
  return Object.values(keys)
}

/**
 * Get a cached value, returning null if not found or Redis unavailable.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedisClient()
  if (!client) return null

  try {
    const cached = await instrumentedGet(key)
    if (cached) {
      logger.debug({ key }, "Cache hit")
      newrelic.recordCustomEvent("CacheAccess", { key, hit: true })
      return JSON.parse(cached) as T
    }
    logger.debug({ key }, "Cache miss")
    newrelic.recordCustomEvent("CacheAccess", { key, hit: false })
    return null
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, "Cache get error")
    return null
  }
}

/**
 * Set a cached value with TTL.
 */
export async function setCached<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const client = getRedisClient()
  if (!client) return

  try {
    await instrumentedSet(key, JSON.stringify(value), ttlSeconds)
    logger.debug({ key, ttl: ttlSeconds }, "Cache set")
  } catch (err) {
    logger.warn({ err: (err as Error).message, key }, "Cache set error")
  }
}

/**
 * Delete cached values by pattern.
 * Use sparingly - SCAN is O(N) on total keys.
 */
export async function invalidateByPattern(pattern: string): Promise<number> {
  const client = getRedisClient()
  if (!client) return 0

  try {
    const keys = await instrumentedScan(pattern, 100)
    let deleted = 0

    if (keys.length > 0) {
      deleted = await instrumentedDel(...keys)
    }

    if (deleted > 0) {
      logger.info({ pattern, deleted }, "Cache invalidated by pattern")
    }
    return deleted
  } catch (err) {
    logger.warn({ err: (err as Error).message, pattern }, "Cache invalidation error")
    return 0
  }
}

/**
 * Invalidate specific cache keys.
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  const client = getRedisClient()
  if (!client || keys.length === 0) return

  try {
    await instrumentedDel(...keys)
    logger.info({ keys }, "Cache keys invalidated")
  } catch (err) {
    logger.warn({ err: (err as Error).message, keys }, "Cache invalidation error")
  }
}

/**
 * Flush all cache keys (use with caution).
 */
export async function flushCache(): Promise<void> {
  const client = getRedisClient()
  if (!client) return

  try {
    await client.flushdb()
    logger.info("Cache flushed")
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Cache flush error")
  }
}

/**
 * Invalidate cache for a specific actor by internal actor ID.
 * Call this after updating an actor's death information.
 * Invalidates both the actor profile cache and death details cache.
 */
export async function invalidateActorCache(actorId: number): Promise<void> {
  const keys = getActorCacheKeys(actorId)
  await invalidateKeys(...keys)
}

/**
 * Invalidate actor cache, throwing if Redis is unavailable.
 * Use this in scripts where cache invalidation is required.
 */
export async function invalidateActorCacheRequired(actorId: number): Promise<void> {
  const client = getRedisClient()
  if (!client) {
    throw new Error("Redis client not available - cannot invalidate cache")
  }
  const keys = getActorCacheKeys(actorId)
  await instrumentedDel(...keys)
  logger.info({ keys, actorId }, "Actor cache invalidated")
}

/**
 * Invalidate caches related to death data.
 * Call this when new deaths are recorded.
 */
export async function invalidateDeathCaches(): Promise<void> {
  await Promise.all([
    invalidateByPattern(`${CACHE_PREFIX.RECENT_DEATHS}:*`),
    invalidateByPattern(`${CACHE_PREFIX.THIS_WEEK}:*`),
    invalidateByPattern(`${CACHE_PREFIX.DEATH_WATCH}:*`),
    invalidateByPattern(`${CACHE_PREFIX.CURSED_ACTORS}:*`),
    invalidateByPattern(`${CACHE_PREFIX.CAUSES}:*`),
    invalidateByPattern(`${CACHE_PREFIX.DECADES}:*`),
    invalidateByPattern(`${CACHE_PREFIX.COVID_DEATHS}:*`),
    invalidateByPattern(`${CACHE_PREFIX.UNNATURAL_DEATHS}:*`),
    // STATS and TRIVIA use simple keys (no parameters), so use invalidateKeys
    invalidateKeys(CACHE_PREFIX.STATS, CACHE_PREFIX.TRIVIA, CACHE_PREFIX.FEATURED_MOVIE),
  ])
}

/**
 * Invalidate caches related to movie data.
 * Call this when movies are updated.
 */
export async function invalidateMovieCaches(): Promise<void> {
  await Promise.all([
    invalidateByPattern(`${CACHE_PREFIX.CURSED_MOVIES}:*`),
    invalidateByPattern(`${CACHE_PREFIX.POPULAR_MOVIES}:*`),
    invalidateKeys(CACHE_PREFIX.FEATURED_MOVIE),
  ])
}

/**
 * Get the current week's start date as ISO string (YYYY-MM-DD).
 * Used as cache key component for this-week deaths.
 */
function getWeekKey(): string {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0 = Sunday
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - dayOfWeek)
  return weekStart.toISOString().split("T")[0]
}

/**
 * Invalidate and rebuild death-related caches.
 * Call this after batch processing updates death data.
 */
export async function rebuildDeathCaches(): Promise<void> {
  // First invalidate all death caches
  await invalidateDeathCaches()

  // Then rebuild the most commonly requested caches
  try {
    // Rebuild recent deaths for common limits (5, 10, 20)
    for (const limit of [5, 10, 20]) {
      const deaths = await getRecentDeaths(limit)
      const key = buildCacheKey(CACHE_PREFIX.RECENT_DEATHS, { limit })
      await setCached(key, deaths, CACHE_TTL.WEEK)
    }

    // Rebuild site stats
    const stats = await getSiteStats()
    await setCached(CACHE_PREFIX.STATS, stats, CACHE_TTL.WEEK)

    // Rebuild this week's deaths
    const thisWeekDeaths = await getDeathsThisWeekSimple()
    const weekKey = getWeekKey()
    const thisWeekCacheKey = buildCacheKey(CACHE_PREFIX.THIS_WEEK, { week: weekKey })
    await setCached(thisWeekCacheKey, thisWeekDeaths, CACHE_TTL.WEEK)

    logger.info("Death caches rebuilt")
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Error rebuilding death caches")
  }
}

/**
 * Store metadata about the death cache state.
 * Called by the REBUILD_DEATH_CACHES job handler.
 */
export async function setDeathCacheMetadata(metadata: DeathCacheMetadata): Promise<void> {
  const key = buildCacheKey(CACHE_PREFIX.CACHE_METADATA, { type: "death" })
  await setCached(key, metadata, CACHE_TTL.WEEK)
  logger.debug({ metadata }, "Death cache metadata stored")
}

/**
 * Get metadata about the death cache state.
 * Returns null if not available.
 */
export async function getDeathCacheMetadata(): Promise<DeathCacheMetadata | null> {
  const key = buildCacheKey(CACHE_PREFIX.CACHE_METADATA, { type: "death" })
  return getCached<DeathCacheMetadata>(key)
}
