/**
 * CALCULATE_ACTOR_OBSCURITY Handler
 *
 * Calculates the is_obscure flag for specified actors based on their
 * movie and TV appearances. Used after TMDB sync detects new deaths.
 *
 * See actor-obscurity.ts for the shared obscurity thresholds and criteria.
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import {
  JobType,
  QueueName,
  type JobResult,
  type CalculateActorObscurityPayload,
} from "../types.js"
import { queueManager } from "../queue-manager.js"
import { recalculateActorObscurity } from "../../actor-obscurity.js"

/**
 * Result from obscurity calculation
 */
export interface CalculateActorObscurityResult {
  processed: number
  changedToVisible: number
  changedToObscure: number
  unchanged: number
  errors: string[]
}

/**
 * Handler for calculating actor obscurity
 */
export class CalculateActorObscurityHandler extends BaseJobHandler<
  CalculateActorObscurityPayload,
  CalculateActorObscurityResult
> {
  readonly jobType = JobType.CALCULATE_ACTOR_OBSCURITY
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the obscurity calculation job
   */
  async process(
    job: Job<CalculateActorObscurityPayload>
  ): Promise<JobResult<CalculateActorObscurityResult>> {
    const log = this.createLogger(job)
    const { actorIds, rebuildCachesOnComplete } = job.data

    log.info({ actorCount: actorIds.length }, "Starting actor obscurity calculation")

    const errors: string[] = []

    let changedToVisible = 0
    let changedToObscure = 0
    let unchanged = 0

    try {
      const results = await recalculateActorObscurity(actorIds)

      // Results only contain actors whose obscurity status changed
      for (const row of results) {
        if (row.newObscure) {
          changedToObscure++
          log.info({ actorId: row.id, name: row.name }, "Actor changed to obscure")
        } else {
          changedToVisible++
          log.info({ actorId: row.id, name: row.name }, "Actor changed to visible")
        }
      }
      unchanged = actorIds.length - results.length

      // Record metrics
      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/Processed", actorIds.length)
      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/ChangedToVisible", changedToVisible)
      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/ChangedToObscure", changedToObscure)

      log.info(
        {
          processed: actorIds.length,
          changedToVisible,
          changedToObscure,
          unchanged,
        },
        "Actor obscurity calculation completed"
      )

      // Queue cache rebuild if requested and there were changes
      if (rebuildCachesOnComplete && (changedToVisible > 0 || changedToObscure > 0)) {
        log.info("Queueing death cache rebuild job")
        await queueManager.addJob(
          JobType.REBUILD_DEATH_CACHES,
          {},
          {
            createdBy: "calculate-actor-obscurity",
          }
        )
      }

      return {
        success: true,
        data: {
          processed: actorIds.length,
          changedToVisible,
          changedToObscure,
          unchanged,
          errors,
        },
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      log.error({ error: errorMsg }, "Error calculating actor obscurity")
      errors.push(errorMsg)

      newrelic.recordMetric("Custom/JobHandler/ActorObscurity/Error", 1)

      return {
        success: false,
        error: errorMsg,
        data: {
          processed: 0,
          changedToVisible,
          changedToObscure,
          unchanged,
          errors,
        },
      }
    }
  }
}
