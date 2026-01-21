/**
 * Instrumented Redis operations for New Relic monitoring.
 * Tracks operation latency, success rates, and cache hit/miss metrics.
 */
import { getRedisClient } from "./redis.js"
import { recordCustomEvent, startSegment } from "./newrelic.js"

interface RedisMetrics {
  operation: string
  keyPrefix: string
  hit?: boolean
  durationMs: number
  success: boolean
  error?: string
  ttl?: number
}

/**
 * Extract key prefix (first segment before colon) for cardinality control.
 * Example: "actor:id:123" -> "actor"
 */
function getKeyPrefix(key: string): string {
  const firstColon = key.indexOf(":")
  return firstColon === -1 ? key : key.substring(0, firstColon)
}

/**
 * Remove undefined values from metrics object for New Relic.
 */
function sanitizeMetrics(metrics: RedisMetrics): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(metrics)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

/**
 * Instrumented GET operation.
 * Tracks cache hit/miss, latency, and errors.
 */
export async function instrumentedGet(key: string): Promise<string | null> {
  const startTime = Date.now()
  let result: string | null = null
  let error: Error | undefined

  try {
    result = await startSegment("Redis/get", true, async () => {
      const client = getRedisClient()
      if (!client) return null
      return await client.get(key)
    })
  } catch (err) {
    error = err as Error
    throw err
  } finally {
    const metrics: RedisMetrics = {
      operation: "get",
      keyPrefix: getKeyPrefix(key),
      hit: result !== null,
      durationMs: Date.now() - startTime,
      success: !error,
    }
    if (error) {
      metrics.error = error.message
    }
    recordCustomEvent("RedisOperation", sanitizeMetrics(metrics))
  }

  return result
}

/**
 * Instrumented SET operation.
 * Tracks latency, TTL, and errors.
 */
export async function instrumentedSet(key: string, value: string, ttl?: number): Promise<void> {
  const startTime = Date.now()
  let error: Error | undefined

  try {
    await startSegment("Redis/set", true, async () => {
      const client = getRedisClient()
      if (!client) return
      if (ttl) {
        await client.setex(key, ttl, value)
      } else {
        await client.set(key, value)
      }
    })
  } catch (err) {
    error = err as Error
    throw err
  } finally {
    const metrics: RedisMetrics = {
      operation: "set",
      keyPrefix: getKeyPrefix(key),
      durationMs: Date.now() - startTime,
      success: !error,
    }
    if (ttl) {
      metrics.ttl = ttl
    }
    if (error) {
      metrics.error = error.message
    }
    recordCustomEvent("RedisOperation", sanitizeMetrics(metrics))
  }
}

/**
 * Instrumented DELETE operation.
 * Tracks latency and errors.
 */
export async function instrumentedDel(...keys: string[]): Promise<number> {
  const startTime = Date.now()
  let result = 0
  let error: Error | undefined

  try {
    result = await startSegment("Redis/del", true, async () => {
      const client = getRedisClient()
      if (!client || keys.length === 0) return 0
      return await client.del(...keys)
    })
  } catch (err) {
    error = err as Error
    throw err
  } finally {
    // Record metrics for each key prefix
    const prefixes = Array.from(new Set(keys.map(getKeyPrefix)))
    for (const prefix of prefixes) {
      const metrics: RedisMetrics = {
        operation: "del",
        keyPrefix: prefix,
        durationMs: Date.now() - startTime,
        success: !error,
      }
      if (error) {
        metrics.error = error.message
      }
      recordCustomEvent("RedisOperation", sanitizeMetrics(metrics))
    }
  }

  return result
}

/**
 * Instrumented SCAN operation.
 * Used for pattern-based cache invalidation.
 */
export async function instrumentedScan(pattern: string, count = 100): Promise<string[]> {
  const startTime = Date.now()
  const allKeys: string[] = []
  let error: Error | undefined

  try {
    await startSegment("Redis/scan", true, async () => {
      const client = getRedisClient()
      if (!client) return

      let cursor = "0"
      do {
        const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", count)
        cursor = nextCursor
        allKeys.push(...keys)
      } while (cursor !== "0")
    })
  } catch (err) {
    error = err as Error
    throw err
  } finally {
    const metrics: RedisMetrics = {
      operation: "scan",
      keyPrefix: pattern,
      durationMs: Date.now() - startTime,
      success: !error,
    }
    if (error) {
      metrics.error = error.message
    }
    recordCustomEvent("RedisOperation", sanitizeMetrics(metrics))
  }

  return allKeys
}

/**
 * Instrumented PING operation.
 * Used for health checks.
 */
export async function instrumentedPing(): Promise<string> {
  const startTime = Date.now()
  let result = "PONG"
  let error: Error | undefined

  try {
    result = await startSegment("Redis/ping", true, async () => {
      const client = getRedisClient()
      if (!client) throw new Error("Redis client not available")
      return await client.ping()
    })
  } catch (err) {
    error = err as Error
    throw err
  } finally {
    const metrics: RedisMetrics = {
      operation: "ping",
      keyPrefix: "healthcheck",
      durationMs: Date.now() - startTime,
      success: !error,
    }
    if (error) {
      metrics.error = error.message
    }
    recordCustomEvent("RedisOperation", sanitizeMetrics(metrics))
  }

  return result
}
