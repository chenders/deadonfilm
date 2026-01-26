/**
 * Tests for Redis jobs client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import RedisMock from "ioredis-mock"

// Mock ioredis to return ioredis-mock
vi.mock("ioredis", () => ({
  default: RedisMock,
}))

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Redis jobs client", () => {
  let originalEnv: string | undefined

  beforeEach(async () => {
    vi.clearAllMocks()
    originalEnv = process.env.REDIS_JOBS_URL

    // Reset client state without resetting modules to avoid SIGTERM listener accumulation
    const { _resetForTesting } = await import("./redis.js")
    _resetForTesting()
  })

  afterEach(() => {
    process.env.REDIS_JOBS_URL = originalEnv
  })

  describe("getRedisJobsClient", () => {
    it("throws error when REDIS_JOBS_URL is not set", async () => {
      delete process.env.REDIS_JOBS_URL

      const { getRedisJobsClient } = await import("./redis.js")

      expect(() => getRedisJobsClient()).toThrow(
        "REDIS_JOBS_URL environment variable is required for job queue"
      )
    })

    it("creates Redis client when REDIS_JOBS_URL is set", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { getRedisJobsClient } = await import("./redis.js")
      const client = getRedisJobsClient()

      expect(client).toBeDefined()
      // Verify it's a functional Redis client by testing a command
      await client.set("test", "value")
      expect(await client.get("test")).toBe("value")
    })

    it("returns same client on subsequent calls", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { getRedisJobsClient } = await import("./redis.js")
      const client1 = getRedisJobsClient()
      const client2 = getRedisJobsClient()

      expect(client1).toBe(client2)
    })

    it("can perform basic Redis operations", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { getRedisJobsClient } = await import("./redis.js")
      const client = getRedisJobsClient()

      // Test that the client actually works
      await client.set("test-key", "test-value")
      const value = await client.get("test-key")

      expect(value).toBe("test-value")
    })

    it("supports BullMQ-compatible configuration", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { getRedisJobsClient } = await import("./redis.js")
      const client = getRedisJobsClient()

      // Verify client is configured properly
      expect(client.options.maxRetriesPerRequest).toBe(null)
      expect(client.options.enableReadyCheck).toBe(false)
    })
  })

  describe("lazy client export", () => {
    it("initializes client on first access", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { redisJobsClientLazy } = await import("./redis.js")
      const client = redisJobsClientLazy.client

      expect(client).toBeDefined()
      // Verify it's a functional Redis client
      await client.set("lazy-test", "works")
      expect(await client.get("lazy-test")).toBe("works")
    })

    it("returns same client on subsequent accesses", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { redisJobsClientLazy } = await import("./redis.js")
      const client1 = redisJobsClientLazy.client
      const client2 = redisJobsClientLazy.client

      expect(client1).toBe(client2)
    })
  })

  describe("retry strategy", () => {
    it("implements exponential backoff", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { getRedisJobsClient } = await import("./redis.js")
      const client = getRedisJobsClient()

      const retryStrategy = client.options.retryStrategy as (times: number) => number

      // Test exponential backoff
      expect(retryStrategy(1)).toBe(100) // 50 * 2^1
      expect(retryStrategy(2)).toBe(200) // 50 * 2^2
      expect(retryStrategy(3)).toBe(400) // 50 * 2^3
      expect(retryStrategy(4)).toBe(800) // 50 * 2^4
      expect(retryStrategy(10)).toBe(3000) // Capped at 3000ms
    })
  })

  describe("closeRedisJobsClient", () => {
    it("gracefully closes connection", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { getRedisJobsClient, closeRedisJobsClient } = await import("./redis.js")
      const client = getRedisJobsClient()

      const quitSpy = vi.spyOn(client, "quit")

      await closeRedisJobsClient()

      expect(quitSpy).toHaveBeenCalled()
    })

    it("handles errors during close", async () => {
      process.env.REDIS_JOBS_URL = "redis://localhost:6380"

      const { getRedisJobsClient, closeRedisJobsClient } = await import("./redis.js")
      const client = getRedisJobsClient()

      const error = new Error("Connection error")
      vi.spyOn(client, "quit").mockRejectedValue(error)

      await expect(closeRedisJobsClient()).rejects.toThrow("Connection error")
    })

    it("does nothing if client not initialized", async () => {
      const { closeRedisJobsClient } = await import("./redis.js")

      // Should not throw
      await closeRedisJobsClient()
    })
  })
})
