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
  DeathEnrichmentOrchestrator,
  CostLimitExceededError,
  setIgnoreCache,
  type EnrichmentConfig,
  type ActorForEnrichment,
} from "./death-sources/index.js"
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
import { isViolentDeath } from "./death-sources/claude-cleanup.js"
import { linkMultipleFields, hasEntityLinks } from "./entity-linker/index.js"
import { RunLogger } from "./run-logger.js"
import { logger } from "./logger.js"
import { DEATH_ENRICHMENT_VERSION } from "./enrichment-version.js"

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
  // Wikipedia-specific options
  wikipediaUseAISectionSelection?: boolean
  wikipediaFollowLinkedArticles?: boolean
  wikipediaMaxLinkedArticles?: number
  wikipediaMaxSections?: number
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
  currentActorIndex: number
  currentActorName: string
  actorsQueried: number
  actorsProcessed: number
  actorsEnriched: number
  actorsWithDeathPage: number
  totalCostUsd: number
  /** "processing" = actor just started; "completed" = actor finished */
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
      gatherAllSources = true,
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
      // Wikipedia-specific options
      wikipediaUseAISectionSelection = false,
      wikipediaFollowLinkedArticles = false,
      wikipediaMaxLinkedArticles = 2,
      wikipediaMaxSections = 10,
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

      // Configure the orchestrator
      const config: Partial<EnrichmentConfig> = {
        sourceCategories: {
          free,
          paid,
          ai,
        },
        confidenceThreshold,
        costLimits: {
          maxCostPerActor,
          maxTotalCost,
        },
        claudeCleanup: claudeCleanup
          ? {
              enabled: true,
              model: "claude-opus-4-5-20251101",
              gatherAllSources,
            }
          : undefined,
        // Wikipedia-specific options for AI section selection and link following
        wikipediaOptions:
          wikipediaUseAISectionSelection || wikipediaFollowLinkedArticles
            ? {
                useAISectionSelection: wikipediaUseAISectionSelection,
                followLinkedArticles: wikipediaFollowLinkedArticles,
                maxLinkedArticles: wikipediaMaxLinkedArticles,
                maxSections: wikipediaMaxSections,
              }
            : undefined,
        useReliabilityThreshold,
      }

      const orchestrator = new DeathEnrichmentOrchestrator(config)

      // Wire up RunLogger for DB log capture if we have a run ID
      let runLogger: RunLogger | null = null
      if (runId) {
        runLogger = new RunLogger("death", runId)
        orchestrator.setRunLogger(runLogger)
      }

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

      // Process actors one by one — enrich and write to DB inline
      // so that enrichment_run_actors rows appear immediately for live UI updates
      let costLimitReached = false
      let wasInterrupted = false
      const updatedActors: Array<{ name: string; id: number }> = []
      let updated = 0
      let actorsWithDeathPage = 0

      // Track source hit rates: {source: {attempts: n, successes: n}}
      const sourceHitRates: Record<string, { attempts: number; successes: number }> = {}

      try {
        for (let i = 0; i < actorsToEnrich.length; i++) {
          // Check for abort signal
          if (this.shouldStop()) {
            this.log.info("Enrichment interrupted by abort signal")
            wasInterrupted = true
            break
          }

          const actor = actorsToEnrich[i]

          // Report progress BEFORE enrichment so UI shows actor currently being processed.
          // Uses phase: "processing" so handlers can skip heavy DB writes.
          if (this.onProgress) {
            const stats = orchestrator.getStats()
            await this.onProgress({
              currentActorIndex: i + 1,
              currentActorName: actor.name,
              actorsQueried: actors.length,
              actorsProcessed: stats.actorsProcessed,
              actorsEnriched: stats.actorsEnriched,
              actorsWithDeathPage,
              totalCostUsd: stats.totalCostUsd,
              phase: "processing",
            })
          }

          // Enrich this actor
          const enrichment = await orchestrator.enrichActor(actor)

          // Aggregate source hit rates from actorStats
          if (enrichment.actorStats?.sourcesAttempted) {
            for (const attempt of enrichment.actorStats.sourcesAttempted) {
              if (!sourceHitRates[attempt.source]) {
                sourceHitRates[attempt.source] = { attempts: 0, successes: 0 }
              }
              sourceHitRates[attempt.source].attempts++
              if (attempt.success) {
                sourceHitRates[attempt.source].successes++
              }
            }
          }

          // Check if actor has substantive enrichment data
          const hasEnrichmentData = !!(
            enrichment.circumstances ||
            enrichment.notableFactors?.length ||
            enrichment.cleanedDeathInfo
          )

          if (!hasEnrichmentData) {
            // Record non-enriched actor row so it appears in the Actor Results table
            if (runId) {
              const actorStats = enrichment.actorStats
              const sourcesAttempted =
                actorStats?.sourcesAttempted && actorStats.sourcesAttempted.length > 0
                  ? actorStats.sourcesAttempted.map((s) => ({
                      source: s.source,
                      success: s.success,
                      costUsd: s.costUsd || 0,
                    }))
                  : []

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
                  false, // created_death_page
                  null,
                  JSON.stringify(sourcesAttempted),
                  null,
                  actorStats?.totalTimeMs || null,
                  actorStats?.totalCostUsd || 0,
                  JSON.stringify(enrichment.logEntries || []),
                ]
              )
            }

            // Report progress after recording non-enriched actor
            if (this.onProgress) {
              const stats = orchestrator.getStats()
              await this.onProgress({
                currentActorIndex: i + 1,
                currentActorName: actor.name,
                actorsQueried: actors.length,
                actorsProcessed: stats.actorsProcessed,
                actorsEnriched: stats.actorsEnriched,
                actorsWithDeathPage,
                totalCostUsd: stats.totalCostUsd,
                phase: "completed",
              })
            }

            continue
          }

          // --- Write enrichment data to DB immediately ---
          const cleaned = enrichment.cleanedDeathInfo
          const circumstances = cleaned?.circumstances || enrichment.circumstances
          const rumoredCircumstances =
            cleaned?.rumoredCircumstances || enrichment.rumoredCircumstances
          const locationOfDeath = cleaned?.locationOfDeath || enrichment.locationOfDeath
          const notableFactors = cleaned?.notableFactors || enrichment.notableFactors
          const additionalContext = cleaned?.additionalContext || enrichment.additionalContext
          const relatedDeaths = cleaned?.relatedDeaths || enrichment.relatedDeaths || null

          // Extract cause of death from Claude cleanup (for actors missing it)
          const causeOfDeath = cleaned?.cause || null
          const causeOfDeathDetails = cleaned?.details || null

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
            actorsWithDeathPage++
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
            entityLinks: hasEntityLinks(entityLinks) ? entityLinks : null,
            enrichmentSource: "multi-source-enrichment",
            enrichmentVersion: useReliabilityThreshold
              ? DEATH_ENRICHMENT_VERSION
              : `${DEATH_ENRICHMENT_VERSION}-no-reliability`,
          }

          // Record per-actor results for all runs with a runId
          let enrichmentRunActorId: number | null = null
          if (runId) {
            // Use actorStats for full tracking data (all sources attempted, total cost, timing)
            const actorStats = enrichment.actorStats
            const sourcesAttempted =
              actorStats?.sourcesAttempted && actorStats.sourcesAttempted.length > 0
                ? actorStats.sourcesAttempted.map((s) => ({
                    source: s.source,
                    success: s.success,
                    costUsd: s.costUsd || 0,
                  }))
                : enrichment.circumstancesSource?.type
                  ? [
                      {
                        source: enrichment.circumstancesSource.type,
                        success: true,
                        costUsd: enrichment.circumstancesSource.costUsd || 0,
                      },
                    ]
                  : []

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
                hasDetailedDeathInfo || false, // created_death_page
                enrichment.circumstancesSource?.confidence || null,
                JSON.stringify(sourcesAttempted),
                enrichment.circumstancesSource?.type || null,
                actorStats?.totalTimeMs || null,
                actorStats?.totalCostUsd || enrichment.circumstancesSource?.costUsd || 0,
                JSON.stringify(enrichment.logEntries || []),
              ]
            )
            enrichmentRunActorId = eraResult.rows[0].id
          }

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

          // Report progress AFTER DB write so counts reflect committed data
          if (this.onProgress) {
            const stats = orchestrator.getStats()
            await this.onProgress({
              currentActorIndex: i + 1,
              currentActorName: actor.name,
              actorsQueried: actors.length,
              actorsProcessed: stats.actorsProcessed,
              actorsEnriched: stats.actorsEnriched,
              actorsWithDeathPage,
              totalCostUsd: stats.totalCostUsd,
              phase: "completed",
            })
          }
        }
      } catch (error) {
        if (error instanceof CostLimitExceededError) {
          this.log.warn(
            { limit: error.limit, currentCost: error.currentCost },
            "Cost limit reached - stopping enrichment"
          )
          costLimitReached = true
        } else {
          // Flush run logs before re-throwing so error-path logs aren't lost
          if (runLogger) {
            await runLogger.flush()
          }
          throw error
        }
      }

      // Flush remaining run logs
      if (runLogger) {
        await runLogger.flush()
      }

      // Get final stats
      const stats = orchestrator.getStats()

      // Rebuild caches if we updated anything (only in production mode)
      if (updated > 0 && !staging) {
        await rebuildDeathCaches()
        this.log.info("Rebuilt death caches")
      }

      const exitReason: "completed" | "cost_limit" | "interrupted" = costLimitReached
        ? "cost_limit"
        : wasInterrupted
          ? "interrupted"
          : "completed"

      this.log.info(
        {
          actorsProcessed: stats.actorsProcessed,
          actorsEnriched: stats.actorsEnriched,
          fillRate: stats.fillRate,
          databaseUpdates: updated,
          totalCostUsd: stats.totalCostUsd,
          exitReason,
        },
        "Enrichment complete"
      )

      return {
        actorsProcessed: stats.actorsProcessed,
        actorsEnriched: stats.actorsEnriched,
        fillRate: stats.fillRate,
        totalCostUsd: stats.totalCostUsd,
        totalTimeMs: stats.totalTimeMs,
        costBySource: stats.costBySource,
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
        a.tmdb_popularity as popularity,
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
        a.tmdb_popularity as popularity,
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
