/**
 * Worker Integration Tests
 *
 * Tests:
 * - Worker initialization
 * - Job processing
 * - Error handling
 * - Statistics tracking
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import type { Job } from "bullmq"
import { JobWorker } from "../worker.js"
import { queueManager } from "../queue-manager.js"
import { registerHandler, clearHandlers } from "../handlers/index.js"
import { BaseJobHandler } from "../handlers/base.js"
import { JobType, QueueName, type JobResult } from "../types.js"
import { getPool } from "../../db.js"

// Mock handler for testing
class MockCacheHandler extends BaseJobHandler<{ actorId: number }, { cached: boolean }> {
  readonly jobType = JobType.WARM_ACTOR_CACHE
  readonly queueName = QueueName.CACHE

  async process(job: Job<{ actorId: number }>): Promise<JobResult<{ cached: boolean }>> {
    // Simulate cache warming
    return {
      success: true,
      data: { cached: true },
      metadata: {
        actorId: job.data.actorId,
      },
    }
  }
}

// Mock handler that always fails
class MockFailingHandler extends BaseJobHandler<{ actorId: number }, never> {
  readonly jobType = JobType.WARM_CONTENT_CACHE
  readonly queueName = QueueName.CACHE

  async process(job: Job<{ actorId: number }>): Promise<JobResult<never>> {
    throw new Error("Mock failure")
  }
}

describe("JobWorker", () => {
  let worker: JobWorker
  let pool: ReturnType<typeof getPool>

  beforeAll(async () => {
    pool = getPool()

    // Initialize queue manager
    await queueManager.initialize()

    // Register mock handlers
    registerHandler(new MockCacheHandler())
    registerHandler(new MockFailingHandler())

    // Create and start worker
    worker = new JobWorker()
    await worker.start([QueueName.CACHE])

    // Give worker time to initialize
    await new Promise((resolve) => setTimeout(resolve, 1000))
  })

  beforeEach(async () => {
    // Wait for all active jobs to complete before cleanup
    for (const queue of queueManager.getAllQueues()) {
      await queue.drain(true) // Wait for active jobs to finish
    }

    // Clean up all queues in Redis
    for (const queue of queueManager.getAllQueues()) {
      await queue.obliterate({ force: true })
    }

    // Clean up database
    await pool.query("DELETE FROM job_runs")
    await pool.query("DELETE FROM job_dead_letter")
  })

  afterAll(async () => {
    // Shutdown worker
    await worker.shutdown()

    // Shutdown queue manager
    await queueManager.shutdown()

    // Clear handlers
    clearHandlers()

    // Note: Don't end pool - it's a singleton shared with other tests
  })

  describe("Worker Initialization", () => {
    it("should initialize worker", () => {
      const stats = worker.getStats()
      expect(stats.workerCount).toBeGreaterThan(0)
    })

    it("should have initial statistics", () => {
      const stats = worker.getStats()
      expect(stats.processedCount).toBeGreaterThanOrEqual(0)
      expect(stats.failedCount).toBeGreaterThanOrEqual(0)
      expect(stats.successRate).toBeGreaterThanOrEqual(0)
      expect(stats.successRate).toBeLessThanOrEqual(100)
    })
  })

  describe("Job Processing", () => {
    it("should process job successfully", async () => {
      // Queue a job
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        { actorId: 2157 },
        { createdBy: "worker-test" }
      )

      // Wait for job to be processed
      await waitForJobCompletion(jobId, 10000)

      // Verify job completed
      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows.length).toBe(1)
      expect(result.rows[0].status).toBe("completed")
      expect(result.rows[0].result).toBeDefined()
      expect(result.rows[0].result.success).toBe(true)
      expect(result.rows[0].duration_ms).toBeGreaterThan(0)
    }, 15000)

    it("should update worker statistics after processing", async () => {
      const statsBefore = worker.getStats()

      // Queue a job
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        { actorId: 2158 },
        { createdBy: "worker-test" }
      )

      // Wait for job to be processed
      await waitForJobCompletion(jobId, 10000)

      const statsAfter = worker.getStats()

      expect(statsAfter.processedCount).toBeGreaterThan(statsBefore.processedCount)
    }, 15000)
  })

  describe("Error Handling", () => {
    it("should handle job failures", async () => {
      // Queue a job that will fail
      const jobId = await queueManager.addJob(
        JobType.WARM_CONTENT_CACHE,
        { entityType: "movie" as const, entityId: 550 },
        { createdBy: "worker-test", attempts: 1 } // Only 1 attempt
      )

      // Wait for job to fail
      await waitForJobStatus(jobId, "failed", 10000)

      // Verify job failed
      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows.length).toBe(1)
      expect(result.rows[0].status).toBe("failed")
      expect(result.rows[0].error_message).toContain("Mock failure")
    }, 15000)
  })
})

/**
 * Helper: Wait for job to complete (success or failure)
 */
async function waitForJobCompletion(jobId: string, timeoutMs: number = 10000): Promise<void> {
  const pool = getPool()
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const result = await pool.query("SELECT status FROM job_runs WHERE job_id = $1", [jobId])

    if (result.rows.length > 0) {
      const status = result.rows[0].status
      if (status === "completed" || status === "failed") {
        return
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`)
}

/**
 * Helper: Wait for job to reach specific status
 */
async function waitForJobStatus(
  jobId: string,
  targetStatus: string,
  timeoutMs: number = 10000
): Promise<void> {
  const pool = getPool()
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    const result = await pool.query("SELECT status FROM job_runs WHERE job_id = $1", [jobId])

    if (result.rows.length > 0 && result.rows[0].status === targetStatus) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Job ${jobId} did not reach status ${targetStatus} within ${timeoutMs}ms`)
}
