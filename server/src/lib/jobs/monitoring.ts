/**
 * Job Queue Monitoring - Stats and metrics collection
 *
 * Provides:
 * - PostgreSQL stats queries for admin UI
 * - Periodic New Relic metrics collection
 * - Queue health monitoring
 */

import newrelic from "newrelic"
import { getPool } from "../db.js"
import { logger } from "../logger.js"
import { QueueName } from "./types.js"
import { queueManager } from "./queue-manager.js"

/**
 * Job run statistics from database
 */
export interface JobRunStats {
  jobType: string
  total: number
  completed: number
  failed: number
  pending: number
  successRate: number
}

/**
 * Job duration statistics
 */
export interface JobDurationStats {
  jobType: string
  avgMs: number
  medianMs: number
  p95Ms: number
  minMs: number
  maxMs: number
}

/**
 * Dead letter queue statistics
 */
export interface DeadLetterStats {
  jobType: string
  count: number
  mostRecent: Date | null
}

/**
 * Queue depth over time (for charting)
 */
export interface QueueDepthPoint {
  hour: Date
  queueName: string
  waiting: number
  active: number
}

/**
 * Get success rate by job type for last 24 hours
 */
export async function getSuccessRateByJobType(): Promise<JobRunStats[]> {
  const pool = getPool()

  const result = await pool.query<JobRunStats>(
    `
    SELECT
      job_type AS "jobType",
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      ROUND(
        (COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*), 0)) * 100,
        2
      ) as "successRate"
    FROM job_runs
    WHERE queued_at > NOW() - INTERVAL '24 hours'
    GROUP BY job_type
    ORDER BY total DESC
  `
  )

  return result.rows
}

/**
 * Get average job duration by type
 */
export async function getJobDurationStats(): Promise<JobDurationStats[]> {
  const pool = getPool()

  const result = await pool.query<JobDurationStats>(
    `
    SELECT
      job_type AS "jobType",
      ROUND(AVG(duration_ms)) as "avgMs",
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)) as "medianMs",
      ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)) as "p95Ms",
      MIN(duration_ms) as "minMs",
      MAX(duration_ms) as "maxMs"
    FROM job_runs
    WHERE
      status = 'completed'
      AND queued_at > NOW() - INTERVAL '24 hours'
      AND duration_ms IS NOT NULL
    GROUP BY job_type
    ORDER BY "avgMs" DESC
  `
  )

  return result.rows
}

/**
 * Get dead letter queue items needing review
 */
export async function getDeadLetterStats(): Promise<DeadLetterStats[]> {
  const pool = getPool()

  const result = await pool.query<DeadLetterStats>(
    `
    SELECT
      job_type AS "jobType",
      COUNT(*) as count,
      MAX(failed_at) as "mostRecent"
    FROM job_dead_letter
    WHERE reviewed = false
    GROUP BY job_type
    ORDER BY count DESC
  `
  )

  return result.rows
}

/**
 * Get queue depth over time for charting
 */
export async function getQueueDepthOverTime(hoursBack: number = 24): Promise<QueueDepthPoint[]> {
  const pool = getPool()

  const result = await pool.query<QueueDepthPoint>(
    `
    SELECT
      DATE_TRUNC('hour', queued_at) as hour,
      queue_name AS "queueName",
      COUNT(*) FILTER (WHERE status = 'pending') as waiting,
      COUNT(*) FILTER (WHERE status = 'active') as active
    FROM job_runs
    WHERE queued_at > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY hour, queue_name
    ORDER BY hour DESC
  `
  )

  return result.rows
}

/**
 * Get total counts across all queues
 */
export async function getTotalJobCounts(): Promise<{
  total: number
  pending: number
  active: number
  completed: number
  failed: number
}> {
  const pool = getPool()

  const result = await pool.query(
    `
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'active') as active,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'failed') as failed
    FROM job_runs
    WHERE queued_at > NOW() - INTERVAL '24 hours'
  `
  )

  return result.rows[0]
}

/**
 * Record periodic metrics to New Relic
 * Should be called every 30 seconds
 */
export async function recordQueueMetrics(): Promise<void> {
  try {
    // Get stats for each queue from BullMQ
    for (const queueName of Object.values(QueueName)) {
      try {
        const stats = await queueManager.getQueueStats(queueName)

        // Record queue depth metrics
        newrelic.recordMetric(`Custom/JobQueue/${queueName}/Waiting`, stats.waiting)
        newrelic.recordMetric(`Custom/JobQueue/${queueName}/Active`, stats.active)
        newrelic.recordMetric(`Custom/JobQueue/${queueName}/Completed24h`, stats.completed)
        newrelic.recordMetric(`Custom/JobQueue/${queueName}/Failed24h`, stats.failed)
        newrelic.recordMetric(`Custom/JobQueue/${queueName}/Delayed`, stats.delayed)

        // Calculate failure rate
        const total = stats.completed + stats.failed
        const failureRate = total > 0 ? (stats.failed / total) * 100 : 0
        newrelic.recordMetric(`Custom/JobQueue/${queueName}/FailureRate`, failureRate)

        logger.debug(
          {
            queue: queueName,
            waiting: stats.waiting,
            active: stats.active,
            failureRate: failureRate.toFixed(2),
          },
          "Queue metrics recorded"
        )
      } catch (error) {
        logger.error(
          {
            queue: queueName,
            error,
          },
          "Failed to record queue metrics"
        )
      }
    }

    // Get database stats
    const totalCounts = await getTotalJobCounts()

    newrelic.recordMetric("Custom/JobQueue/Total/Pending", totalCounts.pending)
    newrelic.recordMetric("Custom/JobQueue/Total/Active", totalCounts.active)
    newrelic.recordMetric("Custom/JobQueue/Total/Completed24h", totalCounts.completed)
    newrelic.recordMetric("Custom/JobQueue/Total/Failed24h", totalCounts.failed)

    // Get dead letter count
    const deadLetterStats = await getDeadLetterStats()
    const totalDeadLetter = deadLetterStats.reduce((sum, stat) => sum + stat.count, 0)

    newrelic.recordMetric("Custom/JobQueue/DeadLetter/Total", totalDeadLetter)

    logger.debug(
      {
        pending: totalCounts.pending,
        active: totalCounts.active,
        deadLetter: totalDeadLetter,
      },
      "Total queue metrics recorded"
    )
  } catch (error) {
    logger.error({ error }, "Failed to record queue metrics")
  }
}

/**
 * Start periodic metrics collection
 * Collects metrics every 30 seconds
 */
export function startPeriodicMetricsCollection(): NodeJS.Timeout {
  logger.info("Starting periodic queue metrics collection (every 30 seconds)")

  // Record metrics immediately
  recordQueueMetrics().catch((error) => {
    logger.error({ error }, "Failed to record initial queue metrics")
  })

  // Then every 30 seconds
  const interval = setInterval(() => {
    recordQueueMetrics().catch((error) => {
      logger.error({ error }, "Failed to record queue metrics")
    })
  }, 30000)

  return interval
}

/**
 * Stop periodic metrics collection
 */
export function stopPeriodicMetricsCollection(interval: NodeJS.Timeout): void {
  logger.info("Stopping periodic queue metrics collection")
  clearInterval(interval)
}
