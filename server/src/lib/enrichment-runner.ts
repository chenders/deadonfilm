/**
 * Death Enrichment Runner Library
 *
 * Core DEATH enrichment loop extracted from enrich-death-details.ts for use
 * by both the CLI script and BullMQ job handler.
 *
 * This module provides:
 * - EnrichmentRunner class for processing actors
 * - Progress callbacks for real-time updates
 * - AbortSignal support for graceful cancellation
 */

import { getPool, getDeceasedActorsFromTopMovies } from "./db.js"
import { batchGetPersonDetails } from "./tmdb.js"
import { rebuildDeathCaches } from "./cache.js"
import {
  CostLimitExceededError,
  setIgnoreCache,
  type ActorForEnrichment,
} from "./death-sources/index.js"
import { cleanupWithClaude, isViolentDeath } from "./death-sources/claude-cleanup.js"
import { createDebriefOrchestrator } from "./death-sources/debriefer/adapter.js"
import type { DebrieferAdapterResult } from "./death-sources/debriefer/adapter.js"
import {
  normalizeDateToString,
  MIN_CIRCUMSTANCES_LENGTH,
  MIN_RUMORED_CIRCUMSTANCES_LENGTH,
} from "./claude-batch/index.js"
import {
  writeToProduction,
  writeToStaging,
  type EnrichmentData,
  type DeathCircumstancesData,
} from "./enrichment-db-writer.js"
import { linkMultipleFields, hasEntityLinks } from "./entity-linker/index.js"
import { logger } from "./logger.js"
import { DEATH_ENRICHMENT_VERSION } from "./enrichment-version.js"
import { ParallelBatchRunner, BatchCostTracker } from "./shared/concurrency.js"

/**
 * Configuration for an enrichment run
 */
export interface EnrichmentRunnerConfig {
  limit?: number
  minPopularity?: number
  recentOnly?: boolean
  actorIds?: number[]
  tmdbIds?: number[]
  free?: boolean
  paid?: boolean
  ai?: boolean
  confidence?: number
  maxCostPerActor?: number
  maxTotalCost?: number
  claudeCleanup?: boolean
  gatherAllSources?: boolean
  followLinks?: boolean
  aiLinkSelection?: boolean
  aiContentExtraction?: boolean
  aiModel?: string
  maxLinks?: number
  maxLinkCost?: number
  topBilledYear?: number
  maxBilling?: number
  topMovies?: number
  usActorsOnly?: boolean
  sortBy?: "popularity" | "interestingness"
  ignoreCache?: boolean
  runId?: number
  staging?: boolean
  // Source reliability threshold
  useReliabilityThreshold?: boolean
  /** Number of actors to process concurrently (default: 5) */
  concurrency?: number
}

/**
 * Progress information during enrichment.
 *
 * `phase` indicates whether this is a lightweight "processing" update (actor just
 * started, only name/index changed) or a full "completed" update (counts updated
 * after an actor finished). Handlers can use this to skip heavy DB writes on the
 * pre-enrichment update.
 */
export interface EnrichmentProgress {
  /** @deprecated Use actorsCompleted — kept for backward compat with batch handlers */
  currentActorIndex: number
  /** @deprecated Summary text — kept for backward compat with batch handlers */
  currentActorName: string
  actorsInFlight: number
  actorsCompleted: number
  actorsQueried: number
  actorsProcessed: number
  actorsEnriched: number
  actorsWithDeathPage: number
  totalCostUsd: number
  /** "processing" = batch still running; "completed" = an actor just finished */
  phase: "processing" | "completed"
}

/**
 * Final statistics after enrichment completes
 */
export interface EnrichmentStats {
  actorsProcessed: number
  actorsEnriched: number
  fillRate: number
  totalCostUsd: number
  totalTimeMs: number
  costBySource: Record<string, number>
  exitReason: "completed" | "cost_limit" | "interrupted"
  updatedActors: Array<{ name: string; id: number }>
  /** Source hit rates: maps source type to {attempts, successes} */
  sourceHitRates?: Record<string, { attempts: number; successes: number }>
  /** List of unique source types that were attempted across all actors */
  uniqueSourcesAttempted?: string[]
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
  deathday: Date | string
  cause_of_death: string | null
  cause_of_death_details: string | null
  tmdb_popularity: number | null
  dof_popularity: number | null
  circumstances: string | null
  notable_factors: string[] | null
  movie_title?: string
}

/**
 * EnrichmentRunner - Core enrichment processing logic
 *
 * Usage:
 * ```typescript
 * const runner = new EnrichmentRunner(
 *   config,
 *   async (progress) => {
 *     // Update UI or database with progress
 *   },
 *   abortSignal
 * )
 * const stats = await runner.run()
 * ```
 */
export class EnrichmentRunner {
  private config: EnrichmentRunnerConfig
  private onProgress?: (progress: EnrichmentProgress) => Promise<void>
  private abortSignal?: AbortSignal
  private log = logger.child({ module: "EnrichmentRunner" })

  constructor(
    config: EnrichmentRunnerConfig,
    onProgress?: (progress: EnrichmentProgress) => Promise<void>,
    abortSignal?: AbortSignal
  ) {
    this.config = config
    this.onProgress = onProgress
    this.abortSignal = abortSignal
  }

  /**
   * Check if we should stop processing
   */
  private shouldStop(): boolean {
    return this.abortSignal?.aborted ?? false
  }

  /**
   * Run the enrichment process
   */
  async run(): Promise<EnrichmentStats> {
    const startTime = Date.now()
    const {
      limit = 100,
      minPopularity = 0,
      recentOnly = false,
      actorIds,
      tmdbIds,
      free = true,
      paid = true,
      ai = false,
      confidence: confidenceThreshold = 0.5,
      maxCostPerActor,
      maxTotalCost = 10,
      claudeCleanup = true,
      // Top-billed actor selection options used by queryTopBilledActors
      topBilledYear,
      maxBilling,
      topMovies,
      usActorsOnly = false,
      sortBy = "popularity" as const,
      ignoreCache = false,
      runId,
      staging = false,
      // Source reliability threshold
      useReliabilityThreshold = true,
    } = this.config

    // Configure cache behavior for this run
    // Use try/finally to ensure cache is always reset, even if exceptions are thrown
    setIgnoreCache(ignoreCache)
    if (ignoreCache) {
      this.log.info("Cache disabled - all requests will be made fresh")
    }

    try {
      const db = getPool()
      let actors: ActorRow[]

      // Query actors based on configuration
      if (topBilledYear) {
        actors = await this.queryTopBilledActors(
          topBilledYear,
          maxBilling ?? 5,
          topMovies ?? 20,
          limit
        )
      } else if (actorIds && actorIds.length > 0) {
        actors = await this.queryActorsByInternalId(actorIds)
      } else if (tmdbIds && tmdbIds.length > 0) {
        actors = await this.queryActorsByTmdbId(tmdbIds)
      } else {
        actors = await this.queryActorsWithMissingCircumstances(
          limit,
          minPopularity,
          recentOnly,
          usActorsOnly,
          sortBy
        )
      }

      // Report initial progress
      if (this.onProgress) {
        await this.onProgress({
          currentActorIndex: 0,
          currentActorName: "",
          actorsInFlight: 0,
          actorsCompleted: 0,
          actorsQueried: actors.length,
          actorsProcessed: 0,
          actorsEnriched: 0,
          actorsWithDeathPage: 0,
          totalCostUsd: 0,
          phase: "completed",
        })
      }

      if (actors.length === 0) {
        this.log.info("No actors to enrich")
        return {
          actorsProcessed: 0,
          actorsEnriched: 0,
          fillRate: 0,
          totalCostUsd: 0,
          totalTimeMs: Date.now() - startTime,
          costBySource: {},
          exitReason: "completed",
          updatedActors: [],
        }
      }

      this.log.info({ actorCount: actors.length }, "Starting enrichment")

      // Check if we should stop before starting
      if (this.shouldStop()) {
        this.log.info("Enrichment stopped before starting (abort signal)")
        return {
          actorsProcessed: 0,
          actorsEnriched: 0,
          fillRate: 0,
          totalCostUsd: 0,
          totalTimeMs: Date.now() - startTime,
          costBySource: {},
          exitReason: "interrupted",
          updatedActors: [],
        }
      }

      // Configure the debriefer adapter and create orchestrator once for the batch
      const debrieferConfig = {
        free,
        paid,
        ai,
        books: true,
        maxCostPerActor,
        maxTotalCost,
        earlyStopThreshold: 3,
        confidenceThreshold,
        reliabilityThreshold: useReliabilityThreshold ? 0.6 : undefined,
      }
      const processActorWithDebriefer = createDebriefOrchestrator(debrieferConfig)

      // Track batch-level stats
      let batchActorsProcessed = 0
      let batchActorsEnriched = 0
      const costBySource: Record<string, number> = {}

      // Convert to ActorForEnrichment format
      const actorsToEnrich: ActorForEnrichment[] = actors.map((a) => ({
        id: a.id,
        tmdbId: a.tmdb_id,
        imdbPersonId: a.imdb_person_id ?? null,
        name: a.name,
        birthday: normalizeDateToString(a.birthday),
        deathday: normalizeDateToString(a.deathday) || "",
        causeOfDeath: a.cause_of_death,
        causeOfDeathDetails: a.cause_of_death_details,
        popularity: a.dof_popularity ?? a.tmdb_popularity,
      }))

      // Process actors in parallel — enrich and write to DB inline
      // so that enrichment_run_actors rows appear immediately for live UI updates
      let costLimitReached = false
      const updatedActors: Array<{ name: string; id: number }> = []
      let updated = 0
      let deathPageCount = 0

      // Track source hit rates: {source: {attempts: n, successes: n}}
      const sourceHitRates: Record<string, { attempts: number; successes: number }> = {}

      // Create cost tracker for batch-level limits
      const costTracker = new BatchCostTracker(maxTotalCost)

      // Define per-actor processor
      const processActor = async (actor: ActorForEnrichment): Promise<{ costUsd: number }> => {
        batchActorsProcessed++

        let debriefResult: DebrieferAdapterResult
        try {
          debriefResult = await processActorWithDebriefer(actor)
        } catch (error) {
          // Note: debriefer's orchestrator handles cost limits internally by stopping
          // rather than throwing, so this catch is currently unreachable. Kept as
          // defensive code in case future debriefer versions change this behavior.
          if (error instanceof CostLimitExceededError) {
            this.log.warn(
              { actorName: actor.name, limit: error.limit, currentCost: error.currentCost },
              "Cost limit reached during actor enrichment"
            )
            costLimitReached = true
            // Return 0: actual costs were already tracked by the orchestrator's per-source
            // accounting. error.currentCost is the orchestrator's running batch total,
            // not the per-actor cost, so returning it would inflate the BatchCostTracker.
            return { costUsd: 0 }
          }
          // Log the error and record a failed actor row rather than re-throwing,
          // because Promise.allSettled would silently swallow the rejection.
          this.log.error(
            { actorId: actor.id, actorName: actor.name, err: error },
            "Actor enrichment failed"
          )
          if (runId) {
            await db
              .query(
                `INSERT INTO enrichment_run_actors (
                  run_id, actor_id, was_enriched, created_death_page,
                  sources_attempted, cost_usd, log_entries
                ) VALUES ($1, $2, false, false, '[]'::jsonb, 0, $3)
                ON CONFLICT (run_id, actor_id) DO NOTHING`,
                [
                  runId,
                  actor.id,
                  JSON.stringify([
                    {
                      timestamp: new Date().toISOString(),
                      level: "error",
                      message:
                        error instanceof Error ? error.message : "Unknown error during enrichment",
                    },
                  ]),
                ]
              )
              .catch((dbErr) =>
                this.log.error({ actorId: actor.id, err: dbErr }, "Failed to record error row")
              )
          }
          return { costUsd: 0 }
        }

        // Aggregate source hit rates — deduplicate by sourceType per actor.
        // Track successful source types from raw sources, and use the delta
        // between sourcesAttempted and sourcesSucceeded to account for failures.
        const successfulTypes = new Set(debriefResult.rawSources.map((rs) => rs.sourceType))
        for (const sourceType of successfulTypes) {
          if (!sourceHitRates[sourceType]) {
            sourceHitRates[sourceType] = { attempts: 0, successes: 0 }
          }
          sourceHitRates[sourceType].attempts++
          sourceHitRates[sourceType].successes++
        }
        // Track failed attempts as a single "_failed_sources" bucket since we
        // don't know which individual source types failed (debriefer only reports counts)
        const failedCount = debriefResult.sourcesAttempted - debriefResult.sourcesSucceeded
        if (failedCount > 0) {
          if (!sourceHitRates["_failed_sources"]) {
            sourceHitRates["_failed_sources"] = { attempts: 0, successes: 0 }
          }
          sourceHitRates["_failed_sources"].attempts += failedCount
        }

        // Run Claude cleanup if enabled and we have raw sources
        let cleaned: import("./death-sources/types.js").CleanedDeathInfo | undefined
        let cleanupCostUsd = 0
        if (claudeCleanup && debriefResult.rawSources.length > 0) {
          try {
            const cleanupResult = await cleanupWithClaude(actor, debriefResult.rawSources)
            cleaned = cleanupResult.cleaned
            cleanupCostUsd = cleanupResult.costUsd
          } catch (error) {
            this.log.error(
              { actorId: actor.id, actorName: actor.name, err: error },
              "Claude cleanup failed"
            )
          }
        }

        const totalActorCost = debriefResult.totalCostUsd + cleanupCostUsd

        // Compute per-actor cost attribution by source type using actual per-source costs
        const actorCostBySource: Record<string, number> = {}
        for (const rs of debriefResult.rawSources) {
          if (rs.costUsd && rs.costUsd > 0) {
            actorCostBySource[rs.sourceType] = (actorCostBySource[rs.sourceType] ?? 0) + rs.costUsd
          }
        }

        // Accumulate into batch-level costBySource for final summary
        if (cleanupCostUsd > 0) {
          costBySource["claude_cleanup"] = (costBySource["claude_cleanup"] ?? 0) + cleanupCostUsd
        }
        for (const [sourceType, cost] of Object.entries(actorCostBySource)) {
          costBySource[sourceType] = (costBySource[sourceType] ?? 0) + cost
        }

        // Require successful Claude cleanup before proceeding down the enriched path.
        // Without cleanup, structured fields (circumstances, location, etc.) would all
        // be null, so marking the actor as enriched would be misleading.
        const hasEnrichmentData = debriefResult.rawSources.length > 0 && !!cleaned

        if (!hasEnrichmentData) {
          // Record non-enriched actor row so it appears in the Actor Results table
          if (runId) {
            // Mark sources as unsuccessful for non-enriched actors so admin
            // analytics (success rates, error reporting) behave correctly
            // Sources that returned findings are marked success: true (they did their job).
            // Cleanup failure is tracked separately via a claude_cleanup entry with success: false.
            const uniqueTypes = new Set(debriefResult.rawSources.map((s) => s.sourceType))
            const sourcesAttempted: Array<{
              source: string
              success: boolean
              costUsd: number
              error: string | null
            }> = [
              ...[...uniqueTypes].map((sourceType) => ({
                source: sourceType,
                success: true,
                costUsd: actorCostBySource[sourceType] ?? 0,
                error: null,
              })),
            ]
            // Track sources that returned no findings
            const nonEnrichedFailedCount =
              debriefResult.sourcesAttempted - debriefResult.sourcesSucceeded
            if (nonEnrichedFailedCount > 0) {
              sourcesAttempted.push({
                source: "_failed_sources",
                success: false,
                costUsd: 0,
                error: `${nonEnrichedFailedCount} source(s) returned no findings`,
              })
            }
            // Track cleanup failure — only when cleanup was enabled but failed
            if (claudeCleanup && debriefResult.rawSources.length > 0 && !cleaned) {
              sourcesAttempted.push({
                source: "claude_cleanup",
                success: false,
                costUsd: cleanupCostUsd,
                error: "cleanup_failed",
              })
            }

            await db.query(
              `INSERT INTO enrichment_run_actors (
                run_id, actor_id, was_enriched, created_death_page, confidence,
                sources_attempted, winning_source,
                processing_time_ms, cost_usd, log_entries
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (run_id, actor_id) DO UPDATE SET
                was_enriched = $3, created_death_page = $4, confidence = $5,
                sources_attempted = $6, winning_source = $7,
                processing_time_ms = $8, cost_usd = $9, log_entries = $10`,
              [
                runId,
                actor.id,
                false,
                false,
                null,
                JSON.stringify(sourcesAttempted),
                null,
                debriefResult.durationMs,
                totalActorCost,
                JSON.stringify(debriefResult.logEntries),
              ]
            )
          }

          return { costUsd: totalActorCost }
        }

        // --- Write enrichment data to DB immediately ---
        const circumstances = cleaned?.circumstances ?? null
        const rumoredCircumstances = cleaned?.rumoredCircumstances ?? null
        const locationOfDeath = cleaned?.locationOfDeath ?? null
        const notableFactors = cleaned?.notableFactors ?? null
        const additionalContext = cleaned?.additionalContext ?? null
        const relatedDeaths = cleaned?.relatedDeaths ?? null

        // Extract cause of death from Claude cleanup (for actors missing it)
        const causeOfDeath = cleaned?.cause ?? null
        const causeOfDeathDetails = cleaned?.details ?? null

        const causeConfidence = cleaned?.causeConfidence ?? null
        const detailsConfidence = cleaned?.detailsConfidence ?? null
        const birthdayConfidence = cleaned?.birthdayConfidence ?? null
        const deathdayConfidence = cleaned?.deathdayConfidence ?? null
        const lastProject = cleaned?.lastProject ?? null
        const careerStatusAtDeath = cleaned?.careerStatusAtDeath ?? null
        const posthumousReleases = cleaned?.posthumousReleases ?? null
        const relatedCelebrities = cleaned?.relatedCelebrities ?? null

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

        // Determine confidence level (from Claude cleanup, no per-source fallback needed)
        const circumstancesConfidence = cleaned?.circumstancesConfidence ?? null

        // Determine if we have substantive death info
        // Check Claude's quality gate first - REQUIRE explicit true, not just "not false"
        // This prevents null/undefined from sneaking through as truthy
        const hasSubstantiveCircumstances =
          circumstances && circumstances.length > MIN_CIRCUMSTANCES_LENGTH
        const hasSubstantiveRumors =
          rumoredCircumstances && rumoredCircumstances.length > MIN_RUMORED_CIRCUMSTANCES_LENGTH
        const hasRelatedDeaths = relatedDeaths && relatedDeaths.length > 50
        // Quality gate: if Claude cleanup ran, require hasSubstantiveContent === true
        // If Claude cleanup was skipped (cleaned is undefined), rely on content length checks only
        const passesQualityGate = cleaned === undefined || cleaned.hasSubstantiveContent === true
        const hasDetailedDeathInfo =
          passesQualityGate &&
          (hasSubstantiveCircumstances || hasSubstantiveRumors || hasRelatedDeaths)

        if (hasDetailedDeathInfo) {
          deathPageCount++
        }

        // Only include causeOfDeath if actor doesn't already have one
        const manner = cleaned?.manner || null
        const enrichmentData: EnrichmentData = {
          actorId: actor.id,
          hasDetailedDeathInfo: hasDetailedDeathInfo || false,
          deathManner: manner,
          deathCategories: cleaned?.categories || null,
          // Derive violent_death from manner
          violentDeath: isViolentDeath(manner),
          // Fill in cause_of_death if we got one and actor doesn't have it
          causeOfDeath: !actor.causeOfDeath && causeOfDeath ? causeOfDeath : undefined,
          causeOfDeathSource: !actor.causeOfDeath && causeOfDeath ? "claude-opus-4.5" : undefined,
          causeOfDeathDetails:
            !actor.causeOfDeathDetails && causeOfDeathDetails ? causeOfDeathDetails : undefined,
          causeOfDeathDetailsSource:
            !actor.causeOfDeathDetails && causeOfDeathDetails ? "claude-opus-4.5" : undefined,
        }

        // Run entity linking on narrative text fields
        const entityLinks = await linkMultipleFields(
          db,
          {
            circumstances,
            rumored_circumstances: rumoredCircumstances,
            additional_context: additionalContext,
          },
          { excludeActorId: actor.id }
        )

        const circumstancesData: DeathCircumstancesData = {
          actorId: actor.id,
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
            // All fields now come from Claude synthesis — no per-source tracking
            cleanupSource: cleaned?.cleanupSource ?? null,
          },
          rawResponse:
            debriefResult.rawSources.length > 0
              ? {
                  rawSources: debriefResult.rawSources,
                  gatheredAt: new Date().toISOString(),
                }
              : null,
          entityLinks: hasEntityLinks(entityLinks) ? entityLinks : null,
          enrichmentSource: "multi-source-enrichment",
          enrichmentVersion: useReliabilityThreshold
            ? DEATH_ENRICHMENT_VERSION
            : `${DEATH_ENRICHMENT_VERSION}-no-reliability`,
        }

        // Record per-actor results for all runs with a runId
        let enrichmentRunActorId: number | null = null
        if (runId) {
          // Deduplicate by sourceType and attribute real costs
          const enrichedUniqueTypes = new Set(debriefResult.rawSources.map((s) => s.sourceType))
          const sourcesAttempted: Array<{
            source: string
            success: boolean
            costUsd: number
            error: string | null
          }> = [
            ...[...enrichedUniqueTypes].map((sourceType) => ({
              source: sourceType,
              success: true,
              costUsd: actorCostBySource[sourceType] ?? 0,
              error: null,
            })),
          ]
          // Include failed sources so per-run analytics reflect actual attempts
          const actorFailedCount = debriefResult.sourcesAttempted - debriefResult.sourcesSucceeded
          if (actorFailedCount > 0) {
            sourcesAttempted.push({
              source: "_failed_sources",
              success: false,
              costUsd: 0,
              error: `${actorFailedCount} source(s) returned no findings`,
            })
          }

          // Find the highest-confidence raw source for confidence and winning_source
          const bestSource =
            debriefResult.rawSources.length > 0
              ? debriefResult.rawSources.reduce((best, s) =>
                  s.confidence > best.confidence ? s : best
                )
              : null
          const bestConfidence = bestSource?.confidence ?? null

          const eraResult = await db.query<{ id: number }>(
            `INSERT INTO enrichment_run_actors (
            run_id,
            actor_id,
            was_enriched,
            created_death_page,
            confidence,
            sources_attempted,
            winning_source,
            processing_time_ms,
            cost_usd,
            log_entries
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (run_id, actor_id) DO UPDATE SET
            was_enriched = $3, created_death_page = $4, confidence = $5,
            sources_attempted = $6, winning_source = $7,
            processing_time_ms = $8, cost_usd = $9, log_entries = $10
          RETURNING id`,
            [
              runId,
              actor.id,
              true,
              hasDetailedDeathInfo || false,
              bestConfidence,
              JSON.stringify(sourcesAttempted),
              bestSource?.sourceType || null,
              debriefResult.durationMs,
              totalActorCost,
              JSON.stringify(debriefResult.logEntries),
            ]
          )
          enrichmentRunActorId = eraResult.rows[0]?.id ?? null
        }

        batchActorsEnriched++

        // Route to staging or production
        if (staging && enrichmentRunActorId) {
          await writeToStaging(db, enrichmentRunActorId, enrichmentData, circumstancesData)
          this.log.debug({ actorName: actor.name }, "Staged for review")
        } else {
          await writeToProduction(db, enrichmentData, circumstancesData)
          updatedActors.push({
            name: actor.name,
            id: actor.id,
          })
        }

        updated++

        return { costUsd: totalActorCost }
      }

      // Run actors in parallel
      const runner = new ParallelBatchRunner<ActorForEnrichment, { costUsd: number }>({
        concurrency: this.config.concurrency ?? 5,
        costTracker,
        getCost: (result) => result.costUsd,
        onItemComplete: async (_actor, _result, progress) => {
          if (this.onProgress) {
            await this.onProgress({
              currentActorIndex: progress.completed,
              currentActorName: `${progress.inFlight} actors in flight`,
              actorsInFlight: progress.inFlight,
              actorsCompleted: progress.completed,
              actorsQueried: actorsToEnrich.length,
              actorsProcessed: batchActorsProcessed,
              actorsEnriched: batchActorsEnriched,
              actorsWithDeathPage: deathPageCount,
              totalCostUsd: costTracker.getTotalCost(),
              phase: "completed",
            })
          }
        },
        signal: this.abortSignal,
      })

      await runner.run(actorsToEnrich, processActor)

      // Check if cost limit was hit
      if (!costLimitReached) {
        costLimitReached = costTracker.isLimitExceeded()
      }

      // Rebuild caches if we updated anything (only in production mode)
      if (updated > 0 && !staging) {
        await rebuildDeathCaches()
        this.log.info("Rebuilt death caches")
      }

      const totalCostUsd = costTracker.getTotalCost()
      const fillRate =
        batchActorsProcessed > 0 ? (batchActorsEnriched / batchActorsProcessed) * 100 : 0

      const exitReason: "completed" | "cost_limit" | "interrupted" = costLimitReached
        ? "cost_limit"
        : this.shouldStop()
          ? "interrupted"
          : "completed"

      this.log.info(
        {
          actorsProcessed: batchActorsProcessed,
          actorsEnriched: batchActorsEnriched,
          fillRate,
          databaseUpdates: updated,
          totalCostUsd,
          exitReason,
        },
        "Enrichment complete"
      )

      return {
        actorsProcessed: batchActorsProcessed,
        actorsEnriched: batchActorsEnriched,
        fillRate,
        totalCostUsd,
        totalTimeMs: Date.now() - startTime,
        costBySource,
        exitReason,
        updatedActors,
        sourceHitRates,
        uniqueSourcesAttempted: Object.keys(sourceHitRates),
      }
    } finally {
      // Always reset cache behavior to default (use cache) to ensure per-run isolation
      // This prevents ignoreCache=true from leaking into subsequent runs in the same worker
      setIgnoreCache(false)
    }
  }

  /**
   * Query actors from top-billed roles in a specific year
   */
  private async queryTopBilledActors(
    year: number,
    maxBilling: number,
    topMoviesCount: number,
    limit: number
  ): Promise<ActorRow[]> {
    const db = getPool()

    this.log.info(
      { year, maxBilling, topMoviesCount },
      "Querying deceased actors from top-billed roles"
    )

    const actors = await getDeceasedActorsFromTopMovies({
      year,
      maxBilling,
      topMoviesCount,
      limit,
    })

    // Fetch missing popularity scores from TMDB
    const actorsNeedingPopularity = actors.filter(
      (a) => a.tmdb_popularity === null && a.tmdb_id !== null
    )
    if (actorsNeedingPopularity.length > 0) {
      this.log.info({ count: actorsNeedingPopularity.length }, "Fetching popularity from TMDB")
      const tmdbIds = actorsNeedingPopularity.map((a) => a.tmdb_id as number)
      const personDetails = await batchGetPersonDetails(tmdbIds)

      const tmdbIdsToUpdate: number[] = []
      const popularitiesToUpdate: number[] = []
      for (const actor of actors) {
        if (actor.tmdb_popularity === null && actor.tmdb_id !== null) {
          const details = personDetails.get(actor.tmdb_id)
          if (details?.popularity !== undefined && details.popularity !== null) {
            actor.tmdb_popularity = details.popularity
            tmdbIdsToUpdate.push(actor.tmdb_id)
            popularitiesToUpdate.push(details.popularity)
          }
        }
      }

      if (tmdbIdsToUpdate.length > 0) {
        await db.query(
          `UPDATE actors AS a
           SET tmdb_popularity = v.tmdb_popularity,
               updated_at = CURRENT_TIMESTAMP
           FROM (
             SELECT UNNEST($1::int[]) AS tmdb_id,
                    UNNEST($2::double precision[]) AS tmdb_popularity
           ) AS v
           WHERE a.tmdb_id = v.tmdb_id`,
          [tmdbIdsToUpdate, popularitiesToUpdate]
        )
      }

      actors.sort((a, b) => {
        const popA = a.dof_popularity ?? a.tmdb_popularity ?? 0
        const popB = b.dof_popularity ?? b.tmdb_popularity ?? 0
        return popB - popA
      })
    }

    return actors
  }

  /**
   * Query specific actors by internal ID
   */
  private async queryActorsByInternalId(actorIds: number[]): Promise<ActorRow[]> {
    const db = getPool()

    this.log.info({ count: actorIds.length }, "Querying actors by internal ID")

    const result = await db.query<ActorRow>(
      `SELECT
        a.id,
        a.tmdb_id,
        a.imdb_person_id,
        a.name,
        a.birthday,
        a.deathday,
        a.cause_of_death,
        a.cause_of_death_details,
        a.tmdb_popularity,
        a.dof_popularity,
        c.circumstances,
        c.notable_factors
      FROM actors a
      LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
      WHERE a.id = ANY($1::int[])
        AND a.deathday IS NOT NULL
      ORDER BY a.dof_popularity DESC NULLS LAST`,
      [actorIds]
    )

    return result.rows
  }

  /**
   * Query specific actors by TMDB ID
   */
  private async queryActorsByTmdbId(tmdbIds: number[]): Promise<ActorRow[]> {
    const db = getPool()

    this.log.info({ count: tmdbIds.length }, "Querying actors by TMDB ID")

    const result = await db.query<ActorRow>(
      `SELECT
        a.id,
        a.tmdb_id,
        a.imdb_person_id,
        a.name,
        a.birthday,
        a.deathday,
        a.cause_of_death,
        a.cause_of_death_details,
        a.tmdb_popularity,
        a.dof_popularity,
        c.circumstances,
        c.notable_factors
      FROM actors a
      LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
      WHERE a.tmdb_id = ANY($1::int[])
        AND a.deathday IS NOT NULL
      ORDER BY a.dof_popularity DESC NULLS LAST`,
      [tmdbIds]
    )

    return result.rows
  }

  /**
   * Query actors with missing death circumstances
   */
  private async queryActorsWithMissingCircumstances(
    limit: number,
    minPopularity: number,
    recentOnly: boolean,
    usActorsOnly: boolean,
    sortBy: "popularity" | "interestingness" = "popularity"
  ): Promise<ActorRow[]> {
    const db = getPool()

    this.log.info("Querying actors needing death enrichment")

    const params: (number | string)[] = []
    let query = `
      SELECT
        a.id,
        a.tmdb_id,
        a.imdb_person_id,
        a.name,
        a.birthday,
        a.deathday,
        a.cause_of_death,
        a.cause_of_death_details,
        a.tmdb_popularity,
        a.dof_popularity,
        c.circumstances,
        c.notable_factors,
        (
          SELECT COUNT(*) FROM actor_movie_appearances WHERE actor_id = a.id
        ) + (
          SELECT COUNT(*) FROM actor_show_appearances WHERE actor_id = a.id
        ) AS appearance_count
      FROM actors a
      LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
      WHERE a.deathday IS NOT NULL
        AND (
          a.cause_of_death IS NULL
          OR c.circumstances IS NULL
          OR c.notable_factors IS NULL
          OR array_length(c.notable_factors, 1) IS NULL
        )
    `

    if (minPopularity > 0) {
      params.push(minPopularity)
      query += ` AND a.tmdb_popularity >= $${params.length}`
    }

    if (recentOnly) {
      const twoYearsAgo = new Date()
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
      params.push(twoYearsAgo.toISOString().split("T")[0])
      query += ` AND a.deathday >= $${params.length}`
    }

    if (usActorsOnly) {
      query += `
        AND (
          EXISTS (
            SELECT 1 FROM actor_show_appearances asa
            JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
            WHERE asa.actor_id = a.id
            AND s.origin_country @> ARRAY['US']::text[]
          )
          OR EXISTS (
            SELECT 1 FROM actor_movie_appearances ama
            JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
            WHERE ama.actor_id = a.id
            AND (
              m.production_countries @> ARRAY['US']::text[]
              OR m.original_language = 'en'
            )
          )
        )`

      query +=
        sortBy === "interestingness"
          ? `
        ORDER BY
          a.interestingness_score DESC NULLS LAST,`
          : `
        ORDER BY
          a.dof_popularity DESC NULLS LAST,`
      query += `
          a.birthday DESC NULLS LAST,
          (
            SELECT COUNT(*) FROM actor_show_appearances asa
            JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
            WHERE asa.actor_id = a.id AND s.origin_country @> ARRAY['US']::text[]
          ) + (
            SELECT COUNT(*) FROM actor_movie_appearances ama
            JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
            WHERE ama.actor_id = a.id
            AND (m.production_countries @> ARRAY['US']::text[] OR m.original_language = 'en')
          ) DESC`
    } else {
      query +=
        sortBy === "interestingness"
          ? ` ORDER BY a.interestingness_score DESC NULLS LAST, a.birthday DESC NULLS LAST, appearance_count DESC`
          : ` ORDER BY a.dof_popularity DESC NULLS LAST, a.birthday DESC NULLS LAST, appearance_count DESC`
    }

    if (limit) {
      params.push(limit)
      query += ` LIMIT $${params.length}`
    }

    const result = await db.query<ActorRow>(query, params)
    return result.rows
  }
}
