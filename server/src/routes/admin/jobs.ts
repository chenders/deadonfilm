/**
 * Admin API routes for job queue management
 *
 * Provides REST API for monitoring and managing background jobs.
 * Complements Bull Board with custom analytics and operations.
 */

import { Router } from "express"
import type { Request, Response } from "express"
import { queueManager } from "../../lib/jobs/queue-manager.js"
import { QueueName } from "../../lib/jobs/types.js"
import { getPool } from "../../lib/db/pool.js"
import { logger } from "../../lib/logger.js"

const router = Router()

/**
 * GET /admin/api/jobs/queues
 * List all queues with current stats
 */
router.get("/queues", async (_req: Request, res: Response) => {
  try {
    const queues = queueManager.getAllQueues()
    const queueStats = await Promise.all(
      queues.map(async (queue) => {
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
          queue.isPaused(),
        ])

        return {
          name: queue.name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          isPaused: paused,
        }
      })
    )

    res.json({ queues: queueStats })
  } catch (error) {
    logger.error({ error }, "Failed to fetch queue stats")
    res.status(500).json({ error: "Failed to fetch queue stats" })
  }
})

/**
 * GET /admin/api/jobs/queue/:name
 * Get detailed stats for a specific queue
 */
router.get("/queue/:name", async (req: Request, res: Response) => {
  try {
    const { name } = req.params
    const queue = queueManager.getQueue(name as QueueName)

    if (!queue) {
      return res.status(404).json({ error: "Queue not found" })
    }

    const [waiting, active, completed, failed, delayed, paused, jobs] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
      queue.getJobs(["waiting", "active", "completed", "failed"], 0, 10),
    ])

    res.json({
      name: queue.name,
      stats: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        isPaused: paused,
      },
      recentJobs: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      })),
    })
  } catch (error) {
    logger.error({ error, queueName: req.params.name }, "Failed to fetch queue details")
    res.status(500).json({ error: "Failed to fetch queue details" })
  }
})

/**
 * GET /admin/api/jobs/runs
 * Paginated job run history with filters
 */
router.get("/runs", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20
    const status = req.query.status as string | undefined
    const jobType = req.query.jobType as string | undefined
    const queueName = req.query.queueName as string | undefined

    const offset = (page - 1) * pageSize
    const pool = getPool()

    // Build query with filters
    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    if (status) {
      conditions.push(`status = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }

    if (jobType) {
      conditions.push(`job_type = $${paramIndex}`)
      params.push(jobType)
      paramIndex++
    }

    if (queueName) {
      conditions.push(`queue_name = $${paramIndex}`)
      params.push(queueName)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM job_runs ${whereClause}`
    const countResult = await pool.query(countQuery, params)
    const total = parseInt(countResult.rows[0].count)

    // Get paginated results
    const query = `
      SELECT *
      FROM job_runs
      ${whereClause}
      ORDER BY queued_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    params.push(pageSize, offset)

    const result = await pool.query(query, params)

    res.json({
      runs: result.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch job runs")
    res.status(500).json({ error: "Failed to fetch job runs" })
  }
})

/**
 * GET /admin/api/jobs/runs/:id
 * Get details for a specific job run
 */
router.get("/runs/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const pool = getPool()

    const result = await pool.query("SELECT * FROM job_runs WHERE id = $1", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Job run not found" })
    }

    res.json(result.rows[0])
  } catch (error) {
    logger.error({ error, jobId: req.params.id }, "Failed to fetch job run details")
    res.status(500).json({ error: "Failed to fetch job run details" })
  }
})

/**
 * POST /admin/api/jobs/runs/:id/retry
 * Retry a failed job
 */
router.post("/runs/:id/retry", async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const pool = getPool()

    // Get job details from database
    const result = await pool.query(
      "SELECT job_id, job_type, queue_name, payload FROM job_runs WHERE id = $1",
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Job run not found" })
    }

    const row = result.rows[0]
    const queue = queueManager.getQueue(row.queue_name as QueueName)

    if (!queue) {
      return res.status(404).json({ error: "Queue not found" })
    }

    // Get the original job from BullMQ
    const job = await queue.getJob(row.job_id)

    if (!job) {
      return res.status(404).json({ error: "Job not found in queue" })
    }

    // Retry the job
    await job.retry()

    logger.info({ jobId: row.job_id, jobType: row.job_type }, "Job retried via admin API")

    res.json({ success: true, message: "Job retry initiated" })
  } catch (error) {
    logger.error({ error, jobId: req.params.id }, "Failed to retry job")
    res.status(500).json({ error: "Failed to retry job" })
  }
})

/**
 * POST /admin/api/jobs/queue/:name/pause
 * Pause a queue
 */
router.post("/queue/:name/pause", async (req: Request, res: Response) => {
  try {
    const { name } = req.params
    const queue = queueManager.getQueue(name as QueueName)

    if (!queue) {
      return res.status(404).json({ error: "Queue not found" })
    }

    await queue.pause()

    logger.info({ queueName: name }, "Queue paused via admin API")

    res.json({ success: true, message: "Queue paused" })
  } catch (error) {
    logger.error({ error, queueName: req.params.name }, "Failed to pause queue")
    res.status(500).json({ error: "Failed to pause queue" })
  }
})

/**
 * POST /admin/api/jobs/queue/:name/resume
 * Resume a paused queue
 */
router.post("/queue/:name/resume", async (req: Request, res: Response) => {
  try {
    const { name } = req.params
    const queue = queueManager.getQueue(name as QueueName)

    if (!queue) {
      return res.status(404).json({ error: "Queue not found" })
    }

    await queue.resume()

    logger.info({ queueName: name }, "Queue resumed via admin API")

    res.json({ success: true, message: "Queue resumed" })
  } catch (error) {
    logger.error({ error, queueName: req.params.name }, "Failed to resume queue")
    res.status(500).json({ error: "Failed to resume queue" })
  }
})

/**
 * POST /admin/api/jobs/cleanup
 * Cleanup old completed jobs
 */
router.post("/cleanup", async (req: Request, res: Response) => {
  try {
    const gracePeriod = parseInt(req.body.gracePeriod as string) || 24 // hours
    const queues = queueManager.getAllQueues()

    let totalCleaned = 0

    for (const queue of queues) {
      // Clean completed jobs older than grace period
      const cleaned = await queue.clean(gracePeriod * 60 * 60 * 1000, 1000, "completed")
      totalCleaned += cleaned.length
    }

    logger.info({ totalCleaned, gracePeriod }, "Cleaned old completed jobs via admin API")

    res.json({ success: true, cleaned: totalCleaned })
  } catch (error) {
    logger.error({ error }, "Failed to cleanup jobs")
    res.status(500).json({ error: "Failed to cleanup jobs" })
  }
})

/**
 * GET /admin/api/jobs/dead-letter
 * Get dead letter queue (permanently failed jobs)
 */
router.get("/dead-letter", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20
    const reviewed = req.query.reviewed === "true"

    const offset = (page - 1) * pageSize
    const pool = getPool()

    // Get total count
    const countQuery = "SELECT COUNT(*) FROM job_dead_letter WHERE reviewed = $1"
    const countResult = await pool.query(countQuery, [reviewed])
    const total = parseInt(countResult.rows[0].count)

    // Get paginated results
    const query = `
      SELECT *
      FROM job_dead_letter
      WHERE reviewed = $1
      ORDER BY failed_at DESC
      LIMIT $2 OFFSET $3
    `

    const result = await pool.query(query, [reviewed, pageSize, offset])

    res.json({
      jobs: result.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch dead letter queue")
    res.status(500).json({ error: "Failed to fetch dead letter queue" })
  }
})

/**
 * POST /admin/api/jobs/dead-letter/:id/review
 * Mark a dead letter job as reviewed
 */
router.post("/dead-letter/:id/review", async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { notes } = req.body
    const pool = getPool()

    await pool.query(
      `UPDATE job_dead_letter
       SET reviewed = true,
           review_notes = $2,
           reviewed_at = NOW(),
           reviewed_by = $3
       WHERE id = $1`,
      [id, notes || null, "admin"] // TODO: Get actual admin username from session
    )

    logger.info({ deadLetterId: id }, "Dead letter job marked as reviewed")

    res.json({ success: true, message: "Job marked as reviewed" })
  } catch (error) {
    logger.error({ error, deadLetterId: req.params.id }, "Failed to review dead letter job")
    res.status(500).json({ error: "Failed to review dead letter job" })
  }
})

/**
 * GET /admin/api/jobs/stats
 * Get aggregated job statistics
 */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const pool = getPool()

    // Success rate by job type (last 24h)
    const successRateQuery = `
      SELECT
        job_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*) * 100, 2) as success_rate
      FROM job_runs
      WHERE queued_at > NOW() - INTERVAL '24 hours'
      GROUP BY job_type
      ORDER BY total DESC
    `
    const successRateResult = await pool.query(successRateQuery)

    // Average job duration by type
    const durationQuery = `
      SELECT
        job_type,
        ROUND(AVG(duration_ms)) as avg_ms,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)) as median_ms,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)) as p95_ms
      FROM job_runs
      WHERE status = 'completed' AND queued_at > NOW() - INTERVAL '24 hours'
      GROUP BY job_type
    `
    const durationResult = await pool.query(durationQuery)

    // Dead letter queue stats
    const deadLetterQuery = `
      SELECT
        job_type,
        COUNT(*) as count,
        MAX(failed_at) as most_recent
      FROM job_dead_letter
      WHERE reviewed = false
      GROUP BY job_type
      ORDER BY count DESC
    `
    const deadLetterResult = await pool.query(deadLetterQuery)

    res.json({
      successRates: successRateResult.rows,
      durations: durationResult.rows,
      deadLetterQueue: deadLetterResult.rows,
    })
  } catch (error) {
    logger.error({ error }, "Failed to fetch job stats")
    res.status(500).json({ error: "Failed to fetch job stats" })
  }
})

export default router
