/**
 * Queue Manager Integration Tests
 *
 * Tests:
 * - Queue initialization
 * - Job creation and validation
 * - Job status updates
 * - Queue statistics
 * - Queue management (pause/resume)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { getPool } from "../../db.js"
import { queueManager } from "../queue-manager.js"
import { JobType, QueueName, JobPriority, JobStatus } from "../types.js"

describe("QueueManager", () => {
  let pool: ReturnType<typeof getPool>

  beforeAll(async () => {
    pool = getPool()
    await queueManager.initialize()
  })

  afterAll(async () => {
    await queueManager.shutdown()
    // Note: Don't end pool - it's a singleton shared with other tests
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

  describe("Initialization", () => {
    it("should initialize all queues", () => {
      const queues = queueManager.getAllQueues()
      expect(queues.length).toBe(Object.keys(QueueName).length)
    })

    it("should get queue by name", () => {
      const queue = queueManager.getQueue(QueueName.RATINGS)
      expect(queue).toBeDefined()
      expect(queue?.name).toBe(QueueName.RATINGS)
    })
  })

  describe("Job Creation", () => {
    it("should create a job with valid payload", async () => {
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        {
          actorId: 2157,
        },
        {
          priority: JobPriority.NORMAL,
          createdBy: "test",
        }
      )

      expect(jobId).toBeDefined()
      expect(typeof jobId).toBe("string")

      // Verify job was recorded in database
      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows.length).toBe(1)
      expect(result.rows[0].job_type).toBe(JobType.WARM_ACTOR_CACHE)
      // Don't assert on status - it might be pending, active, or completed depending on worker state
      expect(result.rows[0].queue_name).toBe(QueueName.CACHE)
      expect(result.rows[0].priority).toBe(JobPriority.NORMAL)
      expect(result.rows[0].created_by).toBe("test")
      expect(result.rows[0].payload).toEqual({ actorId: 2157 })
    })

    it("should reject job with invalid payload", async () => {
      await expect(
        queueManager.addJob(
          JobType.WARM_ACTOR_CACHE,
          {
            actorId: -1, // Invalid: must be positive
          } as unknown as { actorId: number },
          {
            createdBy: "test",
          }
        )
      ).rejects.toThrow(/Invalid payload/)
    })

    it("should create job with default priority", async () => {
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        {
          actorId: 2157,
        },
        {
          createdBy: "test",
        }
      )

      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows[0].priority).toBe(JobPriority.NORMAL)
    })

    it("should create job with high priority", async () => {
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        {
          actorId: 2157,
        },
        {
          priority: JobPriority.HIGH,
          createdBy: "test",
        }
      )

      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows[0].priority).toBe(JobPriority.HIGH)
    })

    it("should create delayed job", async () => {
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        {
          actorId: 2157,
        },
        {
          delay: 5000, // 5 second delay
          createdBy: "test",
        }
      )

      expect(jobId).toBeDefined()

      // Job should be in queue but delayed
      const queue = queueManager.getQueue(QueueName.CACHE)
      const delayedCount = await queue?.getDelayedCount()

      expect(delayedCount).toBeGreaterThan(0)
    })
  })

  describe("Queue Statistics", () => {
    it("should get queue stats", async () => {
      // Add a few jobs
      await queueManager.addJob(JobType.WARM_ACTOR_CACHE, { actorId: 1 }, { createdBy: "test" })
      await queueManager.addJob(JobType.WARM_ACTOR_CACHE, { actorId: 2 }, { createdBy: "test" })

      const stats = await queueManager.getQueueStats(QueueName.CACHE)

      expect(stats).toBeDefined()
      expect(stats.waiting).toBeGreaterThanOrEqual(0)
      expect(stats.active).toBeGreaterThanOrEqual(0)
      expect(stats.completed).toBeGreaterThanOrEqual(0)
      expect(stats.failed).toBeGreaterThanOrEqual(0)
      expect(typeof stats.isPaused).toBe("boolean")
    })

    it("should throw error for non-existent queue", async () => {
      await expect(queueManager.getQueueStats("invalid" as QueueName)).rejects.toThrow(
        /Queue not found/
      )
    })
  })

  describe("Queue Management", () => {
    it("should pause and resume queue", async () => {
      // Pause queue
      await queueManager.pauseQueue(QueueName.CACHE)

      let stats = await queueManager.getQueueStats(QueueName.CACHE)
      expect(stats.isPaused).toBe(true)

      // Resume queue
      await queueManager.resumeQueue(QueueName.CACHE)

      stats = await queueManager.getQueueStats(QueueName.CACHE)
      expect(stats.isPaused).toBe(false)
    })
  })

  describe("Job Type to Queue Mapping", () => {
    it("should route cache jobs to cache queue", async () => {
      const jobId = await queueManager.addJob(
        JobType.WARM_ACTOR_CACHE,
        { actorId: 2157 },
        { createdBy: "test" }
      )

      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows[0].queue_name).toBe(QueueName.CACHE)
    })

    it("should route maintenance jobs to maintenance queue", async () => {
      const jobId = await queueManager.addJob(JobType.GENERATE_SITEMAP, {}, { createdBy: "test" })

      const result = await pool.query("SELECT * FROM job_runs WHERE job_id = $1", [jobId])

      expect(result.rows[0].queue_name).toBe(QueueName.MAINTENANCE)
    })
  })
})
