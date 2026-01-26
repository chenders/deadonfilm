/**
 * Tests for Bull Board setup
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Queue } from "bullmq"
import { setupBullBoard } from "./bull-board.js"
import { getRedisJobsClient } from "./redis.js"

describe("setupBullBoard", () => {
  let testQueue: Queue

  beforeEach(async () => {
    // Create a test queue
    testQueue = new Queue("test-queue", {
      connection: getRedisJobsClient(),
    })
  })

  afterEach(async () => {
    // Clean up
    await testQueue.close()
  })

  it("creates Bull Board router", () => {
    const router = setupBullBoard([testQueue])

    expect(router).toBeDefined()
    expect(typeof router).toBe("function")
  })

  it("handles empty queue array", () => {
    const router = setupBullBoard([])

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
      // Clean up second queue
      await queue2.close()
    }
  })
})
