/**
 * Cache utilities for server-side Redis caching.
 * Provides type-safe get/set operations with automatic serialization.
 */
import { getRedisClient } from "./redis.js"
import { logger } from "./logger.js"
import { recordCustomEvent } from "./newrelic.js"

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
} as const

// TTL values in seconds
export const CACHE_TTL = {
  SHORT: 120, // 2 minutes - search results
  MEDIUM: 300, // 5 minutes - list endpoints
  LONG: 600, // 10 minutes - entity lookups
  HOUR: 3600, // 1 hour - aggregate stats
  DAY: 86400, // 24 hours - static reference data
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
 * Get a cached value, returning null if not found or Redis unavailable.
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const client = getRedisClient()
  if (!client) return null

  try {
    const cached = await client.get(key)
    if (cached) {
      logger.debug({ key }, "Cache hit")
      recordCustomEvent("CacheAccess", { key, hit: true })
      return JSON.parse(cached) as T
    }
    logger.debug({ key }, "Cache miss")
    recordCustomEvent("CacheAccess", { key, hit: false })
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
    await client.setex(key, ttlSeconds, JSON.stringify(value))
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
    let cursor = "0"
    let deleted = 0

    do {
      const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100)
      cursor = nextCursor
      if (keys.length > 0) {
        await client.del(...keys)
        deleted += keys.length
      }
    } while (cursor !== "0")

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
    await client.del(...keys)
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
 * Invalidate caches related to death data.
 * Call this when new deaths are recorded.
 */
export async function invalidateDeathCaches(): Promise<void> {
  await Promise.all([
    invalidateByPattern(`${CACHE_PREFIX.RECENT_DEATHS}:*`),
    invalidateByPattern(`${CACHE_PREFIX.THIS_WEEK}:*`),
    invalidateByPattern(`${CACHE_PREFIX.STATS}:*`),
    invalidateByPattern(`${CACHE_PREFIX.DEATH_WATCH}:*`),
    invalidateByPattern(`${CACHE_PREFIX.CURSED_ACTORS}:*`),
    invalidateKeys(CACHE_PREFIX.TRIVIA),
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
