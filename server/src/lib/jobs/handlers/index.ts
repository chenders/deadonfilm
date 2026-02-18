/**
 * Job Handler Registry
 *
 * Central registry of all job handlers.
 * Maps job types to their handler implementations.
 */

import type { BaseJobHandler } from "./base.js"
import type { JobType } from "../types.js"

/**
 * Registry of job type to handler instance
 */
const handlerRegistry = new Map<JobType, BaseJobHandler>()

/**
 * Register a job handler
 */
export function registerHandler(handler: BaseJobHandler): void {
  if (handlerRegistry.has(handler.jobType)) {
    throw new Error(`Handler already registered for job type: ${handler.jobType}`)
  }

  handlerRegistry.set(handler.jobType, handler)
}

/**
 * Get handler for a job type
 */
export function getHandler(jobType: JobType): BaseJobHandler | undefined {
  return handlerRegistry.get(jobType)
}

/**
 * Get all registered handlers
 */
export function getAllHandlers(): BaseJobHandler[] {
  return Array.from(handlerRegistry.values())
}

/**
 * Clear all handlers (for testing)
 */
export function clearHandlers(): void {
  handlerRegistry.clear()
}

// Import and register all handlers here
import { FetchOMDbRatingsHandler } from "./fetch-omdb-ratings.js"
import { FetchTraktRatingsHandler } from "./fetch-trakt-ratings.js"
import { FetchTheTVDBScoresHandler } from "./fetch-thetvdb-scores.js"
import { EnrichDeathDetailsHandler } from "./enrich-death-details.js"
import { EnrichDeathDetailsBatchHandler } from "./enrich-death-details-batch.js"
import { EnrichCauseOfDeathHandler } from "./enrich-cause-of-death.js"
import { SyncTMDBChangesHandler } from "./sync-tmdb-changes.js"
import { SyncTMDBPeopleHandler } from "./sync-tmdb-people.js"
import { SyncTMDBMoviesHandler } from "./sync-tmdb-movies.js"
import { SyncTMDBShowsHandler } from "./sync-tmdb-shows.js"
import { CalculateActorObscurityHandler } from "./calculate-actor-obscurity.js"
import { CalculateContentPopularityHandler } from "./calculate-content-popularity.js"
import { CalculateActorPopularityHandler } from "./calculate-actor-popularity.js"
import { RebuildDeathCachesHandler } from "./rebuild-death-caches.js"
import { GenerateBiographiesBatchHandler } from "./generate-biographies-batch.js"
import { EnrichBiographiesBatchHandler } from "./enrich-biographies-batch.js"

// Register handlers
registerHandler(new FetchOMDbRatingsHandler())
registerHandler(new FetchTraktRatingsHandler())
registerHandler(new FetchTheTVDBScoresHandler())
registerHandler(new EnrichDeathDetailsHandler())
registerHandler(new EnrichDeathDetailsBatchHandler())
registerHandler(new EnrichCauseOfDeathHandler())
registerHandler(new SyncTMDBChangesHandler())
registerHandler(new SyncTMDBPeopleHandler())
registerHandler(new SyncTMDBMoviesHandler())
registerHandler(new SyncTMDBShowsHandler())
registerHandler(new CalculateActorObscurityHandler())
registerHandler(new CalculateContentPopularityHandler())
registerHandler(new CalculateActorPopularityHandler())
registerHandler(new RebuildDeathCachesHandler())
registerHandler(new GenerateBiographiesBatchHandler())
registerHandler(new EnrichBiographiesBatchHandler())
