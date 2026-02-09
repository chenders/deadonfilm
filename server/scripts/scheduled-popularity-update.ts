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
 *   npx tsx scripts/scheduled-popularity-update.ts --force      # Allow manual re-run after algorithm changes
 */

import "dotenv/config"
import { Command } from "commander"
import { getPool } from "../src/lib/db.js"
import { startCronjobRun, completeCronjobRun } from "../src/lib/cronjob-tracking.js"
import {
  calculateMoviePopularity,
  calculateShowPopularity,
  calculateActorPopularity,
  isUSUKProduction,
  ALGORITHM_VERSION,
  type EraReferenceStats,
  type ContentPopularityInput,
  type ShowPopularityInput,
  type ActorAppearance,
} from "../src/lib/popularity-score.js"
import { fetchActorPageviews } from "../src/lib/wikipedia-pageviews.js"
import { fetchSitelinksBatch, fetchSitelinksByWikipediaUrl } from "../src/lib/wikidata-sitelinks.js"
import {
  recordActorSnapshots,
  recordMovieSnapshots,
  recordShowSnapshots,
  type ContentSnapshotUpdate,
  type ActorSnapshotUpdate,
} from "../src/lib/popularity-history.js"

const JOB_NAME = "scheduled-popularity-update"

// Batch size for filmography queries
const ACTOR_FILMOGRAPHY_BATCH_SIZE = 500

interface Options {
  movies?: boolean
  shows?: boolean
  actors?: boolean
  batchSize: number
  dryRun?: boolean
  force?: boolean
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
  .option(
    "-b, --batch-size <n>",
    "Batch size for DB writes and snapshot flushes (actors use fixed 500 for filmography queries)",
    parseInt,
    1000
  )
  .option("-n, --dry-run", "Preview without updating database")
  .option("-f, --force", "Allow manual re-run after algorithm changes")
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
  console.log(`Algorithm version: ${ALGORITHM_VERSION}`)
  console.log(`Started at: ${stats.startTime.toISOString()}`)
  if (options.dryRun) console.log("(DRY RUN - no changes will be made)")
  if (options.force) console.log("(FORCE - manual re-run after algorithm change)")
  console.log(
    `Updating: ${[updateMovies && "movies", updateShows && "shows", updateActors && "actors"].filter(Boolean).join(", ")}\n`
  )

  let runId: number | null = null
  // Capture snapshot date once at run start to avoid midnight-crossing issues
  const snapshotDate = new Date().toISOString().slice(0, 10)

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
      stats.moviesUpdated = await updateMoviePopularity(pool, eraMap, options, runId, snapshotDate)
      console.log(`Movies updated: ${stats.moviesUpdated}\n`)
    }

    // Update shows
    if (updateShows) {
      console.log("=== Updating Show Popularity ===")
      stats.showsUpdated = await updateShowPopularity(pool, eraMap, options, runId, snapshotDate)
      console.log(`Shows updated: ${stats.showsUpdated}\n`)
    }

    // Refresh stale Wikipedia pageviews before actor scoring
    if (updateActors) {
      console.log("=== Refreshing Wikipedia Pageviews ===")
      const wikiRefreshed = await refreshWikipediaPageviews(pool, options)
      console.log(`Wikipedia pageviews refreshed: ${wikiRefreshed}\n`)
    }

    // Refresh stale Wikidata sitelinks before actor scoring
    if (updateActors) {
      console.log("=== Refreshing Wikidata Sitelinks ===")
      const sitelinksRefreshed = await refreshWikidataSitelinks(pool, options)
      console.log(`Wikidata sitelinks refreshed: ${sitelinksRefreshed}\n`)
    }

    // Update actors (after content, since actor scores depend on content scores)
    if (updateActors) {
      console.log("=== Updating Actor Popularity ===")
      stats.actorsUpdated = await updateActorPopularity(pool, options, runId, snapshotDate)
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
  omdb_box_office_cents: number | null
  omdb_imdb_votes: number | null
  trakt_watchers: number | null
  trakt_plays: number | null
  aggregate_score: number | null
  production_countries: string[] | null
  omdb_awards_wins: number | null
  omdb_awards_nominations: number | null
  original_language: string | null
}

async function updateMoviePopularity(
  pool: ReturnType<typeof getPool>,
  eraMap: Map<number, EraReferenceStats>,
  options: Options,
  runId: number | null,
  snapshotDate: string
): Promise<number> {
  const batchSize = options.batchSize

  // Get all movies that need updating
  const movieResult = await pool.query<MovieRow>(`
    SELECT
      m.id,
      EXTRACT(YEAR FROM m.release_date)::int as release_year,
      m.tmdb_popularity::float as tmdb_popularity,
      m.omdb_box_office_cents,
      m.omdb_imdb_votes::int as omdb_imdb_votes,
      m.trakt_watchers::int as trakt_watchers,
      m.trakt_plays::int as trakt_plays,
      m.aggregate_score::float as aggregate_score,
      m.production_countries,
      m.omdb_awards_wins::int as omdb_awards_wins,
      m.omdb_awards_nominations::int as omdb_awards_nominations,
      m.original_language
    FROM movies m
    WHERE m.release_date IS NOT NULL
    ORDER BY m.id
  `)

  console.log(`Processing ${movieResult.rows.length} movies...`)

  let updated = 0
  const updates: ContentSnapshotUpdate[] = []

  for (const movie of movieResult.rows) {
    const era = movie.release_year ? (eraMap.get(movie.release_year) ?? null) : null
    const isUSUK = isUSUKProduction(movie.production_countries)

    // Build the input structure
    const input: ContentPopularityInput = {
      releaseYear: movie.release_year,
      boxOfficeCents: movie.omdb_box_office_cents,
      traktWatchers: movie.trakt_watchers,
      traktPlays: movie.trakt_plays,
      imdbVotes: movie.omdb_imdb_votes,
      tmdbPopularity: movie.tmdb_popularity,
      isUSUKProduction: isUSUK,
      originalLanguage: movie.original_language,
      awardsWins: movie.omdb_awards_wins,
      awardsNominations: movie.omdb_awards_nominations,
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
        await recordMovieSnapshots(pool, updates, ALGORITHM_VERSION, runId, snapshotDate)
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
      await recordMovieSnapshots(pool, updates, ALGORITHM_VERSION, runId, snapshotDate)
    }
    updated += updates.length
  }

  console.log(`\rUpdated ${updated} movies    `)
  return updated
}

async function batchUpdateMovies(
  pool: ReturnType<typeof getPool>,
  updates: ContentSnapshotUpdate[]
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
  omdb_imdb_votes: number | null
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
  options: Options,
  runId: number | null,
  snapshotDate: string
): Promise<number> {
  const batchSize = options.batchSize

  const showResult = await pool.query<ShowRow>(`
    SELECT
      s.id,
      EXTRACT(YEAR FROM s.first_air_date)::int as release_year,
      s.tmdb_popularity::float as tmdb_popularity,
      s.omdb_imdb_votes::int as omdb_imdb_votes,
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
  const updates: ContentSnapshotUpdate[] = []

  for (const show of showResult.rows) {
    const era = show.release_year ? (eraMap.get(show.release_year) ?? null) : null
    const isUSUK = isUSUKProduction(show.production_countries)

    // Build the input structure
    const input: ShowPopularityInput = {
      releaseYear: show.release_year,
      boxOfficeCents: null, // Shows don't have box office
      traktWatchers: show.trakt_watchers,
      traktPlays: show.trakt_plays,
      imdbVotes: show.omdb_imdb_votes,
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
        await recordShowSnapshots(pool, updates, ALGORITHM_VERSION, runId, snapshotDate)
      }
      updated += updates.length
      process.stdout.write(`\rUpdated ${updated} shows...`)
      updates.length = 0
    }
  }

  if (updates.length > 0) {
    if (!options.dryRun) {
      await batchUpdateShows(pool, updates)
      await recordShowSnapshots(pool, updates, ALGORITHM_VERSION, runId, snapshotDate)
    }
    updated += updates.length
  }

  console.log(`\rUpdated ${updated} shows    `)
  return updated
}

async function batchUpdateShows(
  pool: ReturnType<typeof getPool>,
  updates: ContentSnapshotUpdate[]
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
  options: Options,
  runId: number | null,
  snapshotDate: string
): Promise<number> {
  // Actor DB writes use ACTOR_FILMOGRAPHY_BATCH_SIZE (500) since filmography
  // queries need bounded batch sizes. options.batchSize controls snapshot flush frequency.
  const batchSize = options.batchSize

  // Get all deceased actors with TMDB popularity, Wikipedia, and Wikidata data
  const actorsResult = await pool.query<{
    id: number
    tmdb_popularity: number | null
    wikipedia_annual_pageviews: number | null
    wikidata_sitelinks: number | null
  }>(`
    SELECT id, tmdb_popularity::float, wikipedia_annual_pageviews, wikidata_sitelinks
    FROM actors
    WHERE deathday IS NOT NULL
    ORDER BY id
  `)

  console.log(`Processing ${actorsResult.rows.length} actors...`)

  let updated = 0
  const allUpdates: ActorSnapshotUpdate[] = []

  // Process actors in batches for filmography queries
  for (let i = 0; i < actorsResult.rows.length; i += ACTOR_FILMOGRAPHY_BATCH_SIZE) {
    const batch = actorsResult.rows.slice(i, i + ACTOR_FILMOGRAPHY_BATCH_SIZE)
    const actorIds = batch.map((a) => a.id)

    // Fetch filmography for entire batch in 2 parallel queries
    const [movieRows, showRows] = await Promise.all([
      pool.query<{
        actor_id: number
        dof_popularity: number | null
        dof_weight: number | null
        billing_order: number | null
      }>(
        `
        SELECT
          ama.actor_id,
          m.dof_popularity::float,
          m.dof_weight::float,
          ama.billing_order
        FROM actor_movie_appearances ama
        JOIN movies m ON m.tmdb_id = ama.movie_tmdb_id
        WHERE ama.actor_id = ANY($1)
          AND (m.dof_popularity IS NOT NULL OR m.dof_weight IS NOT NULL)
        `,
        [actorIds]
      ),
      pool.query<{
        actor_id: number
        dof_popularity: number | null
        dof_weight: number | null
        min_billing_order: number | null
        episode_count: number
      }>(
        `
        SELECT
          asa.actor_id,
          s.dof_popularity::float,
          s.dof_weight::float,
          MIN(asa.billing_order) as min_billing_order,
          COUNT(*)::int as episode_count
        FROM actor_show_appearances asa
        JOIN shows s ON s.tmdb_id = asa.show_tmdb_id
        WHERE asa.actor_id = ANY($1)
          AND (s.dof_popularity IS NOT NULL OR s.dof_weight IS NOT NULL)
        GROUP BY asa.actor_id, s.tmdb_id, s.dof_popularity, s.dof_weight
        `,
        [actorIds]
      ),
    ])

    // Group filmography by actor_id
    const filmographyMap = new Map<number, ActorAppearance[]>()

    for (const row of movieRows.rows) {
      if (!filmographyMap.has(row.actor_id)) {
        filmographyMap.set(row.actor_id, [])
      }
      filmographyMap.get(row.actor_id)!.push({
        contentDofPopularity: row.dof_popularity,
        contentDofWeight: row.dof_weight,
        billingOrder: row.billing_order,
        episodeCount: null,
        isMovie: true,
      })
    }

    for (const row of showRows.rows) {
      if (!filmographyMap.has(row.actor_id)) {
        filmographyMap.set(row.actor_id, [])
      }
      filmographyMap.get(row.actor_id)!.push({
        contentDofPopularity: row.dof_popularity,
        contentDofWeight: row.dof_weight,
        billingOrder: row.min_billing_order,
        episodeCount: Number(row.episode_count),
        isMovie: false,
      })
    }

    // Calculate popularity for each actor in batch
    const batchUpdates: ActorSnapshotUpdate[] = []

    for (const actor of batch) {
      const appearances = filmographyMap.get(actor.id) ?? []
      if (appearances.length === 0) continue

      const result = calculateActorPopularity({
        appearances,
        tmdbPopularity: actor.tmdb_popularity,
        wikipediaAnnualPageviews: actor.wikipedia_annual_pageviews,
        wikidataSitelinks: actor.wikidata_sitelinks,
      })

      if (result.dofPopularity !== null) {
        batchUpdates.push({
          id: actor.id,
          popularity: result.dofPopularity,
          confidence: result.confidence,
        })
      }
    }

    // Write batch to database
    if (batchUpdates.length > 0) {
      if (!options.dryRun) {
        await batchUpdateActors(pool, batchUpdates)
      }
      allUpdates.push(...batchUpdates)
      updated += batchUpdates.length
      process.stdout.write(`\rUpdated ${updated} actors...`)
    }

    // Record snapshots in chunks matching the main batchSize
    if (allUpdates.length >= batchSize) {
      if (!options.dryRun) {
        await recordActorSnapshots(pool, allUpdates, ALGORITHM_VERSION, runId, snapshotDate)
      }
      allUpdates.length = 0
    }
  }

  // Final snapshot batch
  if (allUpdates.length > 0 && !options.dryRun) {
    await recordActorSnapshots(pool, allUpdates, ALGORITHM_VERSION, runId, snapshotDate)
  }

  console.log(`\rUpdated ${updated} actors    `)
  return updated
}

async function batchUpdateActors(
  pool: ReturnType<typeof getPool>,
  updates: ActorSnapshotUpdate[]
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

/**
 * Refresh Wikipedia pageviews for actors with stale or missing data.
 *
 * Fetches fresh pageview data for actors whose wikipedia_pageviews_updated_at
 * is NULL or older than 7 days.
 */
async function refreshWikipediaPageviews(
  pool: ReturnType<typeof getPool>,
  options: Options
): Promise<number> {
  const staleActors = await pool.query<{
    id: number
    wikipedia_url: string
    deathday: string | null
  }>(`
    SELECT id, wikipedia_url, deathday
    FROM actors
    WHERE wikipedia_url IS NOT NULL
      AND deathday IS NOT NULL
      AND (wikipedia_pageviews_updated_at IS NULL
           OR wikipedia_pageviews_updated_at < NOW() - INTERVAL '7 days')
    ORDER BY id
  `)

  console.log(`Found ${staleActors.rows.length} actors with stale Wikipedia pageview data`)

  if (staleActors.rows.length === 0 || options.dryRun) {
    return 0
  }

  let refreshed = 0
  const batchUpdates: Array<{ id: number; pageviews: number | null }> = []

  for (const actor of staleActors.rows) {
    try {
      const pageviews = await fetchActorPageviews(actor.wikipedia_url, actor.deathday)
      // Always push the result (even null) so wikipedia_pageviews_updated_at gets
      // set — prevents repeated failed lookups for actors with no pageview data.
      batchUpdates.push({ id: actor.id, pageviews })
    } catch (error) {
      console.error(`Error fetching Wikipedia pageviews for actor ${actor.id}:`, error)
    }

    // Write batch every 100 actors
    if (batchUpdates.length >= 100) {
      await batchUpdateWikipediaPageviews(pool, batchUpdates)
      refreshed += batchUpdates.length
      process.stdout.write(`\rRefreshed ${refreshed} Wikipedia pageviews...`)
      batchUpdates.length = 0
    }
  }

  // Final batch
  if (batchUpdates.length > 0) {
    await batchUpdateWikipediaPageviews(pool, batchUpdates)
    refreshed += batchUpdates.length
  }

  console.log(`\rRefreshed ${refreshed} Wikipedia pageviews    `)
  return refreshed
}

async function batchUpdateWikipediaPageviews(
  pool: ReturnType<typeof getPool>,
  updates: Array<{ id: number; pageviews: number | null }>
): Promise<void> {
  await pool.query(
    `
    UPDATE actors a SET
      wikipedia_annual_pageviews = COALESCE(u.pageviews, a.wikipedia_annual_pageviews),
      wikipedia_pageviews_updated_at = NOW()
    FROM (
      SELECT unnest($1::int[]) as id,
             unnest($2::int[]) as pageviews
    ) u
    WHERE a.id = u.id
    `,
    [updates.map((u) => u.id), updates.map((u) => u.pageviews)]
  )
}

/**
 * Refresh Wikidata sitelinks for actors with stale or missing data.
 *
 * Sitelinks change slowly, so we use a 30-day refresh interval
 * (vs 7 days for Wikipedia pageviews).
 */
async function refreshWikidataSitelinks(
  pool: ReturnType<typeof getPool>,
  options: Options
): Promise<number> {
  const staleActors = await pool.query<{
    id: number
    tmdb_id: number | null
    wikipedia_url: string | null
  }>(`
    SELECT id, tmdb_id, wikipedia_url
    FROM actors
    WHERE (tmdb_id IS NOT NULL OR wikipedia_url IS NOT NULL)
      AND deathday IS NOT NULL
      AND (wikidata_sitelinks_updated_at IS NULL
           OR wikidata_sitelinks_updated_at < NOW() - INTERVAL '30 days')
    ORDER BY id
  `)

  console.log(`Found ${staleActors.rows.length} actors with stale Wikidata sitelinks data`)

  if (staleActors.rows.length === 0 || options.dryRun) {
    return 0
  }

  let refreshed = 0
  const SITELINKS_BATCH_SIZE = 500

  for (let i = 0; i < staleActors.rows.length; i += SITELINKS_BATCH_SIZE) {
    const batch = staleActors.rows.slice(i, i + SITELINKS_BATCH_SIZE)

    // Batch fetch actors with TMDB IDs
    const withTmdb = batch.filter((a) => a.tmdb_id !== null)
    const tmdbIds = withTmdb.map((a) => a.tmdb_id!)
    const sitelinksByTmdb = tmdbIds.length > 0 ? await fetchSitelinksBatch(tmdbIds) : new Map()

    const batchUpdates: Array<{ id: number; sitelinks: number | null }> = []

    for (const actor of withTmdb) {
      batchUpdates.push({
        id: actor.id,
        sitelinks: sitelinksByTmdb.get(actor.tmdb_id!) ?? null,
      })
    }

    // Individual fetch for actors without TMDB IDs (fallback to Wikipedia URL)
    const withoutTmdb = batch.filter((a) => a.tmdb_id === null && a.wikipedia_url !== null)
    for (const actor of withoutTmdb) {
      try {
        const sitelinks = await fetchSitelinksByWikipediaUrl(actor.wikipedia_url!)
        batchUpdates.push({ id: actor.id, sitelinks })
      } catch (error) {
        console.error(`Error fetching sitelinks for actor ${actor.id}:`, error)
        batchUpdates.push({ id: actor.id, sitelinks: null })
      }
    }

    // Write batch
    if (batchUpdates.length > 0) {
      await batchUpdateWikidataSitelinks(pool, batchUpdates)
      refreshed += batchUpdates.length
      process.stdout.write(`\rRefreshed ${refreshed} Wikidata sitelinks...`)
    }
  }

  console.log(`\rRefreshed ${refreshed} Wikidata sitelinks    `)
  return refreshed
}

async function batchUpdateWikidataSitelinks(
  pool: ReturnType<typeof getPool>,
  updates: Array<{ id: number; sitelinks: number | null }>
): Promise<void> {
  await pool.query(
    `
    UPDATE actors a SET
      wikidata_sitelinks = COALESCE(u.sitelinks, a.wikidata_sitelinks),
      wikidata_sitelinks_updated_at = NOW()
    FROM (
      SELECT unnest($1::int[]) as id,
             unnest($2::int[]) as sitelinks
    ) u
    WHERE a.id = u.id
    `,
    [updates.map((u) => u.id), updates.map((u) => u.sitelinks)]
  )
}

program.parse()
