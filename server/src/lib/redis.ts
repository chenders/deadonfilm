/**
 * Redis client for server-side caching.
 * Gracefully degrades to no-cache behavior if Redis is unavailable.
 */
import Redis from "ioredis"
import { logger } from "./logger.js"

let redisClient: Redis | null = null
let isConnected = false

/**
 * Get or create the Redis client.
 * Returns null if REDIS_URL is not configured or Redis is disconnected.
 */
export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    return null
  }

  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn("Redis connection failed after 3 retries, giving up")
          return null
        }
        return Math.min(times * 100, 1000)
      },
      lazyConnect: true,
    })

    redisClient.on("connect", () => {
      isConnected = true
      logger.info("Redis connected")
    })

    redisClient.on("ready", () => {
      isConnected = true
      logger.info("Redis ready")
    })

    redisClient.on("error", (err) => {
      logger.warn({ err: err.message }, "Redis error")
    })

    redisClient.on("close", () => {
      isConnected = false
      logger.info("Redis connection closed")
    })

    redisClient.on("reconnecting", () => {
      logger.info("Redis reconnecting...")
    })

    // Attempt connection
    redisClient.connect().catch((err) => {
      logger.warn({ err: err.message }, "Redis initial connection failed")
    })
  }

  return isConnected ? redisClient : null
}

/**
 * Check if Redis is available for caching.
 */
export function isRedisAvailable(): boolean {
  return isConnected && redisClient !== null
}

/**
 * Gracefully close Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit()
    } catch {
      // Ignore errors on close
    }
    redisClient = null
    isConnected = false
  }
}

/**
 * Initialize Redis connection (call during app startup).
 * Returns true if Redis is available, false otherwise.
 */
export async function initRedis(): Promise<boolean> {
  if (!process.env.REDIS_URL) {
    logger.info("REDIS_URL not set - caching disabled")
    return false
  }

  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn("Redis connection failed after 3 retries, giving up")
          return null
        }
        return Math.min(times * 100, 1000)
      },
      lazyConnect: true,
    })

    redisClient.on("connect", () => {
      isConnected = true
      logger.info("Redis connected")
    })

    redisClient.on("ready", () => {
      isConnected = true
      logger.info("Redis ready")
    })

    redisClient.on("error", (err) => {
      logger.warn({ err: err.message }, "Redis error")
    })

    redisClient.on("close", () => {
      isConnected = false
      logger.info("Redis connection closed")
    })

    redisClient.on("reconnecting", () => {
      logger.info("Redis reconnecting...")
    })
  }

  try {
    // Properly await the connection
    await redisClient.connect()
    await redisClient.ping()
    logger.info("Redis connection verified")
    return true
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Redis not available - caching disabled")
    return false
  }
}

// For testing: reset the module state
export function _resetForTesting(): void {
  if (redisClient) {
    redisClient.disconnect()
  }
  redisClient = null
  isConnected = false
}

// ============================================================================
// Distributed Locking
// ============================================================================

const LOCK_PREFIX = "lock:"

/**
 * Acquire a distributed lock using Redis SET NX PX.
 * Returns true if lock acquired, false if already held by another process.
 *
 * @param lockName - Name of the lock (e.g., "sync:tmdb")
 * @param lockValue - Value to store (e.g., sync ID for identification)
 * @param ttlMs - Lock timeout in milliseconds (prevents stuck locks if process crashes)
 */
export async function acquireLock(
  lockName: string,
  lockValue: string,
  ttlMs: number = 600000 // 10 minutes default
): Promise<boolean> {
  const client = getRedisClient()
  if (!client) {
    // If Redis unavailable, return false to let caller decide fallback behavior
    logger.warn({ lockName }, "Redis unavailable, cannot acquire distributed lock")
    return false
  }

  try {
    // SET key value NX PX ttl - sets only if key doesn't exist, with expiration
    const result = await client.set(`${LOCK_PREFIX}${lockName}`, lockValue, "PX", ttlMs, "NX")
    const acquired = result === "OK"

    if (acquired) {
      logger.info({ lockName, lockValue, ttlMs }, "Distributed lock acquired")
    } else {
      logger.info({ lockName }, "Distributed lock already held")
    }

    return acquired
  } catch (err) {
    logger.error({ err, lockName }, "Failed to acquire distributed lock")
    return false
  }
}

/**
 * Release a distributed lock.
 * Only releases if the current value matches (prevents releasing another process's lock).
 *
 * @param lockName - Name of the lock
 * @param lockValue - Expected value (only releases if value matches)
 */
export async function releaseLock(lockName: string, lockValue: string): Promise<boolean> {
  const client = getRedisClient()
  if (!client) {
    logger.warn({ lockName }, "Redis unavailable, cannot release distributed lock")
    return false
  }

  try {
    // Use Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `
    const result = await client.eval(script, 1, `${LOCK_PREFIX}${lockName}`, lockValue)
    const released = result === 1

    if (released) {
      logger.info({ lockName, lockValue }, "Distributed lock released")
    } else {
      logger.warn(
        { lockName, lockValue },
        "Distributed lock not released (value mismatch or already expired)"
      )
    }

    return released
  } catch (err) {
    logger.error({ err, lockName }, "Failed to release distributed lock")
    return false
  }
}

/**
 * Get the current holder of a lock.
 *
 * @param lockName - Name of the lock
 * @returns The lock value if held, null if not held or Redis unavailable
 */
export async function getLockHolder(lockName: string): Promise<string | null> {
  const client = getRedisClient()
  if (!client) {
    return null
  }

  try {
    return await client.get(`${LOCK_PREFIX}${lockName}`)
  } catch (err) {
    logger.error({ err, lockName }, "Failed to get lock holder")
    return null
  }
}

/**
 * Check if a lock is currently held.
 *
 * @param lockName - Name of the lock
 */
export async function isLockHeld(lockName: string): Promise<boolean> {
  const holder = await getLockHolder(lockName)
  return holder !== null
}
