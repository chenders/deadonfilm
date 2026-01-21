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
