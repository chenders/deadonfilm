/**
 * Cause of Death Enrichment Handler
 *
 * BullMQ job handler for enriching cause of death information for a single actor.
 * Uses the getCauseOfDeath function which tries Claude first, then falls back
 * to Wikidata/Wikipedia.
 */

import type { Job } from "bullmq"
import { getPool } from "../../db.js"
import { invalidateActorCache } from "../../cache.js"
import { getCauseOfDeath } from "../../wikidata.js"
import type { ClaudeModel } from "../../claude.js"
import { updateDeathInfoByActorId } from "../../db/actors.js"
import { normalizeDateToString } from "../../claude-batch/date-utils.js"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type EnrichCauseOfDeathPayload } from "../types.js"

/**
 * Result returned from cause of death enrichment
 */
export interface CauseOfDeathEnrichmentResult {
  actorId: number
  actorName: string
  enriched: boolean
  causeOfDeath?: string
  causeOfDeathSource?: string
  causeOfDeathDetails?: string
  causeOfDeathDetailsSource?: string
  wikipediaUrl?: string
}

/**
 * Actor row from database query
 */
interface ActorRow {
  id: number
  name: string
  birthday: Date | string | null
  deathday: Date | string | null
  cause_of_death: string | null
  cause_of_death_source: string | null
  cause_of_death_details: string | null
  cause_of_death_details_source: string | null
  wikipedia_url: string | null
}

/**
 * Handler for cause of death enrichment jobs
 */
export class EnrichCauseOfDeathHandler extends BaseJobHandler<
  EnrichCauseOfDeathPayload,
  CauseOfDeathEnrichmentResult
> {
  readonly jobType = JobType.ENRICH_CAUSE_OF_DEATH
  readonly queueName = QueueName.ENRICHMENT

  /**
   * Process the cause of death enrichment job for a single actor
   */
  async process(
    job: Job<EnrichCauseOfDeathPayload>
  ): Promise<JobResult<CauseOfDeathEnrichmentResult>> {
    const log = this.createLogger(job)
    const { actorId, actorName, deathDate } = job.data

    log.info({ actorId, actorName }, "Starting cause of death enrichment")

    const db = getPool()

    // 1. Fetch actor from database
    const actor = await this.fetchActor(db, actorId)

    if (!actor) {
      log.warn({ actorId }, "Actor not found in database")
      return {
        success: false,
        error: `Actor with ID ${actorId} not found`,
        metadata: { isPermanent: true },
      }
    }

    // 2. Validate and use death date (payload override or from database)
    let actorDeathday = normalizeDateToString(actor.deathday)

    if (deathDate) {
      // Validate deathDate format (YYYY-MM-DD) and that it parses to a valid date
      const deathDateRegex = /^\d{4}-\d{2}-\d{2}$/
      const isFormatValid = deathDateRegex.test(deathDate)
      const parsedDeathDate = new Date(deathDate)
      const isDateValid = !Number.isNaN(parsedDeathDate.getTime())

      if (!isFormatValid || !isDateValid) {
        log.warn(
          { actorId, actorName: actor.name, deathDate },
          "Invalid deathDate provided in job payload"
        )
        return {
          success: false,
          error: `Invalid deathDate format for actor ${actor.name} (ID: ${actorId}); expected YYYY-MM-DD`,
          metadata: { isPermanent: true },
        }
      }

      actorDeathday = deathDate
    }

    if (!actorDeathday) {
      log.warn({ actorId, actorName: actor.name }, "Actor is not deceased")
      return {
        success: false,
        error: `Actor ${actor.name} (ID: ${actorId}) is not deceased`,
        metadata: { isPermanent: true },
      }
    }

    // 3. Check if actor already has cause of death (always skip existing - no force refresh support)
    if (actor.cause_of_death) {
      log.info(
        { actorId, actorName: actor.name, existingCause: actor.cause_of_death },
        "Actor already has cause of death, skipping"
      )
      return {
        success: true,
        data: {
          actorId,
          actorName: actor.name,
          enriched: false,
          causeOfDeath: actor.cause_of_death,
          causeOfDeathSource: actor.cause_of_death_source ?? undefined,
          causeOfDeathDetails: actor.cause_of_death_details ?? undefined,
          causeOfDeathDetailsSource: actor.cause_of_death_details_source ?? undefined,
          wikipediaUrl: actor.wikipedia_url ?? undefined,
        },
        metadata: { skipped: true, reason: "already_has_cause_of_death" },
      }
    }

    // 4. Get cause of death from Claude/Wikidata
    const birthday = normalizeDateToString(actor.birthday)
    const model: ClaudeModel = "sonnet" // Use sonnet for good balance of speed/quality

    try {
      log.info({ actorId, actorName: actor.name }, "Fetching cause of death")

      const result = await getCauseOfDeath(actor.name, birthday, actorDeathday, model)

      // 5. Check if we got any useful data
      if (!result.causeOfDeath) {
        log.info({ actorId, actorName: actor.name }, "No cause of death found")
        return {
          success: true,
          data: {
            actorId,
            actorName: actor.name,
            enriched: false,
          },
          metadata: { noDataFound: true },
        }
      }

      // 6. Update actor in database
      await updateDeathInfoByActorId(
        actorId,
        result.causeOfDeath,
        result.causeOfDeathSource,
        result.causeOfDeathDetails,
        result.causeOfDeathDetailsSource,
        result.wikipediaUrl
      )
      log.info(
        { actorId, actorName: actor.name, cause: result.causeOfDeath },
        "Updated actor cause of death"
      )

      // 7. Invalidate actor cache
      await invalidateActorCache(actorId)
      log.info({ actorId }, "Invalidated actor cache")

      // 8. Return success result
      return {
        success: true,
        data: {
          actorId,
          actorName: actor.name,
          enriched: true,
          causeOfDeath: result.causeOfDeath ?? undefined,
          causeOfDeathSource: result.causeOfDeathSource ?? undefined,
          causeOfDeathDetails: result.causeOfDeathDetails ?? undefined,
          causeOfDeathDetailsSource: result.causeOfDeathDetailsSource ?? undefined,
          wikipediaUrl: result.wikipediaUrl ?? undefined,
        },
      }
    } catch (error) {
      // Let transient errors (network, API) bubble up for retry
      log.error({ actorId, actorName: actor.name, error }, "Cause of death enrichment failed")
      throw error
    }
  }

  /**
   * Fetch actor from database
   */
  private async fetchActor(
    db: ReturnType<typeof getPool>,
    actorId: number
  ): Promise<ActorRow | null> {
    const result = await db.query<ActorRow>(
      `SELECT
        id, name, birthday, deathday,
        cause_of_death, cause_of_death_source, cause_of_death_details,
        cause_of_death_details_source, wikipedia_url
      FROM actors
      WHERE id = $1`,
      [actorId]
    )

    return result.rows[0] ?? null
  }
}
