/**
 * Single Actor Death Details Enrichment Handler
 *
 * BullMQ job handler for enriching death information for a single actor.
 * Uses the DeathEnrichmentOrchestrator directly for simpler processing
 * compared to the batch handler.
 */

import type { Job } from "bullmq"
import type { Pool } from "pg"
import { getPool } from "../../db.js"
import { invalidateActorCache } from "../../cache.js"
import {
  DeathEnrichmentOrchestrator,
  type ActorForEnrichment,
  type EnrichmentConfig,
} from "../../death-sources/index.js"
import {
  writeToProduction,
  type EnrichmentData,
  type DeathCircumstancesData,
} from "../../enrichment-db-writer.js"
import {
  MIN_CIRCUMSTANCES_LENGTH,
  MIN_RUMORED_CIRCUMSTANCES_LENGTH,
} from "../../claude-batch/index.js"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type EnrichDeathDetailsPayload } from "../types.js"

/**
 * Result returned from enrichment
 */
export interface SingleActorEnrichmentResult {
  actorId: number
  actorName: string
  enriched: boolean
  circumstances?: string
  notableFactors?: string[]
  sources?: object
  costUsd: number
}

/**
 * Actor row from database query
 */
interface ActorRow {
  id: number
  tmdb_id: number | null
  imdb_person_id: string | null
  name: string
  birthday: Date | string | null
  deathday: Date | string | null
  cause_of_death: string | null
  cause_of_death_details: string | null
  popularity: number | null
  circumstances: string | null
  notable_factors: string[] | null
}

/**
 * Handler for single actor death details enrichment jobs
 */
export class EnrichDeathDetailsHandler extends BaseJobHandler<
  EnrichDeathDetailsPayload,
  SingleActorEnrichmentResult
> {
  readonly jobType = JobType.ENRICH_DEATH_DETAILS
  readonly queueName = QueueName.ENRICHMENT

  /**
   * Process the enrichment job for a single actor
   */
  async process(
    job: Job<EnrichDeathDetailsPayload>
  ): Promise<JobResult<SingleActorEnrichmentResult>> {
    const log = this.createLogger(job)
    const { actorId, actorName, forceRefresh } = job.data

    log.info({ actorId, actorName, forceRefresh }, "Starting single actor enrichment")

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

    // 2. Verify actor is deceased
    if (!actor.deathday) {
      log.warn({ actorId, actorName: actor.name }, "Actor is not deceased")
      return {
        success: false,
        error: `Actor ${actor.name} (ID: ${actorId}) is not deceased`,
        metadata: { isPermanent: true },
      }
    }

    // 3. Check if actor already has enrichment data (unless forceRefresh)
    if (!forceRefresh && actor.circumstances) {
      log.info({ actorId, actorName: actor.name }, "Actor already has enrichment data, skipping")
      return {
        success: true,
        data: {
          actorId,
          actorName: actor.name,
          enriched: false,
          circumstances: actor.circumstances,
          notableFactors: actor.notable_factors ?? undefined,
          costUsd: 0,
        },
        metadata: { skipped: true, reason: "already_enriched" },
      }
    }

    // 4. Convert to ActorForEnrichment format
    const actorForEnrichment: ActorForEnrichment = {
      id: actor.id,
      tmdbId: actor.tmdb_id,
      imdbPersonId: actor.imdb_person_id ?? null,
      name: actor.name,
      birthday: this.normalizeDateToString(actor.birthday),
      deathday: this.normalizeDateToString(actor.deathday) || "",
      causeOfDeath: actor.cause_of_death,
      causeOfDeathDetails: actor.cause_of_death_details,
      popularity: actor.popularity,
    }

    // 5. Configure and run orchestrator
    const config: Partial<EnrichmentConfig> = {
      sourceCategories: { free: true, paid: true, ai: false },
      confidenceThreshold: 0.5,
      claudeCleanup: {
        enabled: true,
        model: "claude-opus-4-5-20251101",
        gatherAllSources: true,
      },
    }

    // Disable status bar for job processing (no terminal output)
    const orchestrator = new DeathEnrichmentOrchestrator(config, false)

    try {
      const enrichment = await orchestrator.enrichActor(actorForEnrichment)
      const stats = orchestrator.getStats()

      // 6. Check if we got any useful data
      if (
        !enrichment.circumstances &&
        !enrichment.notableFactors?.length &&
        !enrichment.cleanedDeathInfo
      ) {
        log.info({ actorId, actorName: actor.name }, "No enrichment data found")
        return {
          success: true,
          data: {
            actorId,
            actorName: actor.name,
            enriched: false,
            costUsd: stats.totalCostUsd,
          },
          metadata: { noDataFound: true },
        }
      }

      // 7. Process results (extract from cleanedDeathInfo or raw result)
      const cleaned = enrichment.cleanedDeathInfo
      const circumstances = cleaned?.circumstances || enrichment.circumstances
      const rumoredCircumstances = cleaned?.rumoredCircumstances || enrichment.rumoredCircumstances
      const locationOfDeath = cleaned?.locationOfDeath || enrichment.locationOfDeath
      const notableFactors = cleaned?.notableFactors || enrichment.notableFactors
      const additionalContext = cleaned?.additionalContext || enrichment.additionalContext
      const relatedDeaths = cleaned?.relatedDeaths || enrichment.relatedDeaths || null

      const causeConfidence = cleaned?.causeConfidence || null
      const detailsConfidence = cleaned?.detailsConfidence || null
      const birthdayConfidence = cleaned?.birthdayConfidence || null
      const deathdayConfidence = cleaned?.deathdayConfidence || null
      const lastProject = cleaned?.lastProject || enrichment.lastProject || null
      const careerStatusAtDeath =
        cleaned?.careerStatusAtDeath || enrichment.careerStatusAtDeath || null
      const posthumousReleases =
        cleaned?.posthumousReleases || enrichment.posthumousReleases || null
      const relatedCelebrities =
        cleaned?.relatedCelebrities || enrichment.relatedCelebrities || null

      // Look up related_celebrity_ids from actors table
      let relatedCelebrityIds: number[] | null = null
      if (relatedCelebrities && relatedCelebrities.length > 0) {
        const names = relatedCelebrities.map((c) => c.name)
        const idResult = await db.query<{ id: number }>(
          `SELECT id FROM actors WHERE name = ANY($1)`,
          [names]
        )
        if (idResult.rows.length > 0) {
          relatedCelebrityIds = idResult.rows.map((r) => r.id)
        }
      }

      // Determine confidence level
      const circumstancesConfidence =
        cleaned?.circumstancesConfidence ||
        (enrichment.circumstancesSource?.confidence
          ? enrichment.circumstancesSource.confidence >= 0.7
            ? "high"
            : enrichment.circumstancesSource.confidence >= 0.4
              ? "medium"
              : "low"
          : null)

      // Determine if we have substantive death info
      // Quality gate: if Claude cleanup ran, require hasSubstantiveContent === true
      // If Claude cleanup was skipped (cleaned is undefined), rely on content length checks only
      const hasSubstantiveCircumstances =
        circumstances && circumstances.length > MIN_CIRCUMSTANCES_LENGTH
      const hasSubstantiveRumors =
        rumoredCircumstances && rumoredCircumstances.length > MIN_RUMORED_CIRCUMSTANCES_LENGTH
      const hasRelatedDeaths = relatedDeaths && relatedDeaths.length > 50
      const passesQualityGate = cleaned === undefined || cleaned.hasSubstantiveContent === true
      const hasDetailedDeathInfo =
        passesQualityGate &&
        (hasSubstantiveCircumstances || hasSubstantiveRumors || hasRelatedDeaths)

      // 8. Build data objects for database write
      const enrichmentData: EnrichmentData = {
        actorId,
        hasDetailedDeathInfo: hasDetailedDeathInfo || false,
        deathManner: cleaned?.manner || null,
        deathCategories: cleaned?.categories || null,
      }

      const circumstancesData: DeathCircumstancesData = {
        actorId,
        circumstances,
        circumstancesConfidence,
        rumoredCircumstances,
        causeConfidence,
        detailsConfidence,
        birthdayConfidence,
        deathdayConfidence,
        locationOfDeath,
        lastProject,
        careerStatusAtDeath,
        posthumousReleases,
        relatedCelebrityIds,
        relatedCelebrities,
        notableFactors,
        additionalContext,
        relatedDeaths,
        sources: {
          circumstances: enrichment.circumstancesSource,
          rumoredCircumstances: enrichment.rumoredCircumstancesSource,
          notableFactors: enrichment.notableFactorsSource,
          locationOfDeath: enrichment.locationOfDeathSource,
          additionalContext: enrichment.additionalContextSource,
          lastProject: enrichment.lastProjectSource,
          careerStatusAtDeath: enrichment.careerStatusAtDeathSource,
          posthumousReleases: enrichment.posthumousReleasesSource,
          relatedCelebrities: enrichment.relatedCelebritiesSource,
          cleanupSource: cleaned ? "claude-opus-4.5" : null,
        },
        rawResponse: enrichment.rawSources
          ? {
              rawSources: enrichment.rawSources,
              gatheredAt: new Date().toISOString(),
            }
          : null,
        enrichmentSource: "single-actor-enrichment",
        enrichmentVersion: "3.0.0",
      }

      // 9. Write to production
      await writeToProduction(db, enrichmentData, circumstancesData)
      log.info({ actorId, actorName: actor.name }, "Wrote enrichment data to production")

      // 10. Invalidate actor cache
      await invalidateActorCache(actorId)
      log.info({ actorId }, "Invalidated actor cache")

      // 11. Return success result
      return {
        success: true,
        data: {
          actorId,
          actorName: actor.name,
          enriched: true,
          circumstances: circumstances ?? undefined,
          notableFactors: notableFactors ?? undefined,
          sources: circumstancesData.sources,
          costUsd: stats.totalCostUsd,
        },
      }
    } catch (error) {
      // Let transient errors (network, API) bubble up for retry
      log.error({ actorId, actorName: actor.name, error }, "Enrichment failed")
      throw error
    }
  }

  /**
   * Fetch actor from database with existing enrichment data
   */
  private async fetchActor(db: Pool, actorId: number): Promise<ActorRow | null> {
    const result = await db.query<ActorRow>(
      `SELECT
        a.id, a.tmdb_id, a.imdb_person_id, a.name, a.birthday, a.deathday,
        a.cause_of_death, a.cause_of_death_details, a.tmdb_popularity AS popularity,
        c.circumstances, c.notable_factors
      FROM actors a
      LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
      WHERE a.id = $1`,
      [actorId]
    )

    return result.rows[0] ?? null
  }

  /**
   * Normalize Date or string to ISO date string
   */
  private normalizeDateToString(date: Date | string | null): string | null {
    if (!date) return null
    if (date instanceof Date) {
      return date.toISOString().split("T")[0]
    }
    // Already a string - just return the date part
    return date.split("T")[0]
  }
}
