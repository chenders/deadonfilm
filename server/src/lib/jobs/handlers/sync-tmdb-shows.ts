/**
 * SYNC_TMDB_SHOWS Handler
 *
 * Syncs active TV shows to detect new episodes.
 * Adapts the syncActiveShowEpisodes() function from scripts/sync-tmdb-changes.ts.
 *
 * This handler:
 * 1. Queries active ("Returning Series") shows from database
 * 2. Checks each show for new seasons/episodes on TMDB
 * 3. Upserts new seasons and episodes
 */

import type { Job } from "bullmq"
import { BaseJobHandler } from "./base.js"
import { JobType, QueueName, type JobResult, type SyncTMDBShowsPayload } from "../types.js"
import {
  getPool,
  upsertSeason,
  upsertEpisode,
  type SeasonRecord,
  type EpisodeRecord,
} from "../../db.js"
import { getTVShowDetails, getSeasonDetails } from "../../tmdb.js"

/**
 * Active show from database
 */
interface ActiveShow {
  tmdb_id: number
  name: string
  number_of_seasons: number | null
}

/**
 * Existing episode from database
 */
interface ExistingEpisode {
  season_number: number
  episode_number: number
}

/**
 * Result from show sync
 */
export interface SyncTMDBShowsResult {
  checked: number
  newEpisodesFound: number
  errors: string[]
}

/**
 * Handler for TMDB show sync jobs
 */
export class SyncTMDBShowsHandler extends BaseJobHandler<
  SyncTMDBShowsPayload,
  SyncTMDBShowsResult
> {
  readonly jobType = JobType.SYNC_TMDB_SHOWS
  readonly queueName = QueueName.MAINTENANCE

  /**
   * Process the show sync job
   */
  async process(job: Job<SyncTMDBShowsPayload>): Promise<JobResult<SyncTMDBShowsResult>> {
    const log = this.createLogger(job)

    log.info("Starting TMDB show sync")

    const errors: string[] = []
    const pool = getPool()

    // Get all active (Returning Series) shows from our database
    log.info("Loading active shows from database")
    const { rows: activeShows } = await pool.query<ActiveShow>(
      `SELECT tmdb_id, name, number_of_seasons
       FROM shows
       WHERE status = 'Returning Series'
       ORDER BY popularity DESC NULLS LAST`
    )
    log.info({ showCount: activeShows.length }, "Found active shows")

    if (activeShows.length === 0) {
      log.info("No active shows to sync")
      return {
        success: true,
        data: {
          checked: 0,
          newEpisodesFound: 0,
          errors,
        },
      }
    }

    let totalNewEpisodes = 0
    let showsChecked = 0

    log.info("Processing shows")
    for (const show of activeShows) {
      try {
        // Get current show details from TMDB
        const showDetails = await getTVShowDetails(show.tmdb_id)
        await this.delay(50)

        // Get existing episodes from our database
        const { rows: existingEpisodes } = await pool.query<ExistingEpisode>(
          `SELECT season_number, episode_number FROM episodes WHERE show_tmdb_id = $1`,
          [show.tmdb_id]
        )
        const existingSet = new Set(
          existingEpisodes.map((e) => `${e.season_number}-${e.episode_number}`)
        )

        // Check each season for new episodes
        for (const seasonSummary of showDetails.seasons) {
          // Skip specials (season 0)
          if (seasonSummary.season_number === 0) continue

          try {
            const seasonDetails = await getSeasonDetails(show.tmdb_id, seasonSummary.season_number)
            await this.delay(50)

            // Check for new episodes
            for (const ep of seasonDetails.episodes) {
              const key = `${ep.season_number}-${ep.episode_number}`
              if (!existingSet.has(key)) {
                // New episode found!
                log.info(
                  {
                    showName: show.name,
                    season: ep.season_number,
                    episode: ep.episode_number,
                    episodeName: ep.name,
                  },
                  "New episode found"
                )

                // Upsert season first (in case it's also new)
                const seasonRecord: SeasonRecord = {
                  show_tmdb_id: show.tmdb_id,
                  season_number: seasonSummary.season_number,
                  name: seasonSummary.name,
                  air_date: seasonSummary.air_date,
                  episode_count: seasonSummary.episode_count,
                  poster_path: seasonSummary.poster_path,
                  cast_count: null,
                  deceased_count: null,
                  expected_deaths: null,
                  mortality_surprise_score: null,
                }
                await upsertSeason(seasonRecord)

                // Upsert episode
                const episodeRecord: EpisodeRecord = {
                  show_tmdb_id: show.tmdb_id,
                  season_number: ep.season_number,
                  episode_number: ep.episode_number,
                  name: ep.name,
                  air_date: ep.air_date,
                  runtime: ep.runtime,
                  cast_count: null,
                  deceased_count: null,
                  guest_star_count: ep.guest_stars?.length || null,
                  expected_deaths: null,
                  mortality_surprise_score: null,
                }
                await upsertEpisode(episodeRecord)

                totalNewEpisodes++
              }
            }
          } catch (seasonError) {
            const errorMsg = `Error fetching season ${seasonSummary.season_number} for ${show.name}: ${seasonError}`
            log.error(
              {
                error: seasonError,
                showName: show.name,
                season: seasonSummary.season_number,
              },
              "Error fetching season"
            )
            errors.push(errorMsg)
          }
        }

        showsChecked++

        // Update progress
        if (showsChecked % 5 === 0) {
          await job.updateProgress(Math.round((showsChecked / activeShows.length) * 100))
        }

        // Delay between shows
        await this.delay(100)
      } catch (showError) {
        const errorMsg = `Error processing show ${show.name}: ${showError}`
        log.error({ error: showError, showName: show.name }, "Error processing show")
        errors.push(errorMsg)
      }
    }

    log.info(
      { checked: showsChecked, newEpisodes: totalNewEpisodes, errors: errors.length },
      "Show sync completed"
    )

    return {
      success: true,
      data: {
        checked: showsChecked,
        newEpisodesFound: totalNewEpisodes,
        errors,
      },
    }
  }
}
