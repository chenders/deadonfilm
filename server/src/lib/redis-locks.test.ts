/**
 * Tests for Redis distributed locking functions
 *
 * Note: These tests focus on graceful degradation when Redis is unavailable.
 * Full integration tests with actual lock acquisition/release require
 * a real Redis instance (ioredis-mock doesn't fully support SET NX PX and EVAL).
 * See CLAUDE.md testing.md for when to use ioredis-mock vs real Redis.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock logger
vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Redis Distributed Locking - Redis Unavailable", () => {
  beforeEach(() => {
    vi.resetModules()
    // Ensure REDIS_URL is not set
    delete process.env.REDIS_URL
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("acquireLock", () => {
    it("returns false when Redis is not available", async () => {
      const { acquireLock } = await import("./redis.js")
      const result = await acquireLock("test-lock", "value-1")
      expect(result).toBe(false)
    })

    it("logs warning when Redis is unavailable", async () => {
      const { logger } = await import("./logger.js")
      const { acquireLock } = await import("./redis.js")
      await acquireLock("test-lock", "value-1")
      expect(logger.warn).toHaveBeenCalledWith(
        { lockName: "test-lock" },
        "Redis unavailable, cannot acquire distributed lock"
      )
    })
  })

  describe("releaseLock", () => {
    it("returns false when Redis is not available", async () => {
      const { releaseLock } = await import("./redis.js")
      const result = await releaseLock("test-lock", "value-1")
      expect(result).toBe(false)
    })

    it("logs warning when Redis is unavailable", async () => {
      const { logger } = await import("./logger.js")
      const { releaseLock } = await import("./redis.js")
      await releaseLock("test-lock", "value-1")
      expect(logger.warn).toHaveBeenCalledWith(
        { lockName: "test-lock" },
        "Redis unavailable, cannot release distributed lock"
      )
    })
  })

  describe("getLockHolder", () => {
    it("returns null when Redis is not available", async () => {
      const { getLockHolder } = await import("./redis.js")
      const result = await getLockHolder("test-lock")
      expect(result).toBeNull()
    })
  })

  describe("isLockHeld", () => {
    it("returns false when Redis is not available", async () => {
      const { isLockHeld } = await import("./redis.js")
      const result = await isLockHeld("test-lock")
      expect(result).toBe(false)
    })
  })
})

/**
 * Integration tests for distributed locking would require a real Redis instance
 * (e.g., docker run -d -p 6380:6379 redis:7-alpine) and should test:
 * - acquireLock succeeds when lock is not held
 * - acquireLock fails when lock is already held by another process
 * - releaseLock succeeds when value matches
 * - releaseLock fails when value doesn't match (prevents releasing another's lock)
 * - Lock TTL expires and allows re-acquisition
 *
 * These would be placed in a separate file like redis-locks.integration.test.ts
 * and run in CI where Redis is available via docker compose.
 */
