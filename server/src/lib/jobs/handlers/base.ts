/**
 * Base Job Handler - Abstract base class for all job handlers
 *
 * All job handlers must extend this class and implement:
 * - jobType: The JobType enum value
 * - queueName: The QueueName this handler belongs to
 * - process(): Main job processing logic
 *
 * Optional overrides:
 * - rateLimit: API-specific rate limiting config
 * - validate(): Custom payload validation
 * - onCompleted(): Hook called after successful completion
 * - onFailed(): Hook called after failure
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { logger } from "../../logger.js"
import type { JobType, QueueName, JobResult } from "../types.js"

/**
 * Rate limit configuration for API calls
 */
export interface RateLimitConfig {
  max: number // Maximum number of calls
  duration: number // Per duration in milliseconds
}

/**
 * Abstract base class for job handlers
 */
export abstract class BaseJobHandler<TPayload = unknown, TResult = unknown> {
  /**
   * Job type this handler processes
   */
  abstract readonly jobType: JobType

  /**
   * Queue this handler belongs to
   */
  abstract readonly queueName: QueueName

  /**
   * Optional rate limit configuration for API calls
   * Handler should enforce this by delaying before making API requests
   */
  readonly rateLimit?: RateLimitConfig

  /**
   * Main processing logic - must be implemented by subclasses
   */
  abstract process(job: Job<TPayload>): Promise<JobResult<TResult>>

  /**
   * Validate job payload
   * Override this to add custom validation beyond Zod schema
   */
  async validate(payload: unknown): Promise<TPayload> {
    // Default implementation: assume payload is valid
    // Zod validation already happened in queue manager
    return payload as TPayload
  }

  /**
   * Hook called after successful job completion
   * Override to add custom post-processing
   */
  async onCompleted(job: Job<TPayload>, _result: JobResult<TResult>): Promise<void> {
    logger.info(
      {
        jobId: job.id,
        jobType: this.jobType,
        attemptNumber: job.attemptsMade + 1,
      },
      "Job completed successfully"
    )

    // Record New Relic custom event
    newrelic.recordCustomEvent("JobCompleted", {
      jobId: job.id ?? "unknown",
      jobType: this.jobType,
      queueName: this.queueName,
      attemptNumber: job.attemptsMade + 1,
      success: true,
      timestamp: Date.now(),
    })
  }

  /**
   * Hook called after job failure
   * Override to add custom error handling
   */
  async onFailed(job: Job<TPayload>, error: Error): Promise<void> {
    const isPermanent = job.attemptsMade >= (job.opts.attempts ?? 3)

    logger.error(
      {
        jobId: job.id,
        jobType: this.jobType,
        attemptNumber: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts ?? 3,
        error: error.message,
        stack: error.stack,
        isPermanent,
      },
      "Job failed"
    )

    // Record New Relic custom event
    newrelic.recordCustomEvent("JobFailed", {
      jobId: job.id ?? "unknown",
      jobType: this.jobType,
      queueName: this.queueName,
      attemptNumber: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts ?? 3,
      error: error.message,
      errorType: error.name,
      isPermanent,
      timestamp: Date.now(),
    })

    // Report error to New Relic
    newrelic.noticeError(error, {
      jobId: job.id ?? "unknown",
      jobType: this.jobType,
      attemptNumber: job.attemptsMade + 1,
    })
  }

  /**
   * Execute job with New Relic transaction wrapping
   * This is called by the worker - not meant to be overridden
   */
  async execute(job: Job<TPayload>): Promise<JobResult<TResult>> {
    return newrelic.startBackgroundTransaction(`JobHandler/${this.jobType}`, async () => {
      // Add custom attributes to transaction
      newrelic.addCustomAttribute("jobId", job.id ?? "unknown")
      newrelic.addCustomAttribute("jobType", this.jobType)
      newrelic.addCustomAttribute("queueName", this.queueName)
      newrelic.addCustomAttribute("attemptNumber", job.attemptsMade + 1)
      newrelic.addCustomAttribute("priority", job.opts.priority ?? 0)

      try {
        // Validate payload
        await this.validate(job.data)

        // Process job
        const result = await this.process(job)

        // Call completion hook
        await this.onCompleted(job, result)

        return result
      } catch (error) {
        // Call failure hook
        await this.onFailed(job, error as Error)

        // Re-throw error for BullMQ to handle retries
        throw error
      }
    })
  }

  /**
   * Helper: Delay execution to enforce rate limits
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Helper: Create a child logger with job context
   */
  protected createLogger(job: Job<TPayload>) {
    return logger.child({
      jobId: job.id,
      jobType: this.jobType,
      queueName: this.queueName,
      attemptNumber: job.attemptsMade + 1,
    })
  }
}
