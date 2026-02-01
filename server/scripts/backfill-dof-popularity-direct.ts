#!/usr/bin/env tsx
/**
 * Direct backfill of DOF popularity scores (without job queue)
 *
 * Processes movies, shows, and actors directly without using the job queue.
 * Use this for initial backfill or when Redis is not available.
 *
 * Usage:
 *   npx tsx scripts/backfill-dof-popularity-direct.ts                    # Movies only
 *   npx tsx scripts/backfill-dof-popularity-direct.ts --shows            # Shows only
 *   npx tsx scripts/backfill-dof-popularity-direct.ts --actors           # Actors only
 *   npx tsx scripts/backfill-dof-popularity-direct.ts --all              # Everything
 *   npx tsx scripts/backfill-dof-popularity-direct.ts --recalculate      # Recalculate all
 *   npx tsx scripts/backfill-dof-popularity-direct.ts --dry-run          # Preview
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import {
  calculateMoviePopularity,
  calculateShowPopularity,
  calculateActorPopularity,
  isUSUKProduction,
  type EraReferenceStats,
  type ContentPopularityInput,
  type ShowPopularityInput,
  type ActorAppearance,
} from "../src/lib/popularity-score.js"

interface Options {
  shows?: boolean
  actors?: boolean
  all?: boolean
  recalculate?: boolean
  batchSize: number
  dryRun?: boolean
}

const program = new Command()
  .name("backfill-dof-popularity-direct")
  .description("Direct backfill of DOF popularity scores (without job queue)")
  .option("--shows", "Process shows instead of movies")
  .option("--actors", "Process actors (requires content scores first)")
  .option("--all", "Process movies, shows, and actors")
  .option("--recalculate", "Recalculate all, not just missing scores")
  .option("-b, --batch-size <n>", "Batch size for processing", parseInt, 500)
  .option("-n, --dry-run", "Preview without updating database")
  .action(async (options) => {
    await run(options)
  })

async function run(options: Options): Promise<void> {
  const pool = getPool()

  console.log("\n=== DOF Popularity Direct Backfill ===")
  if (options.dryRun) console.log("(DRY RUN - no changes will be made)\n")

  try {
    // Load era stats
    const eraResult = await pool.query<EraReferenceStats>("SELECT * FROM era_reference_stats")
    const eraMap = new Map<number, EraReferenceStats>()
    for (const row of eraResult.rows) {
      eraMap.set(row.year, row)
    }
    console.log(`Loaded ${eraMap.size} years of era reference stats\n`)

    const processMovies = !options.shows && !options.actors
    const processShows = options.shows || options.all
    const processActors = options.actors || options.all

    // Process movies
    if (processMovies || options.all) {
      await backfillMovies(pool, eraMap, options)
    }

    // Process shows
    if (processShows) {
      await backfillShows(pool, eraMap, options)
    }

    // Process actors (must be done after content)
    if (processActors) {
      await backfillActors(pool, options)
    }

    console.log("\n=== Backfill Complete ===\n")
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

async function backfillMovies(
  pool: ReturnType<typeof getPool>,
  eraMap: Map<number, EraReferenceStats>,
  options: Options
): Promise<void> {
  console.log("--- Processing Movies ---")

  const whereClause = options.recalculate ? "" : "WHERE dof_popularity IS NULL"

  // Count total
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM movies ${whereClause}`
  )
  const total = parseInt(countResult.rows[0].count, 10)
  console.log(`Movies to process: ${total.toLocaleString()}`)

  if (total === 0) {
    console.log("No movies need processing.\n")
    return
  }

  let processed = 0
  let updated = 0
  let skipped = 0
  let offset = 0

  const batchSize = Number(options.batchSize) || 500

  while (offset < total) {
    const result = await pool.query(
      `
      SELECT tmdb_id, title, release_year, original_language,
             omdb_box_office_cents::numeric as omdb_box_office_cents,
             trakt_watchers, trakt_plays,
             omdb_imdb_votes, tmdb_popularity, production_countries,
             omdb_awards_wins, omdb_awards_nominations, aggregate_score
      FROM movies
      ${whereClause}
      ORDER BY tmdb_id
      LIMIT $1 OFFSET $2
    `,
      [batchSize, offset]
    )

    if (result.rows.length === 0) break

    for (const movie of result.rows) {
      processed++
      const eraStats = movie.release_year ? (eraMap.get(movie.release_year) ?? null) : null

      try {
        // Safely parse numeric values
        const safeNumber = (val: unknown): number | null => {
          if (val === null || val === undefined) return null
          const num = Number(val)
          return isNaN(num) || !isFinite(num) ? null : num
        }

        const input: ContentPopularityInput = {
          releaseYear: movie.release_year,
          boxOfficeCents: safeNumber(movie.omdb_box_office_cents),
          traktWatchers: safeNumber(movie.trakt_watchers),
          traktPlays: safeNumber(movie.trakt_plays),
          imdbVotes: safeNumber(movie.omdb_imdb_votes),
          tmdbPopularity: safeNumber(movie.tmdb_popularity),
          isUSUKProduction: isUSUKProduction(movie.production_countries),
          originalLanguage: movie.original_language,
          awardsWins: safeNumber(movie.omdb_awards_wins),
          awardsNominations: safeNumber(movie.omdb_awards_nominations),
          aggregateScore: safeNumber(movie.aggregate_score),
          eraStats,
        }

        const popResult = calculateMoviePopularity(input)

        if (popResult.dofPopularity !== null && !isNaN(popResult.dofPopularity)) {
          if (!options.dryRun) {
            await pool.query(
              `
              UPDATE movies
              SET dof_popularity = $1,
                  dof_weight = $2,
                  dof_popularity_confidence = $3,
                  dof_popularity_updated_at = NOW()
              WHERE tmdb_id = $4
            `,
              [popResult.dofPopularity, popResult.dofWeight, popResult.confidence, movie.tmdb_id]
            )
          }
          updated++
        } else {
          skipped++
        }
      } catch (err) {
        // Log error but continue processing
        console.error(`\n  Error processing movie ${movie.tmdb_id}: ${err}`)
        skipped++
      }
    }

    offset += batchSize
    const pct = ((processed / total) * 100).toFixed(1)
    process.stdout.write(
      `\r  Progress: ${processed.toLocaleString()}/${total.toLocaleString()} (${pct}%) - Updated: ${updated.toLocaleString()}, Skipped: ${skipped.toLocaleString()}`
    )
  }

  console.log(
    `\n  Movies complete: ${updated.toLocaleString()} updated, ${skipped.toLocaleString()} skipped\n`
  )
}

async function backfillShows(
  pool: ReturnType<typeof getPool>,
  eraMap: Map<number, EraReferenceStats>,
  options: Options
): Promise<void> {
  console.log("--- Processing Shows ---")

  const whereClause = options.recalculate ? "" : "WHERE dof_popularity IS NULL"

  // Count total
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM shows ${whereClause}`
  )
  const total = parseInt(countResult.rows[0].count, 10)
  console.log(`Shows to process: ${total.toLocaleString()}`)

  if (total === 0) {
    console.log("No shows need processing.\n")
    return
  }

  let processed = 0
  let updated = 0
  let skipped = 0
  let offset = 0
  const batchSize = Number(options.batchSize) || 500

  while (offset < total) {
    const result = await pool.query(
      `
      SELECT tmdb_id, name, first_air_date, original_language,
             trakt_watchers, trakt_plays,
             omdb_imdb_votes, tmdb_popularity, origin_country,
             omdb_awards_wins, omdb_awards_nominations, aggregate_score,
             number_of_seasons, number_of_episodes
      FROM shows
      ${whereClause}
      ORDER BY tmdb_id
      LIMIT $1 OFFSET $2
    `,
      [batchSize, offset]
    )

    if (result.rows.length === 0) break

    for (const show of result.rows) {
      processed++
      const releaseYear = show.first_air_date ? new Date(show.first_air_date).getFullYear() : null
      const eraStats = releaseYear ? (eraMap.get(releaseYear) ?? null) : null

      try {
        // Safely parse numeric values
        const safeNumber = (val: unknown): number | null => {
          if (val === null || val === undefined) return null
          const num = Number(val)
          return isNaN(num) || !isFinite(num) ? null : num
        }

        const input: ShowPopularityInput = {
          releaseYear,
          boxOfficeCents: null,
          traktWatchers: safeNumber(show.trakt_watchers),
          traktPlays: safeNumber(show.trakt_plays),
          imdbVotes: safeNumber(show.omdb_imdb_votes),
          tmdbPopularity: safeNumber(show.tmdb_popularity),
          isUSUKProduction: isUSUKProduction(show.origin_country),
          originalLanguage: show.original_language,
          awardsWins: safeNumber(show.omdb_awards_wins),
          awardsNominations: safeNumber(show.omdb_awards_nominations),
          aggregateScore: safeNumber(show.aggregate_score),
          eraStats,
          numberOfSeasons: show.number_of_seasons,
          numberOfEpisodes: show.number_of_episodes,
        }

        const popResult = calculateShowPopularity(input)

        if (popResult.dofPopularity !== null && !isNaN(popResult.dofPopularity)) {
          if (!options.dryRun) {
            await pool.query(
              `
              UPDATE shows
              SET dof_popularity = $1,
                  dof_weight = $2,
                  dof_popularity_confidence = $3,
                  dof_popularity_updated_at = NOW()
              WHERE tmdb_id = $4
            `,
              [popResult.dofPopularity, popResult.dofWeight, popResult.confidence, show.tmdb_id]
            )
          }
          updated++
        } else {
          skipped++
        }
      } catch (err) {
        console.error(`\n  Error processing show ${show.tmdb_id}: ${err}`)
        skipped++
      }
    }

    offset += batchSize
    const pct = ((processed / total) * 100).toFixed(1)
    process.stdout.write(
      `\r  Progress: ${processed.toLocaleString()}/${total.toLocaleString()} (${pct}%) - Updated: ${updated.toLocaleString()}, Skipped: ${skipped.toLocaleString()}`
    )
  }

  console.log(
    `\n  Shows complete: ${updated.toLocaleString()} updated, ${skipped.toLocaleString()} skipped\n`
  )
}

async function backfillActors(pool: ReturnType<typeof getPool>, options: Options): Promise<void> {
  console.log("--- Processing Actors ---")

  const whereClause = options.recalculate ? "" : "WHERE dof_popularity IS NULL"

  // Count total
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM actors ${whereClause}`
  )
  const total = parseInt(countResult.rows[0].count, 10)
  console.log(`Actors to process: ${total.toLocaleString()}`)

  if (total === 0) {
    console.log("No actors need processing.\n")
    return
  }

  let processed = 0
  let updated = 0
  let skipped = 0
  let offset = 0
  const batchSize = Number(options.batchSize) || 500

  while (offset < total) {
    const actorsResult = await pool.query(
      `
      SELECT id, name, tmdb_popularity
      FROM actors
      ${whereClause}
      ORDER BY id
      LIMIT $1 OFFSET $2
    `,
      [batchSize, offset]
    )

    if (actorsResult.rows.length === 0) break

    for (const actor of actorsResult.rows) {
      processed++

      // Get movie appearances
      const movieAppearances = await pool.query<{
        dof_popularity: string | null
        dof_weight: string | null
        billing_order: number | null
      }>(
        `
        SELECT m.dof_popularity, m.dof_weight, ama.billing_order
        FROM actor_movie_appearances ama
        JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
        WHERE ama.actor_id = $1
      `,
        [actor.id]
      )

      // Get show appearances (grouped by show with episode count)
      const showAppearances = await pool.query<{
        dof_popularity: string | null
        dof_weight: string | null
        billing_order: number | null
        episode_count: string | null
      }>(
        `
        SELECT s.dof_popularity, s.dof_weight,
               MIN(asa.billing_order) as billing_order,
               COUNT(*)::text as episode_count
        FROM actor_show_appearances asa
        JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
        WHERE asa.actor_id = $1
        GROUP BY s.tmdb_id, s.dof_popularity, s.dof_weight
      `,
        [actor.id]
      )

      const appearances: ActorAppearance[] = [
        ...movieAppearances.rows.map((r) => ({
          contentDofPopularity: r.dof_popularity ? Number(r.dof_popularity) : null,
          contentDofWeight: r.dof_weight ? Number(r.dof_weight) : null,
          billingOrder: r.billing_order,
          episodeCount: null,
          isMovie: true,
        })),
        ...showAppearances.rows.map((r) => ({
          contentDofPopularity: r.dof_popularity ? Number(r.dof_popularity) : null,
          contentDofWeight: r.dof_weight ? Number(r.dof_weight) : null,
          billingOrder: r.billing_order,
          episodeCount: r.episode_count ? Number(r.episode_count) : null,
          isMovie: false,
        })),
      ]

      const popResult = calculateActorPopularity({
        appearances,
        tmdbPopularity: actor.tmdb_popularity,
      })

      if (popResult.dofPopularity !== null) {
        if (!options.dryRun) {
          await pool.query(
            `
            UPDATE actors
            SET dof_popularity = $1,
                dof_popularity_confidence = $2,
                dof_popularity_updated_at = NOW()
            WHERE id = $3
          `,
            [popResult.dofPopularity, popResult.confidence, actor.id]
          )
        }
        updated++
      } else {
        skipped++
      }
    }

    offset += batchSize
    const pct = ((processed / total) * 100).toFixed(1)
    process.stdout.write(
      `\r  Progress: ${processed.toLocaleString()}/${total.toLocaleString()} (${pct}%) - Updated: ${updated.toLocaleString()}, Skipped: ${skipped.toLocaleString()}`
    )
  }

  console.log(
    `\n  Actors complete: ${updated.toLocaleString()} updated, ${skipped.toLocaleString()} skipped\n`
  )
}

program.parse()
