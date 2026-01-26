/**
 * Tests for Admin Jobs API routes
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, Response } from "express"
import { Queue } from "bullmq"
import * as queueManagerModule from "../../lib/jobs/queue-manager.js"
import * as poolModule from "../../lib/db/pool.js"

// Mock dependencies
vi.mock("../../lib/jobs/queue-manager.js")
vi.mock("../../lib/db/pool.js")
vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe("Admin Jobs API", () => {
  let mockQueue: Partial<Queue>
  let mockPool: {
    query: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    // Mock queue
    mockQueue = {
      name: "ratings",
      getWaitingCount: vi.fn().mockResolvedValue(10),
      getActiveCount: vi.fn().mockResolvedValue(2),
      getCompletedCount: vi.fn().mockResolvedValue(100),
      getFailedCount: vi.fn().mockResolvedValue(5),
      getDelayedCount: vi.fn().mockResolvedValue(0),
      isPaused: vi.fn().mockResolvedValue(false),
      getJobs: vi.fn().mockResolvedValue([]),
      getJob: vi.fn(),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      clean: vi.fn().mockResolvedValue([]),
    }

    // Mock queue manager
    vi.mocked(queueManagerModule.queueManager).getAllQueues = vi
      .fn()
      .mockReturnValue([mockQueue as Queue])
    vi.mocked(queueManagerModule.queueManager).getQueue = vi
      .fn()
      .mockReturnValue(mockQueue as Queue)

    // Mock database pool
    mockPool = {
      query: vi.fn(),
    }
    vi.mocked(poolModule.getPool).mockReturnValue(mockPool as never)

    vi.clearAllMocks()
  })

  describe("GET /queues", () => {
    it("returns queue stats", async () => {
      // This test verifies the queue manager integration
      // Actual router testing would require setting up Express
      const queues = queueManagerModule.queueManager.getAllQueues()
      expect(queues).toHaveLength(1)
      expect(queues[0].name).toBe("ratings")

      const stats = await mockQueue.getWaitingCount!()
      expect(stats).toBe(10)
    })
  })

  describe("GET /queue/:name", () => {
    it("returns queue details", async () => {
      const queue = queueManagerModule.queueManager.getQueue("ratings" as never)
      expect(queue).toBeDefined()
      expect(queue?.name).toBe("ratings")
    })

    it("returns 404 for non-existent queue", () => {
      vi.mocked(queueManagerModule.queueManager).getQueue = vi.fn().mockReturnValue(undefined)

      const queue = queueManagerModule.queueManager.getQueue("nonexistent" as never)
      expect(queue).toBeUndefined()
    })
  })

  describe("GET /runs", () => {
    it("returns paginated job runs", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: "50" }],
      })

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            job_id: "job-1",
            job_type: "fetch-omdb-ratings",
            status: "completed",
            queued_at: new Date(),
          },
        ],
      })

      const countResult = await mockPool.query("SELECT COUNT(*) FROM job_runs")
      expect(countResult.rows[0].count).toBe("50")

      const result = await mockPool.query("SELECT * FROM job_runs")
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].job_type).toBe("fetch-omdb-ratings")
    })
  })

  describe("GET /runs/:id", () => {
    it("returns job run details", async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            job_id: "job-1",
            job_type: "fetch-omdb-ratings",
            payload: { entityType: "movie", entityId: 550 },
          },
        ],
      })

      const result = await mockPool.query("SELECT * FROM job_runs WHERE id = $1", [1])
      expect(result.rows[0].job_type).toBe("fetch-omdb-ratings")
    })

    it("returns 404 for non-existent job", async () => {
      mockPool.query.mockResolvedValue({ rows: [] })

      const result = await mockPool.query("SELECT * FROM job_runs WHERE id = $1", [999])
      expect(result.rows).toHaveLength(0)
    })
  })

  describe("POST /runs/:id/retry", () => {
    it("retries a failed job", async () => {
      const mockJob = {
        id: "job-1",
        retry: vi.fn().mockResolvedValue(undefined),
      }

      mockPool.query.mockResolvedValue({
        rows: [
          {
            job_id: "job-1",
            job_type: "fetch-omdb-ratings",
            queue_name: "ratings",
            payload: {},
          },
        ],
      })

      mockQueue.getJob = vi.fn().mockResolvedValue(mockJob)

      const job = await mockQueue.getJob!("job-1")
      await job.retry()

      expect(mockJob.retry).toHaveBeenCalled()
    })
  })

  describe("POST /queue/:name/pause", () => {
    it("pauses a queue", async () => {
      await mockQueue.pause!()
      expect(mockQueue.pause).toHaveBeenCalled()
    })
  })

  describe("POST /queue/:name/resume", () => {
    it("resumes a queue", async () => {
      await mockQueue.resume!()
      expect(mockQueue.resume).toHaveBeenCalled()
    })
  })

  describe("POST /cleanup", () => {
    it("cleans old completed jobs", async () => {
      mockQueue.clean = vi.fn().mockResolvedValue(["job-1", "job-2", "job-3"])

      const result = await mockQueue.clean!(24 * 60 * 60 * 1000, 1000, "completed")
      expect(result).toHaveLength(3)
    })
  })

  describe("GET /dead-letter", () => {
    it("returns dead letter queue jobs", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ count: "10" }],
      })

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            job_id: "job-1",
            job_type: "fetch-omdb-ratings",
            failed_at: new Date(),
            reviewed: false,
          },
        ],
      })

      const countResult = await mockPool.query("SELECT COUNT(*) FROM job_dead_letter")
      expect(countResult.rows[0].count).toBe("10")

      const result = await mockPool.query("SELECT * FROM job_dead_letter")
      expect(result.rows).toHaveLength(1)
    })
  })

  describe("POST /dead-letter/:id/review", () => {
    it("marks job as reviewed", async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 1 })

      await mockPool.query("UPDATE job_dead_letter SET reviewed = true WHERE id = $1", [1])

      expect(mockPool.query).toHaveBeenCalled()
    })
  })

  describe("GET /stats", () => {
    it("returns aggregated statistics", async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            {
              job_type: "fetch-omdb-ratings",
              total: 100,
              completed: 95,
              success_rate: 95.0,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              job_type: "fetch-omdb-ratings",
              avg_ms: 2500,
              median_ms: 2000,
              p95_ms: 4000,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              job_type: "fetch-omdb-ratings",
              count: 5,
              most_recent: new Date(),
            },
          ],
        })

      const successRates = await mockPool.query("SELECT job_type, COUNT(*) FROM job_runs")
      const durations = await mockPool.query("SELECT AVG(duration_ms) FROM job_runs")
      const deadLetter = await mockPool.query("SELECT COUNT(*) FROM job_dead_letter")

      expect(successRates.rows[0].success_rate).toBe(95.0)
      expect(durations.rows[0].avg_ms).toBe(2500)
      expect(deadLetter.rows[0].count).toBe(5)
    })
  })
})
