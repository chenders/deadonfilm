/**
 * Redis client for BullMQ job queue
 *
 * This is a separate Redis instance from the cache Redis to isolate:
 * - Persistence (AOF/RDB for jobs vs volatile cache)
 * - Performance (no fsync latency affecting cache operations)
 * - Memory management (noeviction for jobs vs LRU for cache)
 */

import { Redis } from "ioredis"
import { logger } from "../logger.js"

if (!process.env.REDIS_JOBS_URL) {
  throw new Error("REDIS_JOBS_URL environment variable is required for job queue")
}

export const redisJobsClient = new Redis(process.env.REDIS_JOBS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ - allows unlimited retries
  enableReadyCheck: false, // Improves performance for BullMQ
  retryStrategy(times: number) {
    // Exponential backoff with max delay of 3 seconds
    const delay = Math.min(times * 50, 3000)
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

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Closing Redis jobs connection...")
  await redisJobsClient.quit()
})
