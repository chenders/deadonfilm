/**
 * Job Worker - Processes jobs from queues
 *
 * Responsibilities:
 * - Start workers for specified queues
 * - Register job handlers
 * - Process jobs by delegating to appropriate handler
 * - Configure concurrency per queue
 * - Configure rate limits per queue
 * - Handle worker errors gracefully
 * - Send periodic heartbeat metrics to New Relic
 */

import { Worker, Job } from "bullmq"
import newrelic from "newrelic"
import { logger } from "../logger.js"
import { getRedisJobsClient } from "./redis.js"
import { QueueName, queueConfigs, type JobType } from "./types.js"
import { getHandler } from "./handlers/index.js"

/**
 * Job Worker class
 */
export class JobWorker {
  private workers: Map<QueueName, Worker> = new Map()
  private processedCount = 0
  private failedCount = 0
  private heartbeatInterval?: NodeJS.Timeout

  /**
   * Start workers for specified queues
   * If no queues specified, starts workers for all queues
   */
  async start(queueNames: QueueName[] = Object.values(QueueName)): Promise<void> {
    logger.info({ queues: queueNames }, "Starting job workers...")

    for (const queueName of queueNames) {
      const config = queueConfigs[queueName]

      if (!config) {
        logger.error({ queue: queueName }, "Queue configuration not found")
        continue
      }

      // Create worker for this queue
      const worker = new Worker(
        queueName,
        async (job: Job) => {
          return this.processJob(job)
        },
        {
          connection: getRedisJobsClient(),
          concurrency: config.concurrency,
          limiter: config.rateLimit
            ? {
                max: config.rateLimit.max,
                duration: config.rateLimit.duration,
              }
            : undefined,
          autorun: true,
        }
      )

      // Set up worker event listeners
      this.setupWorkerEvents(worker, queueName)

      this.workers.set(queueName, worker)

      logger.info(
        {
          queue: queueName,
          concurrency: config.concurrency,
          rateLimit: config.rateLimit,
        },
        "Worker started"
      )
    }

    // Start heartbeat
    this.startHeartbeat()

    logger.info({ workerCount: this.workers.size }, "All workers started successfully")
  }

  /**
   * Process a job by delegating to appropriate handler
   */
  private async processJob(job: Job): Promise<unknown> {
    const jobType = job.name as JobType
    const jobLogger = logger.child({
      jobId: job.id,
      jobType,
      attemptNumber: job.attemptsMade + 1,
    })

    jobLogger.info("Processing job")

    // Get handler for this job type
    const handler = getHandler(jobType)

    if (!handler) {
      jobLogger.error({ jobType }, "No handler registered for job type")
      throw new Error(`No handler registered for job type: ${jobType}`)
    }

    // Execute job through handler
    const startTime = Date.now()

    try {
      const result = await handler.execute(job)

      const duration = Date.now() - startTime

      jobLogger.info({ durationMs: duration }, "Job processed successfully")

      this.processedCount++

      // Record success metric
      newrelic.recordMetric(`Custom/Worker/ProcessedCount`, this.processedCount)

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      jobLogger.error({ durationMs: duration, error }, "Job processing failed")

      this.failedCount++

      // Record failure metric
      newrelic.recordMetric(`Custom/Worker/FailedCount`, this.failedCount)

      throw error
    }
  }

  /**
   * Set up event listeners for a worker
   */
  private setupWorkerEvents(worker: Worker, queueName: QueueName): void {
    // Worker started
    worker.on("ready", () => {
      logger.info({ queue: queueName }, "Worker ready")
    })

    // Worker active (processing job)
    worker.on("active", (job: Job) => {
      const startedAt = Date.now()
      const queuedAt = job.timestamp
      const waitTimeMs = startedAt - queuedAt

      logger.debug(
        {
          queue: queueName,
          jobId: job.id,
          jobType: job.name,
          waitTimeMs,
        },
        "Worker started processing job"
      )

      // Record New Relic custom event
      newrelic.recordCustomEvent("JobStarted", {
        jobId: job.id ?? "unknown",
        jobType: job.name,
        queueName,
        attemptNumber: job.attemptsMade + 1,
        priority: job.opts.priority ?? 0,
        queuedAt,
        startedAt,
        waitTimeMs,
        timestamp: Date.now(),
      })
    })

    // Worker completed job
    worker.on("completed", (job: Job, _result: unknown) => {
      const completedAt = Date.now()
      const duration = job.processedOn ? completedAt - job.processedOn : 0

      logger.info(
        {
          queue: queueName,
          jobId: job.id,
          jobType: job.name,
          durationMs: duration,
        },
        "Worker completed job"
      )

      // Record New Relic custom event (already done in handler, but add worker context)
      newrelic.recordCustomEvent("JobCompleted", {
        jobId: job.id ?? "unknown",
        jobType: job.name,
        queueName,
        durationMs: duration,
        attemptNumber: job.attemptsMade,
        success: true,
        timestamp: Date.now(),
      })

      // Record processing time metric
      newrelic.recordMetric(`Custom/JobQueue/${queueName}/ProcessingTime`, duration)
      newrelic.recordMetric(`Custom/JobQueue/${queueName}/Completed`, 1)
    })

    // Worker failed to process job
    worker.on("failed", (job: Job | undefined, error: Error) => {
      if (!job) {
        logger.error({ queue: queueName, error }, "Worker failed without job context")
        return
      }

      const failedAt = Date.now()
      const duration = job.processedOn ? failedAt - job.processedOn : 0

      logger.error(
        {
          queue: queueName,
          jobId: job.id,
          jobType: job.name,
          attemptNumber: job.attemptsMade,
          maxAttempts: job.opts.attempts ?? 3,
          durationMs: duration,
          error: error.message,
        },
        "Worker failed to process job"
      )

      // Record New Relic custom event
      newrelic.recordCustomEvent("JobFailed", {
        jobId: job.id ?? "unknown",
        jobType: job.name,
        queueName,
        attemptNumber: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? 3,
        error: error.message,
        errorType: error.name,
        isPermanent: job.attemptsMade >= (job.opts.attempts ?? 3),
        durationMs: duration,
        timestamp: Date.now(),
      })

      newrelic.recordMetric(`Custom/JobQueue/${queueName}/Failed`, 1)

      // Report error to New Relic
      newrelic.noticeError(error, {
        jobId: job.id ?? "unknown",
        jobType: job.name,
        queue: queueName,
        attemptNumber: job.attemptsMade,
      })
    })

    // Worker stalled (job stuck, worker may have crashed)
    worker.on("stalled", (jobId: string) => {
      logger.warn(
        {
          queue: queueName,
          jobId,
        },
        "Worker detected stalled job"
      )

      // Record New Relic custom event
      newrelic.recordCustomEvent("JobStalled", {
        jobId,
        queueName,
        timestamp: Date.now(),
      })

      newrelic.recordMetric(`Custom/JobQueue/${queueName}/Stalled`, 1)
    })

    // Worker error
    worker.on("error", (error: Error) => {
      logger.error(
        {
          queue: queueName,
          error: error.message,
          stack: error.stack,
        },
        "Worker error"
      )

      newrelic.noticeError(error, {
        queue: queueName,
        workerError: true,
      })
    })

    // Worker closing
    worker.on("closing", () => {
      logger.info({ queue: queueName }, "Worker closing")
    })

    // Worker closed
    worker.on("closed", () => {
      logger.info({ queue: queueName }, "Worker closed")
    })
  }

  /**
   * Start periodic heartbeat to New Relic
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      // Record heartbeat metric
      newrelic.recordMetric("Custom/Worker/Heartbeat", 1)
      newrelic.recordMetric("Custom/Worker/ProcessedCount", this.processedCount)
      newrelic.recordMetric("Custom/Worker/FailedCount", this.failedCount)

      // Calculate success rate
      const successRate =
        this.processedCount > 0
          ? ((this.processedCount - this.failedCount) / this.processedCount) * 100
          : 100

      newrelic.recordMetric("Custom/Worker/SuccessRate", successRate)

      logger.debug(
        {
          processed: this.processedCount,
          failed: this.failedCount,
          successRate: successRate.toFixed(2),
        },
        "Worker heartbeat"
      )
    }, 60000) // Every 60 seconds
  }

  /**
   * Get worker statistics
   */
  getStats(): {
    processedCount: number
    failedCount: number
    successRate: number
    workerCount: number
  } {
    const successRate =
      this.processedCount > 0
        ? ((this.processedCount - this.failedCount) / this.processedCount) * 100
        : 100

    return {
      processedCount: this.processedCount,
      failedCount: this.failedCount,
      successRate,
      workerCount: this.workers.size,
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down workers...")

    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }

    // Close all workers (gracefully finish current jobs)
    const closePromises = Array.from(this.workers.entries()).map(([queueName, worker]) => {
      logger.info({ queue: queueName }, "Closing worker...")
      return worker.close()
    })

    await Promise.all(closePromises)

    this.workers.clear()

    logger.info("All workers shut down successfully")
  }
}
