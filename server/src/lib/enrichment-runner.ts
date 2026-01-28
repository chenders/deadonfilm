/**
 * Enrichment Runner Library
 *
 * Core enrichment loop extracted from enrich-death-details.ts for use
 * by both the CLI script and BullMQ job handler.
 *
 * This module provides:
 * - EnrichmentRunner class for processing actors
 * - Progress callbacks for real-time updates
 * - AbortSignal support for graceful cancellation
 */

import { getPool, getDeceasedActorsFromTopMovies } from "./db.js"
import { batchGetPersonDetails } from "./tmdb.js"
import { rebuildDeathCaches, invalidateActorCache } from "./cache.js"
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
import { logger } from "./logger.js"

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
  ignoreCache?: boolean
  runId?: number
  staging?: boolean
}

/**
 * Progress information during enrichment
 */
export interface EnrichmentProgress {
  currentActorIndex: number
  currentActorName: string
  actorsQueried: number
  actorsProcessed: number
  actorsEnriched: number
  totalCostUsd: number
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
}

/**
 * Actor row from database query
 */
interface ActorRow {
  id: number
  tmdb_id: number | null
  name: string
  birthday: Date | string | null
  deathday: Date | string
  cause_of_death: string | null
  cause_of_death_details: string | null
  popularity: number | null
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
      // Link following options are defined but not yet used in the runner
      // They are passed to the orchestrator configuration
      topBilledYear,
      maxBilling,
      topMovies,
      usActorsOnly = false,
      ignoreCache = false,
      runId,
      staging = false,
    } = this.config

    // Configure cache behavior
    if (ignoreCache) {
      setIgnoreCache(true)
      this.log.info("Cache disabled - all requests will be made fresh")
    }

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
        usActorsOnly
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
        totalCostUsd: 0,
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
      stopOnMatch: false, // Always gather all sources
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
    }

    const orchestrator = new DeathEnrichmentOrchestrator(config)

    // Convert to ActorForEnrichment format
    const actorsToEnrich: ActorForEnrichment[] = actors.map((a) => ({
      id: a.id,
      tmdbId: a.tmdb_id,
      name: a.name,
      birthday: normalizeDateToString(a.birthday),
      deathday: normalizeDateToString(a.deathday) || "",
      causeOfDeath: a.cause_of_death,
      causeOfDeathDetails: a.cause_of_death_details,
      popularity: a.popularity,
    }))

    // Run enrichment - process actors one by one
    const results = new Map<number, Awaited<ReturnType<typeof orchestrator.enrichActor>>>()
    let costLimitReached = false
    let wasInterrupted = false

    try {
      for (let i = 0; i < actorsToEnrich.length; i++) {
        // Check for abort signal
        if (this.shouldStop()) {
          this.log.info("Enrichment interrupted by abort signal")
          wasInterrupted = true
          break
        }

        const actor = actorsToEnrich[i]

        // Report progress
        if (this.onProgress) {
          const stats = orchestrator.getStats()
          await this.onProgress({
            currentActorIndex: i + 1,
            currentActorName: actor.name,
            actorsQueried: actors.length,
            actorsProcessed: stats.actorsProcessed,
            actorsEnriched: stats.actorsEnriched,
            totalCostUsd: stats.totalCostUsd,
          })
        }

        // Enrich this actor
        const enrichment = await orchestrator.enrichActor(actor)
        results.set(actor.id, enrichment)
      }
    } catch (error) {
      if (error instanceof CostLimitExceededError) {
        this.log.warn(
          { limit: error.limit, currentCost: error.currentCost },
          "Cost limit reached - stopping enrichment"
        )
        costLimitReached = true
      } else {
        throw error
      }
    }

    // Apply results to database
    const updatedActors: Array<{ name: string; id: number }> = []
    let updated = 0

    for (const [actorId, enrichment] of results) {
      if (
        !enrichment.circumstances &&
        !enrichment.notableFactors?.length &&
        !enrichment.cleanedDeathInfo
      ) {
        continue
      }

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
      const hasSubstantiveCircumstances =
        circumstances && circumstances.length > MIN_CIRCUMSTANCES_LENGTH
      const hasSubstantiveRumors =
        rumoredCircumstances && rumoredCircumstances.length > MIN_RUMORED_CIRCUMSTANCES_LENGTH
      const hasRelatedDeaths = relatedDeaths && relatedDeaths.length > 50
      const hasDetailedDeathInfo =
        hasSubstantiveCircumstances || hasSubstantiveRumors || hasRelatedDeaths

      const actorRecord = actorsToEnrich.find((a) => a.id === actorId)

      const enrichmentData: EnrichmentData = {
        actorId,
        hasDetailedDeathInfo: hasDetailedDeathInfo || false,
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
        enrichmentSource: "multi-source-enrichment",
        enrichmentVersion: "2.0.0",
      }

      // Route to staging or production
      if (staging && runId) {
        const eraResult = await db.query<{ id: number }>(
          `INSERT INTO enrichment_run_actors (
            run_id,
            actor_id,
            was_enriched,
            confidence,
            sources_attempted,
            winning_source,
            processing_time_ms,
            cost_usd
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
          [
            runId,
            actorId,
            true,
            enrichment.circumstancesSource?.confidence || null,
            JSON.stringify([enrichment.circumstancesSource?.type].filter(Boolean)),
            enrichment.circumstancesSource?.type || null,
            null,
            enrichment.circumstancesSource?.costUsd || 0,
          ]
        )

        const enrichmentRunActorId = eraResult.rows[0].id
        await writeToStaging(db, enrichmentRunActorId, enrichmentData, circumstancesData)
        this.log.debug({ actorName: actorRecord?.name }, "Staged for review")
      } else {
        await writeToProduction(db, enrichmentData, circumstancesData)
        await invalidateActorCache(actorId)
        if (actorRecord) {
          updatedActors.push({
            name: actorRecord.name,
            id: actorId,
          })
        }
      }

      updated++
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
      (a) => a.popularity === null && a.tmdb_id !== null
    )
    if (actorsNeedingPopularity.length > 0) {
      this.log.info({ count: actorsNeedingPopularity.length }, "Fetching popularity from TMDB")
      const tmdbIds = actorsNeedingPopularity.map((a) => a.tmdb_id as number)
      const personDetails = await batchGetPersonDetails(tmdbIds)

      const tmdbIdsToUpdate: number[] = []
      const popularitiesToUpdate: number[] = []
      for (const actor of actors) {
        if (actor.popularity === null && actor.tmdb_id !== null) {
          const details = personDetails.get(actor.tmdb_id)
          if (details?.popularity !== undefined && details.popularity !== null) {
            actor.popularity = details.popularity
            tmdbIdsToUpdate.push(actor.tmdb_id)
            popularitiesToUpdate.push(details.popularity)
          }
        }
      }

      if (tmdbIdsToUpdate.length > 0) {
        await db.query(
          `UPDATE actors AS a
           SET popularity = v.popularity,
               updated_at = CURRENT_TIMESTAMP
           FROM (
             SELECT UNNEST($1::int[]) AS tmdb_id,
                    UNNEST($2::double precision[]) AS popularity
           ) AS v
           WHERE a.tmdb_id = v.tmdb_id`,
          [tmdbIdsToUpdate, popularitiesToUpdate]
        )
      }

      actors.sort((a, b) => {
        const popA = a.popularity ?? 0
        const popB = b.popularity ?? 0
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
        a.name,
        a.birthday,
        a.deathday,
        a.cause_of_death,
        a.cause_of_death_details,
        a.popularity,
        c.circumstances,
        c.notable_factors
      FROM actors a
      LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
      WHERE a.id = ANY($1::int[])
        AND a.deathday IS NOT NULL
      ORDER BY a.popularity DESC NULLS LAST`,
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
        a.name,
        a.birthday,
        a.deathday,
        a.cause_of_death,
        a.cause_of_death_details,
        a.popularity,
        c.circumstances,
        c.notable_factors
      FROM actors a
      LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
      WHERE a.tmdb_id = ANY($1::int[])
        AND a.deathday IS NOT NULL
      ORDER BY a.popularity DESC NULLS LAST`,
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
    usActorsOnly: boolean
  ): Promise<ActorRow[]> {
    const db = getPool()

    this.log.info("Querying actors with missing death circumstances")

    const params: (number | string)[] = []
    let query = `
      SELECT
        a.id,
        a.tmdb_id,
        a.name,
        a.birthday,
        a.deathday,
        a.cause_of_death,
        a.cause_of_death_details,
        a.popularity,
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
        AND a.cause_of_death IS NOT NULL
        AND (c.circumstances IS NULL OR c.notable_factors IS NULL OR array_length(c.notable_factors, 1) IS NULL)
    `

    if (minPopularity > 0) {
      params.push(minPopularity)
      query += ` AND a.popularity >= $${params.length}`
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

      query += `
        ORDER BY
          a.popularity DESC NULLS LAST,
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
      query += ` ORDER BY a.popularity DESC NULLS LAST, a.birthday DESC NULLS LAST, appearance_count DESC`
    }

    if (limit) {
      params.push(limit)
      query += ` LIMIT $${params.length}`
    }

    const result = await db.query<ActorRow>(query, params)
    return result.rows
  }
}
