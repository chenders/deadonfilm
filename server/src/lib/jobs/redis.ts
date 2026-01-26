/**
 * Redis client for BullMQ job queue
 *
 * This is a separate Redis instance from the cache Redis to isolate:
 * - Persistence (AOF/RDB for jobs vs volatile cache)
 * - Performance (no fsync latency affecting cache operations)
 * - Memory management (noeviction for jobs vs LRU for cache)
 */

import Redis from "ioredis"
import { logger } from "../logger.js"

let redisJobsClient: Redis | null = null

/**
 * Get or create the Redis jobs client
 * @throws Error if REDIS_JOBS_URL is not configured
 */
export function getRedisJobsClient(): Redis {
  if (redisJobsClient) {
    return redisJobsClient
  }

  if (!process.env.REDIS_JOBS_URL) {
    throw new Error("REDIS_JOBS_URL environment variable is required for job queue")
  }

  redisJobsClient = new Redis(process.env.REDIS_JOBS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ - allows unlimited retries
    enableReadyCheck: false, // Improves performance for BullMQ
    retryStrategy(times: number) {
      // Exponential backoff with max delay of 3 seconds
      const exponentialDelay = 50 * Math.pow(2, times)
      const delay = Math.min(exponentialDelay, 3000)
      logger.warn({ attempt: times, delayMs: delay }, "Redis jobs connection failed, retrying...")
      return delay
    },
    reconnectOnError(err: Error) {
      const targetError = "READONLY"
      if (err.message.includes(targetError)) {
        // Only reconnect on READONLY errors (Redis replication failover)
        logger.error({ error: err }, "Redis jobs in READONLY mode, reconnecting...")
        return true
      }
      return false
    },
  })

  redisJobsClient.on("connect", () => {
    logger.info("Redis jobs client connected")
  })

  redisJobsClient.on("ready", () => {
    logger.info("Redis jobs client ready")
  })

  redisJobsClient.on("error", (err: Error) => {
    logger.error({ error: err }, "Redis jobs client error")
  })

  redisJobsClient.on("close", () => {
    logger.warn("Redis jobs client connection closed")
  })

  redisJobsClient.on("reconnecting", () => {
    logger.info("Redis jobs client reconnecting...")
  })

  return redisJobsClient
}

/**
 * Close the Redis jobs client connection
 * Should be called during application shutdown
 */
export async function closeRedisJobsClient(): Promise<void> {
  if (redisJobsClient) {
    try {
      logger.info("Closing Redis jobs connection...")
      await redisJobsClient.quit()
      redisJobsClient = null
    } catch (error) {
      logger.error({ error }, "Error closing Redis jobs connection")
      throw error
    }
  }
}

/**
 * Export a lazy-initialized client for compatibility
 * This allows imports without immediately connecting
 */
export const redisJobsClientLazy = {
  get client() {
    return getRedisJobsClient()
  },
}

/**
 * Reset client for testing purposes
 * @internal
 */
export function _resetForTesting(): void {
  if (redisJobsClient) {
    redisJobsClient.disconnect()
  }
  redisJobsClient = null
}
