/**
 * SYNC_TMDB_PEOPLE Handler
 *
 * Syncs people changes from TMDB to detect newly deceased actors.
 * Adapts the syncPeopleChanges() function from scripts/sync-tmdb-changes.ts.
 *
 * This handler:
 * 1. Fetches changed person IDs from TMDB within the date range
 * 2. Filters to actors in our database
 * 3. Detects newly deceased actors
 * 4. Fetches cause of death via Wikidata/Claude
 * 5. Updates actor records and recalculates mortality stats for affected movies
 * 6. Invalidates relevant caches
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type SyncTMDBPeoplePayload } from "../types.js"
import {
  getPool,
  getAllActorTmdbIds,
  getDeceasedTmdbIds,
  upsertActor,
  upsertMovie,
  type ActorInput,
  type MovieRecord,
} from "../../db.js"
import {
  getAllChangedPersonIds,
  batchGetPersonDetails,
  getMovieDetails,
  getMovieCredits,
  type TMDBPerson,
} from "../../tmdb.js"
import { getCauseOfDeath, verifyDeathDate } from "../../wikidata.js"
import { calculateYearsLost, calculateMovieMortality } from "../../mortality-stats.js"
import { getDateRanges } from "../../date-utils.js"
import { invalidateActorCacheRequired } from "../../cache.js"
import { queueManager } from "../queue-manager.js"
import { initRedis, closeRedis } from "../../redis.js"

const CAST_LIMIT = 30

/**
 * Deceased actor info returned in result
 */
export interface DeceasedActorInfo {
  id: number
  tmdbId: number
  name: string
  deathday: string
}

/**
 * Result from people sync
 */
export interface SyncTMDBPeopleResult {
  checked: number
  newDeathsFound: number
  newlyDeceasedActors: DeceasedActorInfo[]
  moviesUpdated: number
  errors: string[]
}

/**
 * Handler for TMDB people sync jobs
 */
export class SyncTMDBPeopleHandler extends BaseJobHandler<
  SyncTMDBPeoplePayload,
  SyncTMDBPeopleResult
> {
  readonly jobType = JobType.SYNC_TMDB_PEOPLE
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the people sync job
   */
  async process(job: Job<SyncTMDBPeoplePayload>): Promise<JobResult<SyncTMDBPeopleResult>> {
    const log = this.createLogger(job)
    const { startDate, endDate } = job.data

    log.info({ startDate, endDate }, "Starting TMDB people sync")

    const errors: string[] = []
    const pool = getPool()

    // Get all actors and deceased actors in our database
    log.info("Loading actor IDs from database")
    const [actorTmdbIds, deceasedTmdbIds] = await Promise.all([
      getAllActorTmdbIds(),
      getDeceasedTmdbIds(),
    ])
    log.info(
      { actorCount: actorTmdbIds.size, deceasedCount: deceasedTmdbIds.size },
      "Loaded actor IDs"
    )

    // Split into date ranges if needed (max 14 days per TMDB query)
    const dateRanges = getDateRanges(startDate, endDate)
    log.info({ rangeCount: dateRanges.length }, "Querying date ranges")

    // Fetch all changed person IDs from TMDB
    const allChangedIds: number[] = []
    for (const range of dateRanges) {
      log.debug({ start: range.start, end: range.end }, "Fetching changes for range")
      const ids = await getAllChangedPersonIds(range.start, range.end, 50)
      allChangedIds.push(...ids)
      await this.delay(100)
    }

    // Deduplicate
    const changedIds = [...new Set(allChangedIds)]
    log.info({ changedCount: changedIds.length }, "Found changed person IDs on TMDB")

    // Filter to people we care about (in our database)
    const relevantIds = changedIds.filter((id) => actorTmdbIds.has(id))
    log.info({ relevantCount: relevantIds.length }, "Filtered to actors in database")

    if (relevantIds.length === 0) {
      log.info("No relevant people changes found")
      return {
        success: true,
        data: {
          checked: 0,
          newDeathsFound: 0,
          newlyDeceasedActors: [],
          moviesUpdated: 0,
          errors,
        },
      }
    }

    // Fetch person details from TMDB
    log.info("Fetching person details from TMDB")
    const personDetails = await batchGetPersonDetails(relevantIds, 10, 100)
    log.info({ detailCount: personDetails.size }, "Got person details")

    // Process each person to detect new deaths
    let newDeaths = 0
    const newlyDeceasedIds: number[] = []
    const newlyDeceasedActors: DeceasedActorInfo[] = []
    let processedCount = 0

    log.info("Processing people for new deaths")
    for (const [tmdbId, person] of personDetails) {
      processedCount++
      const wasAlreadyDeceased = deceasedTmdbIds.has(tmdbId)

      if (person.deathday && !wasAlreadyDeceased) {
        // NEW DEATH DETECTED!
        log.info({ tmdbId, name: person.name, deathday: person.deathday }, "New death detected")

        try {
          await this.processNewDeath(person)
          newDeaths++
          newlyDeceasedIds.push(tmdbId)

          // Get internal actor ID for result (to avoid redirects in URLs)
          const actorIdResult = await pool.query<{ id: number }>(
            "SELECT id FROM actors WHERE tmdb_id = $1",
            [tmdbId]
          )
          const actorId = actorIdResult.rows[0]?.id

          if (actorId) {
            newlyDeceasedActors.push({
              id: actorId,
              tmdbId: tmdbId,
              name: person.name,
              deathday: person.deathday,
            })
          }

          // Record New Relic event
          newrelic.recordCustomEvent("NewDeathDetected", {
            actorName: person.name,
            tmdbId: tmdbId,
            deathday: person.deathday,
          })
        } catch (error) {
          const errorMsg = `Error processing ${person.name}: ${error}`
          log.error({ error, tmdbId, name: person.name }, "Error processing new death")
          errors.push(errorMsg)

          newrelic.recordCustomEvent("NewDeathProcessingError", {
            actorName: person.name,
            tmdbId: tmdbId,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        await this.delay(50)
      }

      // Update progress
      if (processedCount % 50 === 0) {
        await job.updateProgress(Math.round((processedCount / personDetails.size) * 50))
      }
    }

    // Post-processing for newly deceased actors
    let moviesUpdated = 0
    if (newlyDeceasedIds.length > 0) {
      // Invalidate individual actor caches
      log.info({ count: newlyDeceasedIds.length }, "Invalidating actor caches")

      // Map tmdb_id to actor.id for cache invalidation
      const { rows: actorMappings } = await pool.query<{ id: number; tmdb_id: number }>(
        `SELECT id, tmdb_id FROM actors WHERE tmdb_id = ANY($1)`,
        [newlyDeceasedIds]
      )

      await initRedis()
      let cacheSuccessCount = 0
      for (const actor of actorMappings) {
        try {
          await invalidateActorCacheRequired(actor.id)
          cacheSuccessCount++
        } catch (error) {
          log.error(
            { error, actorId: actor.id, tmdbId: actor.tmdb_id },
            "Error invalidating actor cache"
          )
        }
      }
      log.info({ count: cacheSuccessCount }, "Cleared actor profile caches")

      // Recalculate mortality stats for movies featuring newly deceased actors
      log.info("Finding movies to update mortality stats")
      const { rows: affectedMovies } = await pool.query<{ movie_tmdb_id: number }>(
        `SELECT DISTINCT ama.movie_tmdb_id
         FROM actor_movie_appearances ama
         JOIN actors a ON ama.actor_id = a.id
         WHERE a.tmdb_id = ANY($1)`,
        [newlyDeceasedIds]
      )
      log.info({ count: affectedMovies.length }, "Found movies requiring update")

      const currentYear = new Date().getFullYear()
      let movieProcessedCount = 0

      for (const { movie_tmdb_id: movieId } of affectedMovies) {
        movieProcessedCount++
        const result = await this.updateMovieMortalityStats(movieId, currentYear)
        if (result.error) {
          log.error({ error: result.error, movieId }, "Error updating movie")
          errors.push(result.error)
        } else if (result.updated) {
          moviesUpdated++
        }

        // Update progress (50-100%)
        if (movieProcessedCount % 10 === 0) {
          await job.updateProgress(
            50 + Math.round((movieProcessedCount / affectedMovies.length) * 50)
          )
        }

        await this.delay(250)
      }

      // Queue obscurity calculation for newly deceased actors
      // This will automatically rebuild death caches after completion
      if (newlyDeceasedActors.length > 0) {
        const actorIds = newlyDeceasedActors.map((a) => a.id)
        log.info({ count: actorIds.length, actorIds }, "Queueing actor obscurity calculation job")
        await queueManager.addJob(
          JobType.CALCULATE_ACTOR_OBSCURITY,
          {
            actorIds,
            rebuildCachesOnComplete: true,
          },
          {
            createdBy: "sync-tmdb-people",
          }
        )
      }

      await closeRedis()
    }

    log.info(
      { checked: relevantIds.length, newDeaths, moviesUpdated, errors: errors.length },
      "People sync completed"
    )

    return {
      success: true,
      data: {
        checked: relevantIds.length,
        newDeathsFound: newDeaths,
        newlyDeceasedActors,
        moviesUpdated,
        errors,
      },
    }
  }

  /**
   * Process a newly detected death
   */
  private async processNewDeath(person: TMDBPerson): Promise<void> {
    const birthYear = person.birthday ? new Date(person.birthday).getFullYear() : null

    // Verify death date against Wikidata
    const deathVerification = await verifyDeathDate(person.name, birthYear, person.deathday!)

    // Look up cause of death using Opus 4.5
    const {
      causeOfDeath,
      causeOfDeathSource,
      causeOfDeathDetails,
      causeOfDeathDetailsSource,
      wikipediaUrl,
    } = await getCauseOfDeath(person.name, person.birthday, person.deathday!, "opus")

    // Calculate mortality stats
    const yearsLostResult = await calculateYearsLost(person.birthday, person.deathday!)

    // Create actor record with death date verification info
    const record: ActorInput = {
      tmdb_id: person.id,
      name: person.name,
      birthday: person.birthday,
      deathday: person.deathday!,
      cause_of_death: causeOfDeath,
      cause_of_death_source: causeOfDeathSource,
      cause_of_death_details: causeOfDeathDetails,
      cause_of_death_details_source: causeOfDeathDetailsSource,
      wikipedia_url: wikipediaUrl,
      profile_path: person.profile_path,
      age_at_death: yearsLostResult?.ageAtDeath ?? null,
      expected_lifespan: yearsLostResult?.expectedLifespan ?? null,
      years_lost: yearsLostResult?.yearsLost ?? null,
      deathday_confidence: deathVerification.confidence,
      deathday_verification_source: deathVerification.wikidataDeathDate ? "wikidata" : null,
      deathday_verified_at: new Date().toISOString(),
    }

    await upsertActor(record)
  }

  /**
   * Update mortality stats for a movie
   */
  private async updateMovieMortalityStats(
    movieId: number,
    currentYear: number
  ): Promise<{ updated: boolean; error?: string }> {
    try {
      const [details, credits] = await Promise.all([
        getMovieDetails(movieId),
        getMovieCredits(movieId),
      ])

      const topCast = credits.cast.slice(0, CAST_LIMIT)
      const personIds = topCast.map((c) => c.id)
      const personDetails = await batchGetPersonDetails(personIds, 10, 100)

      const releaseYear = details.release_date ? parseInt(details.release_date.split("-")[0]) : null

      if (!releaseYear) {
        return { updated: false }
      }

      const actorsForMortality = topCast.map((castMember) => {
        const person = personDetails.get(castMember.id)
        return {
          tmdbId: castMember.id,
          name: castMember.name,
          birthday: person?.birthday || null,
          deathday: person?.deathday || null,
        }
      })

      const mortalityStats = await calculateMovieMortality(
        releaseYear,
        actorsForMortality,
        currentYear
      )

      const newRecord: MovieRecord = {
        tmdb_id: movieId,
        title: details.title,
        release_date: details.release_date || null,
        release_year: releaseYear,
        poster_path: details.poster_path,
        genres: details.genres?.map((g) => g.name) || [],
        original_language: details.original_language || null,
        production_countries: details.production_countries?.map((c) => c.iso_3166_1) ?? null,
        popularity: details.popularity || null,
        vote_average: details.vote_average || null,
        cast_count: topCast.length,
        deceased_count: mortalityStats.actualDeaths,
        living_count: topCast.length - mortalityStats.actualDeaths,
        expected_deaths: mortalityStats.expectedDeaths,
        mortality_surprise_score: mortalityStats.mortalitySurpriseScore,
      }

      await upsertMovie(newRecord)

      return { updated: true }
    } catch (error) {
      return {
        updated: false,
        error: `Error updating movie ${movieId}: ${error}`,
      }
    }
  }
}
