/**
 * Tests for Bull Board setup
 *
 * Uses ioredis-mock so tests always run without a real Redis instance.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import RedisMock from "ioredis-mock"

// Mock ioredis so BullMQ queues use in-memory Redis
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

import { Queue } from "bullmq"
import { setupBullBoard } from "./bull-board.js"
import { getRedisJobsClient, _resetForTesting } from "./redis.js"

describe("setupBullBoard", () => {
  let originalEnv: string | undefined

  beforeEach(() => {
    originalEnv = process.env.REDIS_JOBS_URL
    process.env.REDIS_JOBS_URL = "redis://localhost:6380"
    _resetForTesting()
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.REDIS_JOBS_URL
    } else {
      process.env.REDIS_JOBS_URL = originalEnv
    }
    _resetForTesting()
  })

  describe("with Redis queues", () => {
    let testQueue: Queue

    beforeEach(() => {
      testQueue = new Queue("test-queue", {
        connection: getRedisJobsClient(),
      })
    })

    afterEach(async () => {
      await testQueue.close()
    })

    it("creates Bull Board router", () => {
      const router = setupBullBoard([testQueue])

      expect(router).toBeDefined()
      expect(typeof router).toBe("function")
    })

    it("handles multiple queues", async () => {
      const queue2 = new Queue("test-queue-2", {
        connection: getRedisJobsClient(),
      })

      try {
        const router = setupBullBoard([testQueue, queue2])

        expect(router).toBeDefined()
        expect(typeof router).toBe("function")
      } finally {
        await queue2.close()
      }
    })
  })

  describe("without queues", () => {
    it("handles empty queue array", () => {
      const router = setupBullBoard([])

      expect(router).toBeDefined()
      expect(typeof router).toBe("function")
    })
  })
})
