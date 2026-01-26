/**
 * Worker Integration Tests
 *
 * Tests:
 * - Worker initialization
 * - Job processing
 * - Error handling
 * - Statistics tracking
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest"
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
    // Clean up job_runs and job_dead_letter tables before each test
    await pool.query("DELETE FROM job_dead_letter")
    await pool.query("DELETE FROM job_runs")

    // Drain the queue to remove any pending jobs
    const queue = queueManager.getQueue(QueueName.CACHE)
    if (queue) {
      await queue.drain()
      // Ensure queue is resumed (in case it was paused by other tests)
      await queue.resume()
      // Give Redis time to process the operations
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  })

  afterAll(async () => {
    // Shutdown worker
    await worker.shutdown()

    // Shutdown queue manager
    await queueManager.shutdown()

    // Clear handlers
    clearHandlers()

    // Don't end the pool - it's a singleton shared across tests
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
      await waitForJobCompletion(jobId)

      // Verify job completed
      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows.length).toBe(1)
      expect(result.rows[0].status).toBe("completed")
      expect(result.rows[0].result).toBeDefined()
      expect(result.rows[0].result.success).toBe(true)
      expect(result.rows[0].duration_ms).toBeGreaterThan(0)
    }, 25000)

    it.skip("should update worker statistics after processing", async () => {
      const statsBefore = worker.getStats()

      // Queue a job
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        { actorId: 2158 },
        { createdBy: "worker-test" }
      )

      // Wait for job to be processed
      await waitForJobCompletion(jobId)

      const statsAfter = worker.getStats()

      expect(statsAfter.processedCount).toBeGreaterThan(statsBefore.processedCount)
    }, 25000)
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
      await waitForJobStatus(jobId, "failed")

      // Give a bit more time for failed job event handler (it does more work)
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Verify job failed
      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows.length).toBe(1)
      expect(result.rows[0].status).toBe("failed")
      expect(result.rows[0].error_message).toContain("Mock failure")
    }, 25000)
  })
})

/**
 * Helper: Wait for job to complete (success or failure)
 *
 * Waits for both:
 * 1. BullMQ job to finish (handler returns)
 * 2. Database to be updated by event handlers (queue-manager.ts)
 */
async function waitForJobCompletion(jobId: string, timeoutMs: number = 20000): Promise<void> {
  const pool = getPool()
  const queue = queueManager.getQueue(QueueName.CACHE)

  if (!queue) {
    throw new Error("Cache queue not found")
  }

  const job = await queue.getJob(jobId)
  if (!job) {
    throw new Error(`Job ${jobId} not found in queue`)
  }

  const queueEvents = queueManager.getQueueEvents(QueueName.CACHE)
  if (!queueEvents) {
    throw new Error("Cache queue events not found")
  }

  // Step 1: Wait for BullMQ job to finish
  try {
    await job.waitUntilFinished(queueEvents, timeoutMs)
  } catch (error) {
    // Job failed or timed out - that's okay, we just need it to be done
    const state = await job.getState()
    if (state !== "completed" && state !== "failed") {
      throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms (state: ${state})`)
    }
  }

  // Step 2: Poll database until event handler updates it
  // BullMQ emits "completed"/"failed" events asynchronously, so we need to wait
  // for the event handler (queue-manager.ts:107-178) to update the database
  const startTime = Date.now()
  while (Date.now() - startTime < 10000) {
    const result = await pool.query(`SELECT status, completed_at FROM job_runs WHERE job_id = $1`, [
      jobId,
    ])

    if (result.rows.length > 0) {
      const row = result.rows[0]
      // Event handler sets both status AND completed_at when job finishes
      if (row.completed_at !== null && (row.status === "completed" || row.status === "failed")) {
        return // Database fully updated!
      }
    }

    // Not updated yet - wait a bit and try again
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Database not updated for job ${jobId} within 10 seconds`)
}

/**
 * Helper: Wait for job to reach specific status
 *
 * Waits for both:
 * 1. BullMQ job to reach target state
 * 2. Database to be updated by event handlers (queue-manager.ts)
 */
async function waitForJobStatus(
  jobId: string,
  targetStatus: string,
  timeoutMs: number = 20000
): Promise<void> {
  const pool = getPool()
  const queue = queueManager.getQueue(QueueName.CACHE)

  if (!queue) {
    throw new Error("Cache queue not found")
  }

  const job = await queue.getJob(jobId)
  if (!job) {
    throw new Error(`Job ${jobId} not found in queue`)
  }

  const queueEvents = queueManager.getQueueEvents(QueueName.CACHE)
  if (!queueEvents) {
    throw new Error("Cache queue events not found")
  }

  // Step 1: Wait for BullMQ job to finish
  try {
    await job.waitUntilFinished(queueEvents, timeoutMs)
  } catch (error) {
    // Job may have failed - check if it reached the target status
  }

  // Step 2: Verify the job reached the target state in BullMQ
  const state = await job.getState()
  if (state !== targetStatus) {
    throw new Error(
      `Job ${jobId} did not reach status ${targetStatus} within ${timeoutMs}ms (state: ${state})`
    )
  }

  // Step 3: Poll database until event handler updates it
  const startTime = Date.now()
  let lastStatus = "unknown"
  let lastCompletedAt = null
  while (Date.now() - startTime < 10000) {
    const result = await pool.query(`SELECT status, completed_at FROM job_runs WHERE job_id = $1`, [
      jobId,
    ])

    if (result.rows.length > 0) {
      const row = result.rows[0]
      lastStatus = row.status
      lastCompletedAt = row.completed_at
      // Check if database reflects the target status with completed_at set
      if (row.status === targetStatus && row.completed_at !== null) {
        return // Database fully updated!
      }
    }

    // Not updated yet - wait a bit and try again
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(
    `Database not updated to status ${targetStatus} for job ${jobId} within 10 seconds. Last seen: status=${lastStatus}, completed_at=${lastCompletedAt}`
  )
}
