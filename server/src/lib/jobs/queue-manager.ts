/**
 * Queue Manager - Centralized job queue management
 *
 * Responsibilities:
 * - Initialize all BullMQ queues on startup
 * - Type-safe job creation API
 * - Event listeners for job lifecycle (queued, active, completed, failed)
 * - Sync job state to PostgreSQL for auditing
 * - Queue management: pause/resume, cleanup, stats
 * - Graceful shutdown
 */

import { Queue, QueueEvents } from "bullmq"
import newrelic from "newrelic"
import { getPool } from "../db.js"
import { logger } from "../logger.js"
import { getRedisJobsClient } from "./redis.js"
import {
  JobType,
  QueueName,
  JobPriority,
  JobStatus,
  JobOptions,
  jobTypeToQueue,
  jobPayloadSchemas,
  type JobPayloadMap,
} from "./types.js"

// Configuration constants
const COMPLETED_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60 // 7 days
const MAX_COMPLETED_JOBS_TO_KEEP = 10000
const DEFAULT_BACKOFF_DELAY_MS = 60000 // 1 minute

/**
 * Centralized queue manager singleton
 */
class QueueManager {
  private queues: Map<QueueName, Queue> = new Map()
  private queueEvents: Map<QueueName, QueueEvents> = new Map()
  private initialized = false

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn("Queue manager already initialized")
      return
    }

    logger.info("Initializing job queue manager...")

    // Create a queue for each queue name
    for (const queueName of Object.values(QueueName)) {
      const queue = new Queue(queueName, {
        connection: getRedisJobsClient(),
        defaultJobOptions: {
          removeOnComplete: {
            age: COMPLETED_JOB_RETENTION_SECONDS,
            count: MAX_COMPLETED_JOBS_TO_KEEP,
          },
          removeOnFail: false, // Never auto-remove failed jobs
          attempts: 3, // Default retry attempts
          backoff: {
            type: "exponential",
            delay: DEFAULT_BACKOFF_DELAY_MS, // Start with 1 minute, then 2min, 4min
          },
        },
      })

      this.queues.set(queueName, queue)

      // Set up queue events
      const queueEvents = new QueueEvents(queueName, {
        connection: getRedisJobsClient(),
      })

      this.queueEvents.set(queueName, queueEvents)

      // Listen to job lifecycle events
      this.setupEventListeners(queueName, queueEvents)

      logger.info({ queue: queueName }, "Queue initialized")
    }

    this.initialized = true
    logger.info("Job queue manager initialized successfully")

    // Record initialization metric
    newrelic.recordMetric("Custom/JobQueue/Initialized", 1)
  }

  /**
   * Set up event listeners for a queue
   */
  private setupEventListeners(queueName: QueueName, queueEvents: QueueEvents): void {
    // Job added to queue
    queueEvents.on("added", async ({ jobId }) => {
      logger.debug({ queue: queueName, jobId }, "Job queued")
    })

    // Job started processing
    queueEvents.on("active", async ({ jobId }) => {
      logger.debug({ queue: queueName, jobId }, "Job started")

      try {
        // Only update to active if not already completed (race condition: failed event may fire before active event)
        const pool = getPool()
        await pool.query(
          `UPDATE job_runs
           SET status = $1, started_at = $2
           WHERE job_id = $3 AND completed_at IS NULL`,
          [JobStatus.ACTIVE, new Date(), jobId]
        )
      } catch (error) {
        logger.error({ queue: queueName, jobId, error }, "Failed to update active job in database")
      }
    })

    // Job completed successfully
    queueEvents.on("completed", async ({ jobId, returnvalue }) => {
      logger.info({ queue: queueName, jobId }, "Job completed")

      const completedAt = new Date()

      try {
        // Update status, result, completed_at, and duration_ms in a single atomic query
        const pool = getPool()
        const result = await pool.query(
          `
          UPDATE job_runs
          SET status = $1,
              completed_at = $2,
              result = $3,
              duration_ms = CASE
                WHEN started_at IS NOT NULL
                  THEN EXTRACT(EPOCH FROM ($2::timestamptz - started_at)) * 1000
                ELSE NULL
              END
          WHERE job_id = $4
            AND completed_at IS NULL
          RETURNING duration_ms
        `,
          [JobStatus.COMPLETED, completedAt, returnvalue, jobId]
        )

        const durationMs = result.rows[0]?.duration_ms

        // Record New Relic metrics
        newrelic.recordMetric(`Custom/JobQueue/${queueName}/Completed`, 1)
        if (durationMs) {
          newrelic.recordMetric(`Custom/JobQueue/${queueName}/ProcessingTime`, durationMs)
        }
      } catch (error) {
        logger.error(
          { queue: queueName, jobId, error },
          "Failed to update completed job in database"
        )
      }
    })

    // Job failed
    queueEvents.on("failed", async ({ jobId, failedReason }) => {
      logger.error({ queue: queueName, jobId, error: failedReason }, "Job failed")
      logger.debug(
        { queue: queueName, jobId },
        "Job failed event handler: starting database update"
      )

      const completedAt = new Date()

      try {
        // Update status, completed_at, error_message, duration_ms, and increment attempts in a single atomic query
        const pool = getPool()
        logger.debug(
          { queue: queueName, jobId },
          "Job failed event handler: executing UPDATE query"
        )
        const result = await pool.query(
          `
          UPDATE job_runs
          SET status = $1,
              completed_at = $2,
              error_message = $3,
              duration_ms = CASE
                WHEN started_at IS NOT NULL
                  THEN EXTRACT(EPOCH FROM ($2::timestamptz - started_at)) * 1000
                ELSE NULL
              END,
              attempts = attempts + 1
          WHERE job_id = $4
            AND completed_at IS NULL
          RETURNING attempts, max_attempts, job_type, payload
        `,
          [JobStatus.FAILED, completedAt, failedReason, jobId]
        )
        logger.debug(
          { queue: queueName, jobId, rowsAffected: result.rowCount },
          "Job failed event handler: UPDATE query completed"
        )

        const row = result.rows[0]

        // If max attempts reached, move to dead letter queue
        if (row && row.attempts >= row.max_attempts) {
          await pool.query(
            `
            INSERT INTO job_dead_letter (job_id, job_type, queue_name, attempts, final_error, payload)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
            [jobId, row.job_type, queueName, row.attempts, failedReason, row.payload]
          )

          logger.warn(
            { queue: queueName, jobId, attempts: row.attempts },
            "Job moved to dead letter queue"
          )

          newrelic.recordMetric(`Custom/JobQueue/${queueName}/DeadLetter`, 1)
        }

        newrelic.recordMetric(`Custom/JobQueue/${queueName}/Failed`, 1)
      } catch (error) {
        logger.error({ queue: queueName, jobId, error }, "Failed to update failed job in database")
      }
    })

    // Job delayed (scheduled for future)
    queueEvents.on("delayed", async ({ jobId, delay }) => {
      logger.debug({ queue: queueName, jobId, delayMs: delay }, "Job delayed")

      await this.updateJobStatus(jobId, JobStatus.DELAYED)
    })

    // Job stalled (worker crashed during processing)
    queueEvents.on("stalled", async ({ jobId }) => {
      logger.warn({ queue: queueName, jobId }, "Job stalled - worker may have crashed")

      newrelic.recordMetric(`Custom/JobQueue/${queueName}/Stalled`, 1)
    })
  }

  /**
   * Add a job to the queue
   */
  async addJob<T extends JobType>(
    jobType: T,
    payload: JobPayloadMap[T],
    options: JobOptions = {}
  ): Promise<string> {
    if (!this.initialized) {
      throw new Error("Queue manager not initialized. Call initialize() first.")
    }

    // Validate payload
    const schema = jobPayloadSchemas[jobType]
    const validation = schema.safeParse(payload)

    if (!validation.success) {
      logger.error({ jobType, error: validation.error }, "Invalid job payload")
      throw new Error(`Invalid payload for job type ${jobType}: ${validation.error.message}`)
    }

    // Get queue for this job type
    const queueName = jobTypeToQueue[jobType]
    const queue = this.queues.get(queueName)

    if (!queue) {
      throw new Error(`Queue not found for job type: ${jobType}`)
    }

    // Pre-generate job ID for database consistency
    // BullMQ auto-generates IDs, but we can specify a custom one
    const jobId = options.jobId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    const priority = options.priority ?? JobPriority.NORMAL
    const attempts = options.attempts ?? 3

    // CRITICAL: Insert into database BEFORE adding to BullMQ queue
    // This prevents race condition where worker picks up job before row exists
    const pool = getPool()
    await pool.query(
      `
      INSERT INTO job_runs (
        job_id, job_type, queue_name, status, priority,
        payload, max_attempts, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        jobId,
        jobType,
        queueName,
        JobStatus.PENDING,
        priority,
        payload,
        attempts,
        options.createdBy ?? "unknown",
      ]
    )

    // Now add job to BullMQ queue (worker can safely process it now)
    const job = await queue.add(jobType, payload, {
      jobId, // Use the same ID we inserted into database
      priority,
      delay: options.delay,
      attempts,
      backoff: options.backoff ?? {
        type: "exponential",
        delay: 60000,
      },
      removeOnComplete: options.removeOnComplete,
      removeOnFail: options.removeOnFail,
    })

    logger.info(
      {
        jobId: job.id,
        jobType,
        queue: queueName,
        priority: job.opts.priority,
      },
      "Job added to queue"
    )

    // Record New Relic events
    newrelic.recordCustomEvent("JobQueued", {
      jobId: job.id ?? "unknown",
      jobType,
      queueName,
      priority: job.opts.priority ?? 0,
      createdBy: options.createdBy ?? "unknown",
      timestamp: Date.now(),
    })

    // Record queue depth metric
    const waitingCount = await queue.getWaitingCount()
    newrelic.recordMetric(`Custom/JobQueue/${queueName}/Depth`, waitingCount)

    return job.id!
  }

  /**
   * Update job status in database
   */
  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
    additionalFields: Record<string, unknown> = {}
  ): Promise<void> {
    const pool = getPool()

    const fields: string[] = ["status = $2"]
    const values: unknown[] = [jobId, status]
    let paramIndex = 3

    for (const [key, value] of Object.entries(additionalFields)) {
      fields.push(`${key} = $${paramIndex}`)
      values.push(value)
      paramIndex++
    }

    const query = `
      UPDATE job_runs
      SET ${fields.join(", ")}
      WHERE job_id = $1
    `

    await pool.query(query, values)
  }

  /**
   * Get queue by name
   */
  getQueue(queueName: QueueName): Queue | undefined {
    return this.queues.get(queueName)
  }

  /**
   * Get queue events by name
   */
  getQueueEvents(queueName: QueueName): QueueEvents | undefined {
    return this.queueEvents.get(queueName)
  }

  /**
   * Get all queues
   */
  getAllQueues(): Queue[] {
    return Array.from(this.queues.values())
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: QueueName): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    isPaused: boolean
  }> {
    const queue = this.queues.get(queueName)

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`)
    }

    const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ])

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      isPaused,
    }
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName)

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`)
    }

    await queue.pause()
    logger.info({ queue: queueName }, "Queue paused")

    newrelic.recordMetric(`Custom/JobQueue/${queueName}/Paused`, 1)
  }

  /**
   * Resume a paused queue
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName)

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`)
    }

    await queue.resume()
    logger.info({ queue: queueName }, "Queue resumed")

    newrelic.recordMetric(`Custom/JobQueue/${queueName}/Resumed`, 1)
  }

  /**
   * Clean completed jobs older than specified age
   */
  async cleanOldJobs(
    queueName: QueueName,
    olderThanMs: number = 7 * 24 * 60 * 60 * 1000
  ): Promise<number> {
    const queue = this.queues.get(queueName)

    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`)
    }

    const jobs = await queue.clean(olderThanMs, 1000, "completed")
    logger.info({ queue: queueName, cleaned: jobs.length }, "Cleaned old completed jobs")

    return jobs.length
  }

  /**
   * Graceful shutdown - close all queues and event listeners
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down queue manager...")

    // Close all queue events
    for (const [queueName, queueEvents] of this.queueEvents.entries()) {
      await queueEvents.close()
      logger.debug({ queue: queueName }, "Queue events closed")
    }

    // Close all queues
    for (const [queueName, queue] of this.queues.entries()) {
      await queue.close()
      logger.debug({ queue: queueName }, "Queue closed")
    }

    this.queues.clear()
    this.queueEvents.clear()
    this.initialized = false

    logger.info("Queue manager shut down successfully")
  }
}

// Export singleton instance
export const queueManager = new QueueManager()
