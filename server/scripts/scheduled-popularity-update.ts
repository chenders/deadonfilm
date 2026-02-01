#!/usr/bin/env tsx
/**
 * Scheduled DOF popularity score recalculation
 *
 * This script is intended to be run on a weekly schedule (e.g., Sunday 3 AM).
 * It recalculates popularity scores for all movies, shows, and actors.
 *
 * Recommended schedule (cron format):
 *   0 3 * * 0 cd /app && npx tsx scripts/scheduled-popularity-update.ts >> /var/log/popularity-update.log 2>&1
 *
 * Usage:
 *   npx tsx scripts/scheduled-popularity-update.ts              # Full update
 *   npx tsx scripts/scheduled-popularity-update.ts --movies     # Movies only
 *   npx tsx scripts/scheduled-popularity-update.ts --shows      # Shows only
 *   npx tsx scripts/scheduled-popularity-update.ts --actors     # Actors only
 *   npx tsx scripts/scheduled-popularity-update.ts --dry-run    # Preview
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { startCronjobRun, completeCronjobRun } from "../src/lib/cronjob-tracking.js"
import {
  calculateMoviePopularity,
  calculateShowPopularity,
  isUSUKProduction,
  logPercentile,
  type EraReferenceStats,
  type ContentPopularityInput,
  type ShowPopularityInput,
} from "../src/lib/popularity-score.js"

const JOB_NAME = "scheduled-popularity-update"

// Constants for actor calculation
const ACTOR_FILMOGRAPHY_WEIGHT = 0.7
const ACTOR_TMDB_RECENCY_WEIGHT = 0.3
const MIN_APPEARANCES_FULL_CONFIDENCE = 10
const TMDB_POPULARITY_THRESHOLDS = { p25: 5, p50: 15, p75: 40, p90: 100, p99: 500 }

interface Options {
  movies?: boolean
  shows?: boolean
  actors?: boolean
  batchSize: number
  dryRun?: boolean
}

interface UpdateStats {
  moviesUpdated: number
  showsUpdated: number
  actorsUpdated: number
  errors: number
  startTime: Date
  endTime?: Date
}

const program = new Command()
  .name("scheduled-popularity-update")
  .description("Scheduled recalculation of DOF popularity scores")
  .option("--movies", "Update movies only")
  .option("--shows", "Update shows only")
  .option("--actors", "Update actors only")
  .option("-b, --batch-size <n>", "Batch size for processing", parseInt, 1000)
  .option("-n, --dry-run", "Preview without updating database")
  .action(async (options) => {
    await run(options)
  })

async function run(options: Options): Promise<void> {
  const pool = getPool()
  const stats: UpdateStats = {
    moviesUpdated: 0,
    showsUpdated: 0,
    actorsUpdated: 0,
    errors: 0,
    startTime: new Date(),
  }

  // Determine what to update
  const updateAll = !options.movies && !options.shows && !options.actors
  const updateMovies = options.movies || updateAll
  const updateShows = options.shows || updateAll
  const updateActors = options.actors || updateAll

  console.log("\n=== Scheduled DOF Popularity Update ===")
  console.log(`Started at: ${stats.startTime.toISOString()}`)
  if (options.dryRun) console.log("(DRY RUN - no changes will be made)")
  console.log(
    `Updating: ${[updateMovies && "movies", updateShows && "shows", updateActors && "actors"].filter(Boolean).join(", ")}\n`
  )

  let runId: number | undefined

  try {
    // Track the cronjob run
    if (!options.dryRun) {
      runId = await startCronjobRun(pool, JOB_NAME)
    }

    // Load era reference stats for content scoring
    const eraResult = await pool.query<EraReferenceStats>("SELECT * FROM era_reference_stats")
    const eraMap = new Map<number, EraReferenceStats>()
    for (const row of eraResult.rows) {
      eraMap.set(row.year, row)
    }
    console.log(`Loaded ${eraMap.size} years of era reference stats\n`)

    // Update movies
    if (updateMovies) {
      console.log("=== Updating Movie Popularity ===")
      stats.moviesUpdated = await updateMoviePopularity(pool, eraMap, options)
      console.log(`Movies updated: ${stats.moviesUpdated}\n`)
    }

    // Update shows
    if (updateShows) {
      console.log("=== Updating Show Popularity ===")
      stats.showsUpdated = await updateShowPopularity(pool, eraMap, options)
      console.log(`Shows updated: ${stats.showsUpdated}\n`)
    }

    // Update actors (after content, since actor scores depend on content scores)
    if (updateActors) {
      console.log("=== Updating Actor Popularity ===")
      stats.actorsUpdated = await updateActorPopularity(pool, options)
      console.log(`Actors updated: ${stats.actorsUpdated}\n`)
    }

    stats.endTime = new Date()
    const durationMs = stats.endTime.getTime() - stats.startTime.getTime()

    console.log("=== Summary ===")
    console.log(`Movies updated: ${stats.moviesUpdated}`)
    console.log(`Shows updated: ${stats.showsUpdated}`)
    console.log(`Actors updated: ${stats.actorsUpdated}`)
    console.log(`Errors: ${stats.errors}`)
    console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`)
    console.log(`Completed at: ${stats.endTime.toISOString()}`)

    // Complete cronjob tracking
    if (runId) {
      await completeCronjobRun(pool, runId, "success")
    }
  } catch (error) {
    console.error("Fatal error during popularity update:", error)
    stats.errors++

    if (runId) {
      await completeCronjobRun(
        pool,
        runId,
        "failure",
        error instanceof Error ? error.message : String(error)
      )
    }

    process.exit(1)
  } finally {
    await pool.end()
  }
}

interface MovieRow {
  id: number
  release_year: number | null
  tmdb_popularity: number | null
  budget_cents: number | null
  revenue_cents: number | null
  imdb_votes: number | null
  trakt_watchers: number | null
  trakt_plays: number | null
  aggregate_score: number | null
  production_countries: string[] | null
  oscar_wins: number | null
  oscar_nominations: number | null
  original_language: string | null
}

async function updateMoviePopularity(
  pool: ReturnType<typeof getPool>,
  eraMap: Map<number, EraReferenceStats>,
  options: Options
): Promise<number> {
  const batchSize = options.batchSize

  // Get all movies that need updating
  const movieResult = await pool.query<MovieRow>(`
    SELECT
      m.id,
      EXTRACT(YEAR FROM m.release_date)::int as release_year,
      m.tmdb_popularity::float as tmdb_popularity,
      m.budget_cents,
      m.revenue_cents,
      m.imdb_votes::int as imdb_votes,
      m.trakt_watchers::int as trakt_watchers,
      m.trakt_plays::int as trakt_plays,
      m.aggregate_score::float as aggregate_score,
      m.production_countries,
      m.oscar_wins::int as oscar_wins,
      m.oscar_nominations::int as oscar_nominations,
      m.original_language
    FROM movies m
    WHERE m.release_date IS NOT NULL
    ORDER BY m.id
  `)

  console.log(`Processing ${movieResult.rows.length} movies...`)

  let updated = 0
  const updates: { id: number; popularity: number; weight: number; confidence: number }[] = []

  for (const movie of movieResult.rows) {
    const era = movie.release_year ? (eraMap.get(movie.release_year) ?? null) : null
    const isUSUK = isUSUKProduction(movie.production_countries)

    // Build the input structure
    const input: ContentPopularityInput = {
      releaseYear: movie.release_year,
      boxOfficeCents: movie.revenue_cents,
      traktWatchers: movie.trakt_watchers,
      traktPlays: movie.trakt_plays,
      imdbVotes: movie.imdb_votes,
      tmdbPopularity: movie.tmdb_popularity,
      isUSUKProduction: isUSUK,
      originalLanguage: movie.original_language,
      awardsWins: movie.oscar_wins,
      awardsNominations: movie.oscar_nominations,
      aggregateScore: movie.aggregate_score,
      eraStats: era,
    }

    const result = calculateMoviePopularity(input)

    if (result.dofPopularity !== null) {
      updates.push({
        id: movie.id,
        popularity: result.dofPopularity,
        weight: result.dofWeight ?? 0,
        confidence: result.confidence,
      })
    }

    // Batch update
    if (updates.length >= batchSize) {
      if (!options.dryRun) {
        await batchUpdateMovies(pool, updates)
      }
      updated += updates.length
      process.stdout.write(`\rUpdated ${updated} movies...`)
      updates.length = 0
    }
  }

  // Final batch
  if (updates.length > 0) {
    if (!options.dryRun) {
      await batchUpdateMovies(pool, updates)
    }
    updated += updates.length
  }

  console.log(`\rUpdated ${updated} movies    `)
  return updated
}

async function batchUpdateMovies(
  pool: ReturnType<typeof getPool>,
  updates: { id: number; popularity: number; weight: number; confidence: number }[]
): Promise<void> {
  await pool.query(
    `
    UPDATE movies m SET
      dof_popularity = u.popularity,
      dof_weight = u.weight,
      dof_popularity_confidence = u.confidence,
      dof_popularity_updated_at = NOW()
    FROM (
      SELECT unnest($1::int[]) as id,
             unnest($2::numeric[]) as popularity,
             unnest($3::numeric[]) as weight,
             unnest($4::numeric[]) as confidence
    ) u
    WHERE m.id = u.id
    `,
    [
      updates.map((u) => u.id),
      updates.map((u) => u.popularity),
      updates.map((u) => u.weight),
      updates.map((u) => u.confidence),
    ]
  )
}

interface ShowRow {
  id: number
  release_year: number | null
  tmdb_popularity: number | null
  imdb_votes: number | null
  trakt_watchers: number | null
  trakt_plays: number | null
  aggregate_score: number | null
  production_countries: string[] | null
  number_of_seasons: number | null
  number_of_episodes: number | null
  original_language: string | null
}

async function updateShowPopularity(
  pool: ReturnType<typeof getPool>,
  eraMap: Map<number, EraReferenceStats>,
  options: Options
): Promise<number> {
  const batchSize = options.batchSize

  const showResult = await pool.query<ShowRow>(`
    SELECT
      s.id,
      EXTRACT(YEAR FROM s.first_air_date)::int as release_year,
      s.tmdb_popularity::float as tmdb_popularity,
      s.imdb_votes::int as imdb_votes,
      s.trakt_watchers::int as trakt_watchers,
      s.trakt_plays::int as trakt_plays,
      s.aggregate_score::float as aggregate_score,
      s.origin_country as production_countries,
      s.number_of_seasons::int as number_of_seasons,
      s.number_of_episodes::int as number_of_episodes,
      s.original_language
    FROM shows s
    WHERE s.first_air_date IS NOT NULL
    ORDER BY s.id
  `)

  console.log(`Processing ${showResult.rows.length} shows...`)

  let updated = 0
  const updates: { id: number; popularity: number; weight: number; confidence: number }[] = []

  for (const show of showResult.rows) {
    const era = show.release_year ? (eraMap.get(show.release_year) ?? null) : null
    const isUSUK = isUSUKProduction(show.production_countries)

    // Build the input structure
    const input: ShowPopularityInput = {
      releaseYear: show.release_year,
      boxOfficeCents: null, // Shows don't have box office
      traktWatchers: show.trakt_watchers,
      traktPlays: show.trakt_plays,
      imdbVotes: show.imdb_votes,
      tmdbPopularity: show.tmdb_popularity,
      isUSUKProduction: isUSUK,
      originalLanguage: show.original_language,
      awardsWins: null,
      awardsNominations: null,
      aggregateScore: show.aggregate_score,
      eraStats: era,
      numberOfSeasons: show.number_of_seasons,
      numberOfEpisodes: show.number_of_episodes,
    }

    const result = calculateShowPopularity(input)

    if (result.dofPopularity !== null) {
      updates.push({
        id: show.id,
        popularity: result.dofPopularity,
        weight: result.dofWeight ?? 0,
        confidence: result.confidence,
      })
    }

    if (updates.length >= batchSize) {
      if (!options.dryRun) {
        await batchUpdateShows(pool, updates)
      }
      updated += updates.length
      process.stdout.write(`\rUpdated ${updated} shows...`)
      updates.length = 0
    }
  }

  if (updates.length > 0) {
    if (!options.dryRun) {
      await batchUpdateShows(pool, updates)
    }
    updated += updates.length
  }

  console.log(`\rUpdated ${updated} shows    `)
  return updated
}

async function batchUpdateShows(
  pool: ReturnType<typeof getPool>,
  updates: { id: number; popularity: number; weight: number; confidence: number }[]
): Promise<void> {
  await pool.query(
    `
    UPDATE shows s SET
      dof_popularity = u.popularity,
      dof_weight = u.weight,
      dof_popularity_confidence = u.confidence,
      dof_popularity_updated_at = NOW()
    FROM (
      SELECT unnest($1::int[]) as id,
             unnest($2::numeric[]) as popularity,
             unnest($3::numeric[]) as weight,
             unnest($4::numeric[]) as confidence
    ) u
    WHERE s.id = u.id
    `,
    [
      updates.map((u) => u.id),
      updates.map((u) => u.popularity),
      updates.map((u) => u.weight),
      updates.map((u) => u.confidence),
    ]
  )
}

async function updateActorPopularity(
  pool: ReturnType<typeof getPool>,
  options: Options
): Promise<number> {
  const batchSize = options.batchSize

  // Efficient SQL aggregation for all actors
  interface ActorAggregatedData {
    actor_id: number
    tmdb_popularity: string | null
    filmography_sum: string | null
    filmography_count: string | null
  }

  const result = await pool.query<ActorAggregatedData>(`
    WITH movie_contributions AS (
      SELECT
        ama.actor_id,
        SUM(
          (COALESCE(m.dof_popularity, 0) * 0.6 + COALESCE(m.dof_weight, 0) * 0.4)
          *
          CASE
            WHEN ama.billing_order IS NULL THEN 0.4
            WHEN ama.billing_order <= 3 THEN 1.0
            WHEN ama.billing_order <= 10 THEN 0.7
            ELSE 0.4
          END
        ) as contribution,
        COUNT(*) as appearance_count
      FROM actor_movie_appearances ama
      JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
      WHERE m.dof_popularity IS NOT NULL
      GROUP BY ama.actor_id
    ),
    show_contributions_per_show AS (
      SELECT
        asa.actor_id,
        asa.show_tmdb_id,
        (COALESCE(s.dof_popularity, 0) * 0.6 + COALESCE(s.dof_weight, 0) * 0.4)
        *
        CASE
          WHEN MIN(asa.billing_order) IS NULL THEN 0.4
          WHEN MIN(asa.billing_order) <= 3 THEN 1.0
          WHEN MIN(asa.billing_order) <= 10 THEN 0.7
          ELSE 0.4
        END
        *
        LEAST(1.0, COUNT(*)::float / 20.0) as contribution
      FROM actor_show_appearances asa
      JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
      WHERE s.dof_popularity IS NOT NULL
      GROUP BY asa.actor_id, asa.show_tmdb_id, s.dof_popularity, s.dof_weight
    ),
    show_contributions AS (
      SELECT
        actor_id,
        SUM(contribution) as contribution,
        COUNT(*) as appearance_count
      FROM show_contributions_per_show
      GROUP BY actor_id
    ),
    combined AS (
      SELECT
        a.id as actor_id,
        a.tmdb_popularity,
        COALESCE(mc.contribution, 0) + COALESCE(sc.contribution, 0) as filmography_sum,
        COALESCE(mc.appearance_count, 0) + COALESCE(sc.appearance_count, 0) as filmography_count
      FROM actors a
      LEFT JOIN movie_contributions mc ON mc.actor_id = a.id
      LEFT JOIN show_contributions sc ON sc.actor_id = a.id
      WHERE a.deathday IS NOT NULL
        AND (mc.contribution IS NOT NULL OR sc.contribution IS NOT NULL)
    )
    SELECT actor_id, tmdb_popularity::text, filmography_sum::text, filmography_count::text
    FROM combined
    ORDER BY actor_id
  `)

  console.log(`Processing ${result.rows.length} actors...`)

  let updated = 0
  const updates: { id: number; popularity: number; confidence: number }[] = []

  for (const row of result.rows) {
    const filmographySum = parseFloat(row.filmography_sum || "0")
    const filmographyCount = parseInt(row.filmography_count || "0", 10)
    const tmdbPopularity = row.tmdb_popularity ? parseFloat(row.tmdb_popularity) : 0

    if (filmographyCount === 0) continue

    // Normalize filmography contribution
    const normalizedFilmography = Math.min(filmographySum / 10, 100)

    // Calculate TMDB recency component (default to 0 if null)
    const tmdbPercentile = logPercentile(tmdbPopularity, TMDB_POPULARITY_THRESHOLDS)
    const tmdbComponent = (tmdbPercentile ?? 0) * 100

    // Weighted combination
    const popularity =
      normalizedFilmography * ACTOR_FILMOGRAPHY_WEIGHT + tmdbComponent * ACTOR_TMDB_RECENCY_WEIGHT

    // Confidence based on appearance count
    const confidence = Math.min(1.0, filmographyCount / MIN_APPEARANCES_FULL_CONFIDENCE)

    updates.push({
      id: row.actor_id,
      popularity: Math.min(100, Math.max(0, popularity)),
      confidence,
    })

    if (updates.length >= batchSize) {
      if (!options.dryRun) {
        await batchUpdateActors(pool, updates)
      }
      updated += updates.length
      process.stdout.write(`\rUpdated ${updated} actors...`)
      updates.length = 0
    }
  }

  if (updates.length > 0) {
    if (!options.dryRun) {
      await batchUpdateActors(pool, updates)
    }
    updated += updates.length
  }

  console.log(`\rUpdated ${updated} actors    `)
  return updated
}

async function batchUpdateActors(
  pool: ReturnType<typeof getPool>,
  updates: { id: number; popularity: number; confidence: number }[]
): Promise<void> {
  await pool.query(
    `
    UPDATE actors a SET
      dof_popularity = u.popularity,
      dof_popularity_confidence = u.confidence,
      dof_popularity_updated_at = NOW()
    FROM (
      SELECT unnest($1::int[]) as id,
             unnest($2::numeric[]) as popularity,
             unnest($3::numeric[]) as confidence
    ) u
    WHERE a.id = u.id
    `,
    [updates.map((u) => u.id), updates.map((u) => u.popularity), updates.map((u) => u.confidence)]
  )
}

program.parse()
