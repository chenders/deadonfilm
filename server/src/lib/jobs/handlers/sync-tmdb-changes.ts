/**
 * SYNC_TMDB_CHANGES Orchestrator Handler
 *
 * Queues three sub-jobs to handle the actual sync work:
 * 1. SYNC_TMDB_MOVIES - Sync movie changes (may add new actors)
 * 2. SYNC_TMDB_SHOWS - Sync active TV show episodes (may add new actors)
 * 3. SYNC_TMDB_PEOPLE - Sync people changes (runs LAST - checks all actors including newly added)
 *
 * The MAINTENANCE queue has concurrency 1, so jobs process serially in queue order.
 */

import type { Job } from "bullmq"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type SyncTMDBChangesPayload } from "../types.js"
import { queueManager } from "../queue-manager.js"

/**
 * Result returned from the orchestrator
 */
export interface SyncTMDBChangesResult {
  queuedJobs: {
    movies: string
    shows: string
    people: string
  }
  dateRange: {
    startDate: string
    endDate: string
  }
}

/**
 * Orchestrator handler that queues sub-jobs for TMDB sync
 */
export class SyncTMDBChangesHandler extends BaseJobHandler<
  SyncTMDBChangesPayload,
  SyncTMDBChangesResult
> {
  readonly jobType = JobType.SYNC_TMDB_CHANGES
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the orchestrator job - queue sub-jobs in order
   */
  async process(job: Job<SyncTMDBChangesPayload>): Promise<JobResult<SyncTMDBChangesResult>> {
    const log = this.createLogger(job)
    const { startDate, endDate } = this.getDateRange(job.data)

    log.info({ startDate, endDate }, "Starting TMDB sync orchestration")

    // Queue sub-jobs in order: movies, shows, then people
    // People runs LAST because movies/shows may add new actors
    // MAINTENANCE queue has concurrency 1, so they process serially

    // 1. Movies sync (may add new actors from cast)
    const moviesJobId = await queueManager.addJob(
      JobType.SYNC_TMDB_MOVIES,
      { startDate, endDate },
      { createdBy: `sync-tmdb-changes:${job.id}` }
    )
    log.info({ moviesJobId }, "Queued SYNC_TMDB_MOVIES job")

    // 2. Shows sync (may add new actors from cast)
    const showsJobId = await queueManager.addJob(
      JobType.SYNC_TMDB_SHOWS,
      {},
      { createdBy: `sync-tmdb-changes:${job.id}` }
    )
    log.info({ showsJobId }, "Queued SYNC_TMDB_SHOWS job")

    // 3. People sync runs LAST - checks all actors including newly added
    const peopleJobId = await queueManager.addJob(
      JobType.SYNC_TMDB_PEOPLE,
      { startDate, endDate },
      { createdBy: `sync-tmdb-changes:${job.id}` }
    )
    log.info({ peopleJobId }, "Queued SYNC_TMDB_PEOPLE job")

    return {
      success: true,
      data: {
        queuedJobs: {
          movies: moviesJobId,
          shows: showsJobId,
          people: peopleJobId,
        },
        dateRange: { startDate, endDate },
      },
    }
  }

  /**
   * Calculate date range from payload or defaults
   */
  private getDateRange(data: SyncTMDBChangesPayload): {
    startDate: string
    endDate: string
  } {
    const today = new Date()
    const endDate = data.endDate || this.formatDate(today)

    // Default to yesterday if startDate not provided
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const startDate = data.startDate || this.formatDate(yesterday)

    return { startDate, endDate }
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0]
  }
}
