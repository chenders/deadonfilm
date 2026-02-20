/**
 * Admin API routes for job queue management
 *
 * Provides REST API for monitoring and managing background jobs.
 * Complements Bull Board with custom analytics and operations.
 */

import { Router } from "express"
import type { Request, Response } from "express"
import { queueManager } from "../../lib/jobs/queue-manager.js"
import {
  QueueName,
  MAX_RECENT_JOBS,
  MAX_JOBS_TO_CLEAN,
  JobType,
  JobPriority,
} from "../../lib/jobs/types.js"
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
    res.status(500).json({ error: { message: "Failed to fetch queue stats" } })
  }
})

/**
 * GET /admin/api/jobs/queue/:name
 * Get detailed stats for a specific queue
 */
router.get("/queue/:name", async (req: Request, res: Response) => {
  try {
    const { name } = req.params

    if (!Object.values(QueueName).includes(name as QueueName)) {
      return res.status(400).json({ error: { message: "Invalid queue name" } })
    }

    const queue = queueManager.getQueue(name as QueueName)

    if (!queue) {
      return res.status(404).json({ error: { message: "Queue not found" } })
    }

    const [waiting, active, completed, failed, delayed, paused, jobs] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
      queue.getJobs(["waiting", "active", "completed", "failed"], 0, MAX_RECENT_JOBS),
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
    res.status(500).json({ error: { message: "Failed to fetch queue details" } })
  }
})

/**
 * GET /admin/api/jobs/runs
 * Paginated job run history with filters
 */
router.get("/runs", async (req: Request, res: Response) => {
  try {
    // Validate and parse pagination parameters
    let page = 1
    if (req.query.page !== undefined) {
      const parsedPage = Number.parseInt(req.query.page as string, 10)
      if (Number.isNaN(parsedPage) || parsedPage < 1) {
        return res.status(400).json({
          error: { message: "Invalid 'page' query parameter; must be a positive integer." },
        })
      }
      page = parsedPage
    }

    let pageSize = 20
    if (req.query.pageSize !== undefined) {
      const parsedPageSize = Number.parseInt(req.query.pageSize as string, 10)
      if (Number.isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
        return res.status(400).json({
          error: {
            message: "Invalid 'pageSize' query parameter; must be an integer between 1 and 100.",
          },
        })
      }
      pageSize = parsedPageSize
    }

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
    res.status(500).json({ error: { message: "Failed to fetch job runs" } })
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
      return res.status(404).json({ error: { message: "Job run not found" } })
    }

    res.json(result.rows[0])
  } catch (error) {
    logger.error({ error, jobId: req.params.id }, "Failed to fetch job run details")
    res.status(500).json({ error: { message: "Failed to fetch job run details" } })
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
      return res.status(404).json({ error: { message: "Job run not found" } })
    }

    const row = result.rows[0]
    const queue = queueManager.getQueue(row.queue_name as QueueName)

    if (!queue) {
      return res.status(404).json({ error: { message: "Queue not found" } })
    }

    // Create a new job with the original payload instead of retrying the old one
    // This allows retrying jobs even after they've been cleaned up from BullMQ
    const newJob = await queue.add(row.job_type, row.payload)

    logger.info(
      { originalJobId: row.job_id, newJobId: newJob.id, jobType: row.job_type },
      "Job retried via admin API by creating a new job"
    )

    res.json({ success: true, message: "Job retry initiated", jobId: newJob.id })
  } catch (error) {
    logger.error({ error, jobId: req.params.id }, "Failed to retry job")
    res.status(500).json({ error: { message: "Failed to retry job" } })
  }
})

/**
 * POST /admin/api/jobs/queue/:name/pause
 * Pause a queue
 */
router.post("/queue/:name/pause", async (req: Request, res: Response) => {
  try {
    const { name } = req.params

    // Validate that the provided queue name is one of the known QueueName values
    if (!Object.values(QueueName).includes(name as QueueName)) {
      return res.status(400).json({ error: { message: "Invalid queue name" } })
    }

    const queueName = name as QueueName
    const queue = queueManager.getQueue(queueName)

    if (!queue) {
      return res.status(404).json({ error: { message: "Queue not found" } })
    }

    await queue.pause()

    logger.info({ queueName: name }, "Queue paused via admin API")

    res.json({ success: true, message: "Queue paused" })
  } catch (error) {
    logger.error({ error, queueName: req.params.name }, "Failed to pause queue")
    res.status(500).json({ error: { message: "Failed to pause queue" } })
  }
})

/**
 * POST /admin/api/jobs/queue/:name/resume
 * Resume a paused queue
 */
router.post("/queue/:name/resume", async (req: Request, res: Response) => {
  try {
    const { name } = req.params

    if (!Object.values(QueueName).includes(name as QueueName)) {
      return res.status(400).json({ error: { message: "Invalid queue name" } })
    }

    const queue = queueManager.getQueue(name as QueueName)

    if (!queue) {
      return res.status(404).json({ error: { message: "Queue not found" } })
    }

    await queue.resume()

    logger.info({ queueName: name }, "Queue resumed via admin API")

    res.json({ success: true, message: "Queue resumed" })
  } catch (error) {
    logger.error({ error, queueName: req.params.name }, "Failed to resume queue")
    res.status(500).json({ error: { message: "Failed to resume queue" } })
  }
})

/**
 * POST /admin/api/jobs/cleanup
 * Cleanup old completed jobs
 */
router.post("/cleanup", async (req: Request, res: Response) => {
  try {
    const gracePeriod = Math.min(168, Math.max(1, parseInt(req.body.gracePeriod as string) || 24)) // hours
    const gracePeriodMs = gracePeriod * 60 * 60 * 1000
    const queues = queueManager.getAllQueues()

    const cleanupResults = await Promise.all(
      queues.map((queue) => queue.clean(gracePeriodMs, MAX_JOBS_TO_CLEAN, "completed"))
    )

    const totalCleaned = cleanupResults.reduce((sum, cleaned) => sum + cleaned.length, 0)

    logger.info({ totalCleaned, gracePeriod }, "Cleaned old completed jobs via admin API")

    res.json({ success: true, cleaned: totalCleaned })
  } catch (error) {
    logger.error({ error }, "Failed to cleanup jobs")
    res.status(500).json({ error: { message: "Failed to cleanup jobs" } })
  }
})

/**
 * GET /admin/api/jobs/dead-letter
 * Get dead letter queue (permanently failed jobs)
 */
router.get("/dead-letter", async (req: Request, res: Response) => {
  try {
    // Validate and parse pagination parameters
    let page = 1
    if (req.query.page !== undefined) {
      const parsedPage = Number.parseInt(req.query.page as string, 10)
      if (Number.isNaN(parsedPage) || parsedPage < 1) {
        return res.status(400).json({ error: { message: "Invalid page parameter" } })
      }
      page = parsedPage
    }

    let pageSize = 20
    if (req.query.pageSize !== undefined) {
      const parsedPageSize = Number.parseInt(req.query.pageSize as string, 10)
      if (Number.isNaN(parsedPageSize) || parsedPageSize < 1) {
        return res.status(400).json({ error: { message: "Invalid pageSize parameter" } })
      }
      pageSize = Math.min(100, parsedPageSize)
    }

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
    res.status(500).json({ error: { message: "Failed to fetch dead letter queue" } })
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

    const result = await pool.query(
      `UPDATE job_dead_letter
       SET reviewed = true,
           review_notes = $2,
           reviewed_at = NOW(),
           reviewed_by = $3
       WHERE id = $1`,
      [id, notes || null, "admin"] // TODO: Get actual admin username from session
    )

    if (result.rowCount === 0) {
      return res.status(404).json({ error: { message: "Dead letter job not found" } })
    }

    logger.info({ deadLetterId: id }, "Dead letter job marked as reviewed")

    res.json({ success: true, message: "Job marked as reviewed" })
  } catch (error) {
    logger.error({ error, deadLetterId: req.params.id }, "Failed to review dead letter job")
    res.status(500).json({ error: { message: "Failed to review dead letter job" } })
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
    res.status(500).json({ error: { message: "Failed to fetch job stats" } })
  }
})

// ============================================================
// OMDB BACKFILL ENDPOINTS
// ============================================================

interface OMDbCoverageResponse {
  movies: { needsData: number; total: number }
  shows: { needsData: number; total: number }
}

/**
 * GET /admin/api/jobs/omdb/coverage
 * Get coverage stats for OMDB ratings
 */
router.get("/omdb/coverage", async (_req: Request, res: Response) => {
  try {
    const pool = getPool()

    const [movieStats, showStats] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE imdb_id IS NOT NULL AND omdb_updated_at IS NULL) as needs_data,
          COUNT(*) FILTER (WHERE imdb_id IS NOT NULL) as total
        FROM movies
      `),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE imdb_id IS NOT NULL AND omdb_updated_at IS NULL) as needs_data,
          COUNT(*) FILTER (WHERE imdb_id IS NOT NULL) as total
        FROM shows
      `),
    ])

    const response: OMDbCoverageResponse = {
      movies: {
        needsData: parseInt(movieStats.rows[0].needs_data),
        total: parseInt(movieStats.rows[0].total),
      },
      shows: {
        needsData: parseInt(showStats.rows[0].needs_data),
        total: parseInt(showStats.rows[0].total),
      },
    }

    res.json(response)
  } catch (error) {
    logger.error({ error }, "Failed to fetch OMDB coverage stats")
    res.status(500).json({ error: { message: "Failed to fetch OMDB coverage stats" } })
  }
})

interface BackfillOMDbRequest {
  limit?: number
  moviesOnly?: boolean
  showsOnly?: boolean
  minPopularity?: number
  priority?: "low" | "normal" | "high" | "critical"
}

const MIN_LIMIT = 1
const MAX_LIMIT = 1000
const JOB_BATCH_SIZE = 50 // Number of jobs to queue in parallel

/**
 * POST /admin/api/jobs/omdb/backfill
 * Queue OMDB ratings fetch jobs
 */
router.post("/omdb/backfill", async (req: Request, res: Response) => {
  try {
    const { limit, moviesOnly, showsOnly, minPopularity, priority }: BackfillOMDbRequest = req.body

    // Validate limit
    if (limit !== undefined && (limit < MIN_LIMIT || limit > MAX_LIMIT)) {
      return res
        .status(400)
        .json({ error: { message: `Limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}` } })
    }

    // Validate minPopularity
    if (minPopularity !== undefined && minPopularity < 0) {
      return res.status(400).json({
        error: { message: "minPopularity must be non-negative" },
      })
    }

    // Validate priority
    const priorityMap: Record<string, JobPriority> = {
      low: JobPriority.LOW,
      normal: JobPriority.NORMAL,
      high: JobPriority.HIGH,
      critical: JobPriority.CRITICAL,
    }
    // Validate priority before using it
    if (priority && !(priority in priorityMap)) {
      return res.status(400).json({
        error: { message: "Priority must be one of: low, normal, high, critical" },
      })
    }
    const jobPriority = priority ? priorityMap[priority] : JobPriority.LOW

    if (!queueManager.isReady) {
      return res.status(503).json({
        error: {
          message:
            "Job queue is not available. Ensure REDIS_JOBS_URL is configured and Redis is running.",
        },
      })
    }

    const pool = getPool()
    let totalQueued = 0

    // Queue movie jobs
    if (!showsOnly) {
      const conditions: string[] = ["imdb_id IS NOT NULL", "omdb_updated_at IS NULL"]
      const params: number[] = []
      let paramIndex = 1

      if (minPopularity !== undefined && minPopularity > 0) {
        conditions.push(`dof_popularity >= $${paramIndex}`)
        params.push(minPopularity)
        paramIndex++
      }

      let limitClause = ""
      if (limit !== undefined) {
        limitClause = `LIMIT $${paramIndex}`
        params.push(limit)
      }

      const query = `
        SELECT tmdb_id, imdb_id
        FROM movies
        WHERE ${conditions.join(" AND ")}
        ORDER BY dof_popularity DESC NULLS LAST
        ${limitClause}
      `

      const result = await pool.query<{ tmdb_id: number; imdb_id: string }>(query, params)

      // Queue jobs in parallel batches for better performance
      for (let i = 0; i < result.rows.length; i += JOB_BATCH_SIZE) {
        const batch = result.rows.slice(i, i + JOB_BATCH_SIZE)
        await Promise.all(
          batch.map((movie) =>
            queueManager.addJob(
              JobType.FETCH_OMDB_RATINGS,
              {
                entityType: "movie",
                entityId: movie.tmdb_id,
                imdbId: movie.imdb_id,
              },
              {
                priority: jobPriority,
                createdBy: "admin-ui-backfill",
              }
            )
          )
        )
        totalQueued += batch.length
      }
    }

    // Queue show jobs
    if (!moviesOnly) {
      const conditions: string[] = ["imdb_id IS NOT NULL", "omdb_updated_at IS NULL"]
      const params: number[] = []
      let paramIndex = 1

      if (minPopularity !== undefined && minPopularity > 0) {
        conditions.push(`dof_popularity >= $${paramIndex}`)
        params.push(minPopularity)
        paramIndex++
      }

      let limitClause = ""
      if (limit !== undefined) {
        limitClause = `LIMIT $${paramIndex}`
        params.push(limit)
      }

      const query = `
        SELECT tmdb_id, imdb_id
        FROM shows
        WHERE ${conditions.join(" AND ")}
        ORDER BY dof_popularity DESC NULLS LAST
        ${limitClause}
      `

      const result = await pool.query<{ tmdb_id: number; imdb_id: string }>(query, params)

      // Queue jobs in parallel batches for better performance
      for (let i = 0; i < result.rows.length; i += JOB_BATCH_SIZE) {
        const batch = result.rows.slice(i, i + JOB_BATCH_SIZE)
        await Promise.all(
          batch.map((show) =>
            queueManager.addJob(
              JobType.FETCH_OMDB_RATINGS,
              {
                entityType: "show",
                entityId: show.tmdb_id,
                imdbId: show.imdb_id,
              },
              {
                priority: jobPriority,
                createdBy: "admin-ui-backfill",
              }
            )
          )
        )
        totalQueued += batch.length
      }
    }

    logger.info(
      { queued: totalQueued, moviesOnly, showsOnly, limit, minPopularity, priority },
      "OMDB backfill jobs queued via admin API"
    )

    res.json({
      queued: totalQueued,
      message: `Queued ${totalQueued} OMDB rating fetch jobs`,
    })
  } catch (error) {
    logger.error({ error }, "Failed to queue OMDB backfill jobs")
    res.status(500).json({ error: { message: "Failed to queue OMDB backfill jobs" } })
  }
})

export default router
