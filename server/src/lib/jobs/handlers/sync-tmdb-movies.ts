/**
 * SYNC_TMDB_MOVIES Handler
 *
 * Syncs movie changes from TMDB to update movie metadata and mortality stats.
 * Adapts the syncMovieChanges() function from scripts/sync-tmdb-changes.ts.
 *
 * This handler:
 * 1. Fetches changed movie IDs from TMDB within the date range
 * 2. Filters to movies in our database
 * 3. Updates movie details and recalculates mortality stats
 * 4. Invalidates relevant caches
 */

import type { Job } from "bullmq"
import newrelic from "newrelic"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type SyncTMDBMoviesPayload } from "../types.js"
import { getPool, getAllMovieTmdbIds, upsertMovie, type MovieRecord } from "../../db.js"
import {
  getAllChangedMovieIds,
  batchGetPersonDetails,
  getMovieDetails,
  getMovieCredits,
} from "../../tmdb.js"
import { calculateMovieMortality } from "../../mortality-stats.js"
import { getDateRanges } from "../../date-utils.js"
import { invalidateMovieCaches } from "../../cache.js"
import { initRedis, closeRedis } from "../../redis.js"

const CAST_LIMIT = 30

/**
 * Result from movie sync
 */
export interface SyncTMDBMoviesResult {
  checked: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * Handler for TMDB movie sync jobs
 */
export class SyncTMDBMoviesHandler extends BaseJobHandler<
  SyncTMDBMoviesPayload,
  SyncTMDBMoviesResult
> {
  readonly jobType = JobType.SYNC_TMDB_MOVIES
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the movie sync job
   */
  async process(job: Job<SyncTMDBMoviesPayload>): Promise<JobResult<SyncTMDBMoviesResult>> {
    const log = this.createLogger(job)
    const { startDate, endDate } = job.data

    log.info({ startDate, endDate }, "Starting TMDB movie sync")

    const errors: string[] = []
    const pool = getPool()
    const currentYear = new Date().getFullYear()

    // Get all movies in our database
    log.info("Loading movie IDs from database")
    const movieTmdbIds = await getAllMovieTmdbIds()
    log.info({ movieCount: movieTmdbIds.size }, "Loaded movie IDs")

    // Split into date ranges if needed (max 14 days per TMDB query)
    const dateRanges = getDateRanges(startDate, endDate)
    log.info({ rangeCount: dateRanges.length }, "Querying date ranges")

    // Fetch all changed movie IDs from TMDB
    const allChangedIds: number[] = []
    for (const range of dateRanges) {
      log.debug({ start: range.start, end: range.end }, "Fetching changes for range")
      const ids = await getAllChangedMovieIds(range.start, range.end, 50)
      allChangedIds.push(...ids)
      await this.delay(100)
    }

    // Deduplicate
    const changedIds = [...new Set(allChangedIds)]
    log.info({ changedCount: changedIds.length }, "Found changed movie IDs on TMDB")

    // Filter to movies we care about (in our database)
    const relevantIds = changedIds.filter((id) => movieTmdbIds.has(id))
    log.info({ relevantCount: relevantIds.length }, "Filtered to movies in database")

    if (relevantIds.length === 0) {
      log.info("No relevant movie changes found")
      return {
        success: true,
        data: {
          checked: 0,
          updated: 0,
          skipped: 0,
          errors,
        },
      }
    }

    // Fetch movie titles from database for logging
    const { rows } = await pool.query<{ tmdb_id: number; title: string }>(
      `SELECT tmdb_id, title FROM movies WHERE tmdb_id = ANY($1)`,
      [relevantIds]
    )
    const movieTitles = new Map(rows.map((row) => [row.tmdb_id, row.title]))

    // Process each movie
    let updated = 0
    let skipped = 0
    let processedCount = 0

    log.info("Processing movies")
    for (const movieId of relevantIds) {
      processedCount++
      const movieTitle = movieTitles.get(movieId) || `Movie ${movieId}`

      const result = await this.updateMovieMortalityStats(movieId, currentYear)

      if (result.error) {
        log.error({ error: result.error, movieId, title: movieTitle }, "Error updating movie")
        errors.push(result.error)
      } else if (result.skipped) {
        skipped++
        log.debug({ movieId, title: movieTitle }, "Movie skipped (no changes)")
      } else if (result.updated) {
        updated++
        log.info(
          { movieId, title: movieTitle, changedFields: result.changedFields },
          "Movie updated"
        )
      }

      // Update progress
      if (processedCount % 10 === 0) {
        await job.updateProgress(Math.round((processedCount / relevantIds.length) * 100))
      }

      await this.delay(250)
    }

    // Invalidate movie caches if any were updated
    if (updated > 0) {
      log.info({ count: updated }, "Invalidating movie caches")
      await initRedis()
      await invalidateMovieCaches()
      await closeRedis()

      newrelic.recordCustomEvent("CacheInvalidation", {
        cacheType: "movie-related",
        count: updated,
      })
    }

    log.info(
      { checked: relevantIds.length, updated, skipped, errors: errors.length },
      "Movie sync completed"
    )

    return {
      success: true,
      data: {
        checked: relevantIds.length,
        updated,
        skipped,
        errors,
      },
    }
  }

  /**
   * Update mortality stats for a movie
   * Returns whether update was made, skipped, or errored
   */
  private async updateMovieMortalityStats(
    movieId: number,
    currentYear: number
  ): Promise<{
    updated: boolean
    skipped: boolean
    error?: string
    changedFields?: string[]
  }> {
    try {
      const pool = getPool()

      // Fetch existing movie record to compare changes
      const { rows: existingRows } = await pool.query<MovieRecord>(
        `SELECT * FROM movies WHERE tmdb_id = $1`,
        [movieId]
      )
      const existingMovie = existingRows[0] || null

      const [details, credits] = await Promise.all([
        getMovieDetails(movieId),
        getMovieCredits(movieId),
      ])

      const topCast = credits.cast.slice(0, CAST_LIMIT)
      const personIds = topCast.map((c) => c.id)
      const personDetails = await batchGetPersonDetails(personIds, 10, 100)

      const releaseYear = details.release_date ? parseInt(details.release_date.split("-")[0]) : null

      if (!releaseYear) {
        return { updated: false, skipped: false }
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

      // Track what fields changed
      const changedFields: string[] = []

      if (existingMovie) {
        for (const field of Object.keys(newRecord) as Array<keyof MovieRecord>) {
          if (field === "tmdb_id") continue

          const oldValue = existingMovie[field]
          const newValue = newRecord[field]

          if (this.hasFieldChanged(oldValue, newValue)) {
            changedFields.push(field)
          }
        }

        // If nothing changed, skip the update
        if (changedFields.length === 0) {
          return { updated: false, skipped: true, changedFields: [] }
        }
      }

      await upsertMovie(newRecord)

      return {
        updated: true,
        skipped: false,
        changedFields: existingMovie ? changedFields : undefined,
      }
    } catch (error) {
      return {
        updated: false,
        skipped: false,
        error: `Error updating movie ${movieId}: ${error}`,
      }
    }
  }

  /**
   * Check if a field value has changed
   */
  private hasFieldChanged(oldValue: unknown, newValue: unknown): boolean {
    // Normalize values for comparison
    const normalizedOld = this.normalizeValue(oldValue)
    const normalizedNew = this.normalizeValue(newValue)

    // Handle array comparison
    if (Array.isArray(normalizedOld) && Array.isArray(normalizedNew)) {
      return JSON.stringify(normalizedOld) !== JSON.stringify(normalizedNew)
    }

    // Handle number comparison (with tolerance)
    if (typeof normalizedOld === "number" && typeof normalizedNew === "number") {
      return Math.abs(normalizedOld - normalizedNew) > 0.01
    }

    // Handle other comparisons
    return normalizedOld !== normalizedNew
  }

  /**
   * Normalize a value for comparison
   */
  private normalizeValue(value: unknown): unknown {
    if (value === null || value === undefined) return value

    // Normalize dates - extract just the date portion (YYYY-MM-DD)
    if (value instanceof Date || (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}/))) {
      const dateStr = value instanceof Date ? value.toISOString() : value
      return dateStr.substring(0, 10)
    }

    // Coerce string numbers to actual numbers
    if (typeof value === "string") {
      const num = parseFloat(value)
      if (!isNaN(num) && value.trim() !== "") {
        return num
      }
    }

    return value
  }
}
