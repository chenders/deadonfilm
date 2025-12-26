/**
 * Database functions module.
 *
 * Pool management functions are imported from ./db/pool.js.
 * This file contains all domain-specific database functions.
 */

import { createActorSlug, createMovieSlug } from "./slug-utils.js"

// Re-export pool functions for backward compatibility
export { getPool, resetPool, queryWithRetry, initDatabase } from "./db/pool.js"

// Import getPool for local use
import { getPool } from "./db/pool.js"

// ============================================================================
// Type definitions
// ============================================================================

export type DeathInfoSource = "claude" | "wikipedia" | null

// Actor record - unified table for all actors (living and deceased)
export interface ActorRecord {
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string | null // null for living actors
  profile_path: string | null
  popularity: number | null

  // Death-related fields (null for living actors)
  cause_of_death: string | null
  cause_of_death_source: DeathInfoSource
  cause_of_death_details: string | null
  cause_of_death_details_source: DeathInfoSource
  wikipedia_url: string | null
  age_at_death: number | null
  expected_lifespan: number | null
  years_lost: number | null
  violent_death: boolean | null

  // Computed column
  is_obscure: boolean | null
}

// Input type for upserting actors - only tmdb_id and name are required
// All other fields are optional and will be preserved if not provided
export type ActorInput = Pick<ActorRecord, "tmdb_id" | "name"> &
  Partial<Omit<ActorRecord, "tmdb_id" | "name" | "is_obscure">>

// Simplified movie appearance record (junction table only)
export interface ActorMovieAppearanceRecord {
  actor_tmdb_id: number
  movie_tmdb_id: number
  character_name: string | null
  billing_order: number | null
  age_at_filming: number | null
}

// ============================================================================
// Actor functions (unified table for living and deceased actors)
// ============================================================================

// Get an actor by TMDB ID
export async function getActor(tmdbId: number): Promise<ActorRecord | null> {
  const db = getPool()
  const result = await db.query<ActorRecord>("SELECT * FROM actors WHERE tmdb_id = $1", [tmdbId])
  return result.rows[0] || null
}

// Get multiple actors by TMDB IDs
export async function getActors(tmdbIds: number[]): Promise<Map<number, ActorRecord>> {
  if (tmdbIds.length === 0) return new Map()

  const db = getPool()
  const placeholders = tmdbIds.map((_, i) => `$${i + 1}`).join(", ")
  const result = await db.query<ActorRecord>(
    `SELECT * FROM actors WHERE tmdb_id IN (${placeholders})`,
    tmdbIds
  )

  const map = new Map<number, ActorRecord>()
  for (const row of result.rows) {
    map.set(row.tmdb_id, row)
  }
  return map
}

// Insert or update an actor
// Note: COALESCE prioritizes existing values over new values to preserve first-found data.
// This is intentional - once we have death info, we don't overwrite it with potentially
// different/conflicting data from later lookups.
export async function upsertActor(actor: ActorInput): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO actors (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, profile_path, age_at_death, expected_lifespan, years_lost, popularity, violent_death, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       birthday = COALESCE(actors.birthday, EXCLUDED.birthday),
       deathday = COALESCE(actors.deathday, EXCLUDED.deathday),
       cause_of_death = COALESCE(actors.cause_of_death, EXCLUDED.cause_of_death),
       cause_of_death_source = COALESCE(actors.cause_of_death_source, EXCLUDED.cause_of_death_source),
       cause_of_death_details = COALESCE(actors.cause_of_death_details, EXCLUDED.cause_of_death_details),
       cause_of_death_details_source = COALESCE(actors.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
       wikipedia_url = COALESCE(actors.wikipedia_url, EXCLUDED.wikipedia_url),
       profile_path = COALESCE(actors.profile_path, EXCLUDED.profile_path),
       age_at_death = COALESCE(actors.age_at_death, EXCLUDED.age_at_death),
       expected_lifespan = COALESCE(actors.expected_lifespan, EXCLUDED.expected_lifespan),
       years_lost = COALESCE(actors.years_lost, EXCLUDED.years_lost),
       popularity = COALESCE(actors.popularity, EXCLUDED.popularity),
       violent_death = COALESCE(actors.violent_death, EXCLUDED.violent_death),
       updated_at = CURRENT_TIMESTAMP`,
    [
      actor.tmdb_id,
      actor.name,
      actor.birthday ?? null,
      actor.deathday ?? null,
      actor.cause_of_death ?? null,
      actor.cause_of_death_source ?? null,
      actor.cause_of_death_details ?? null,
      actor.cause_of_death_details_source ?? null,
      actor.wikipedia_url ?? null,
      actor.profile_path ?? null,
      actor.age_at_death ?? null,
      actor.expected_lifespan ?? null,
      actor.years_lost ?? null,
      actor.popularity ?? null,
      actor.violent_death ?? null,
    ]
  )
}

// Batch insert/update actors
export async function batchUpsertActors(actors: ActorInput[]): Promise<void> {
  if (actors.length === 0) return

  const db = getPool()

  // Use a transaction for batch insert
  const client = await db.connect()
  try {
    await client.query("BEGIN")

    for (const actor of actors) {
      await client.query(
        `INSERT INTO actors (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, profile_path, age_at_death, expected_lifespan, years_lost, popularity, violent_death, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
         ON CONFLICT (tmdb_id) DO UPDATE SET
           name = EXCLUDED.name,
           birthday = COALESCE(actors.birthday, EXCLUDED.birthday),
           deathday = COALESCE(actors.deathday, EXCLUDED.deathday),
           cause_of_death = COALESCE(actors.cause_of_death, EXCLUDED.cause_of_death),
           cause_of_death_source = COALESCE(actors.cause_of_death_source, EXCLUDED.cause_of_death_source),
           cause_of_death_details = COALESCE(actors.cause_of_death_details, EXCLUDED.cause_of_death_details),
           cause_of_death_details_source = COALESCE(actors.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
           wikipedia_url = COALESCE(actors.wikipedia_url, EXCLUDED.wikipedia_url),
           profile_path = COALESCE(actors.profile_path, EXCLUDED.profile_path),
           age_at_death = COALESCE(actors.age_at_death, EXCLUDED.age_at_death),
           expected_lifespan = COALESCE(actors.expected_lifespan, EXCLUDED.expected_lifespan),
           years_lost = COALESCE(actors.years_lost, EXCLUDED.years_lost),
           popularity = COALESCE(actors.popularity, EXCLUDED.popularity),
           violent_death = COALESCE(actors.violent_death, EXCLUDED.violent_death),
           updated_at = CURRENT_TIMESTAMP`,
        [
          actor.tmdb_id,
          actor.name,
          actor.birthday ?? null,
          actor.deathday ?? null,
          actor.cause_of_death ?? null,
          actor.cause_of_death_source ?? null,
          actor.cause_of_death_details ?? null,
          actor.cause_of_death_details_source ?? null,
          actor.wikipedia_url ?? null,
          actor.profile_path ?? null,
          actor.age_at_death ?? null,
          actor.expected_lifespan ?? null,
          actor.years_lost ?? null,
          actor.popularity ?? null,
          actor.violent_death ?? null,
        ]
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Update just the cause of death and wikipedia URL for an existing actor
// Note: COALESCE prioritizes existing values - see comment on upsertActor
export async function updateDeathInfo(
  tmdbId: number,
  causeOfDeath: string | null,
  causeOfDeathSource: DeathInfoSource,
  causeOfDeathDetails: string | null,
  causeOfDeathDetailsSource: DeathInfoSource,
  wikipediaUrl: string | null
): Promise<void> {
  const db = getPool()
  await db.query(
    `UPDATE actors
     SET cause_of_death = COALESCE(cause_of_death, $2),
         cause_of_death_source = COALESCE(cause_of_death_source, $3),
         cause_of_death_details = COALESCE(cause_of_death_details, $4),
         cause_of_death_details_source = COALESCE(cause_of_death_details_source, $5),
         wikipedia_url = COALESCE(wikipedia_url, $6),
         updated_at = CURRENT_TIMESTAMP
     WHERE tmdb_id = $1`,
    [
      tmdbId,
      causeOfDeath,
      causeOfDeathSource,
      causeOfDeathDetails,
      causeOfDeathDetailsSource,
      wikipediaUrl,
    ]
  )
}

// Get deceased actors who died on a specific month/day (for "On This Day" feature)
// Only returns actors with a profile photo
export async function getDeceasedByMonthDay(month: number, day: number): Promise<ActorRecord[]> {
  const db = getPool()
  const result = await db.query<ActorRecord>(
    `SELECT * FROM actors
     WHERE deathday IS NOT NULL
       AND EXTRACT(MONTH FROM deathday) = $1
       AND EXTRACT(DAY FROM deathday) = $2
       AND profile_path IS NOT NULL
     ORDER BY deathday DESC`,
    [month, day]
  )
  return result.rows
}

// ============================================================================
// Movies table functions
// ============================================================================

export interface MovieRecord {
  tmdb_id: number
  title: string
  release_date: string | null
  release_year: number | null
  poster_path: string | null
  genres: string[]
  original_language: string | null
  popularity: number | null
  vote_average: number | null
  cast_count: number | null
  deceased_count: number | null
  living_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get a movie by TMDB ID
export async function getMovie(tmdbId: number): Promise<MovieRecord | null> {
  const db = getPool()
  const result = await db.query<MovieRecord>("SELECT * FROM movies WHERE tmdb_id = $1", [tmdbId])
  return result.rows[0] || null
}

// Insert or update a movie
export async function upsertMovie(movie: MovieRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO movies (tmdb_id, title, release_date, release_year, poster_path, genres, original_language, popularity, vote_average, cast_count, deceased_count, living_count, expected_deaths, mortality_surprise_score, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       title = EXCLUDED.title,
       release_date = EXCLUDED.release_date,
       release_year = EXCLUDED.release_year,
       poster_path = EXCLUDED.poster_path,
       genres = EXCLUDED.genres,
       original_language = COALESCE(EXCLUDED.original_language, movies.original_language),
       popularity = COALESCE(EXCLUDED.popularity, movies.popularity),
       vote_average = EXCLUDED.vote_average,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       living_count = EXCLUDED.living_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       updated_at = CURRENT_TIMESTAMP`,
    [
      movie.tmdb_id,
      movie.title,
      movie.release_date,
      movie.release_year,
      movie.poster_path,
      movie.genres,
      movie.original_language,
      movie.popularity,
      movie.vote_average,
      movie.cast_count,
      movie.deceased_count,
      movie.living_count,
      movie.expected_deaths,
      movie.mortality_surprise_score,
    ]
  )
}

// Options for querying high mortality movies
export interface HighMortalityOptions {
  limit?: number
  offset?: number
  fromYear?: number // Start year (e.g., 1980)
  toYear?: number // End year (e.g., 1989)
  minDeadActors?: number
  includeObscure?: boolean // Include obscure/unknown movies (default: false)
}

// Get movies with high mortality surprise scores
// Supports pagination and filtering by year range, minimum deaths, and obscurity
export async function getHighMortalityMovies(
  options: HighMortalityOptions = {}
): Promise<{ movies: MovieRecord[]; totalCount: number }> {
  const {
    limit = 50,
    offset = 0,
    fromYear,
    toYear,
    minDeadActors = 3,
    includeObscure = false,
  } = options

  const db = getPool()
  // Uses idx_movies_not_obscure_curse partial index when includeObscure = false
  const result = await db.query<MovieRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM movies
     WHERE mortality_surprise_score IS NOT NULL
       AND deceased_count >= $1
       AND ($2::integer IS NULL OR release_year >= $2)
       AND ($3::integer IS NULL OR release_year <= $3)
       AND ($6::boolean = true OR NOT is_obscure)
     ORDER BY mortality_surprise_score DESC
     LIMIT $4 OFFSET $5`,
    [minDeadActors, fromYear || null, toYear || null, limit, offset, includeObscure]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const movies = result.rows.map(({ total_count: _total_count, ...movie }) => movie as MovieRecord)

  return { movies, totalCount }
}

// Get the maximum min deaths value that still returns at least 5 movies
export async function getMaxValidMinDeaths(): Promise<number> {
  const db = getPool()

  // Find the highest threshold that still returns at least 5 movies
  // Optimized query: group by deceased_count directly instead of generating and joining
  const result = await db.query<{ max_threshold: number | null }>(`
    SELECT MAX(deceased_count) as max_threshold
    FROM (
      SELECT deceased_count, COUNT(*) as count
      FROM movies
      WHERE mortality_surprise_score IS NOT NULL
        AND deceased_count >= 3
      GROUP BY deceased_count
      HAVING COUNT(*) >= 5
    ) subq
  `)

  // Default to 3 if no valid thresholds found
  return result.rows[0]?.max_threshold ?? 3
}

// Get the single most cursed movie (highest mortality surprise score)
export interface FeaturedMovieRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  expected_deaths: number
  mortality_surprise_score: number
}

export async function getMostCursedMovie(): Promise<FeaturedMovieRecord | null> {
  const db = getPool()

  const result = await db.query<FeaturedMovieRecord>(
    `SELECT tmdb_id, title, release_year, poster_path,
            deceased_count, cast_count, expected_deaths, mortality_surprise_score
     FROM movies
     WHERE mortality_surprise_score IS NOT NULL
       AND poster_path IS NOT NULL
       AND deceased_count >= 3
     ORDER BY mortality_surprise_score DESC
     LIMIT 1`
  )

  return result.rows[0] || null
}

// Get interesting trivia facts from the database
export interface TriviaFact {
  type: string
  title: string
  value: string
  link?: string // Optional link to related page
}

// In-memory cache for trivia (5-minute TTL)
let triviaCache: TriviaFact[] | null = null
let triviaCacheExpiry = 0
const TRIVIA_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Combined query result types
interface PersonsStatsRow {
  oldest_name: string | null
  oldest_tmdb_id: number | null
  oldest_age: number | null
  youngest_name: string | null
  youngest_tmdb_id: number | null
  youngest_age: number | null
  total_years_lost: string | null
  deadliest_decade: number | null
  decade_count: string | null
  most_lost_name: string | null
  most_lost_tmdb_id: number | null
  most_lost_years: number | null
  most_lost_age: number | null
}

interface MovieStatsRow {
  title: string
  tmdb_id: number
  release_year: number
  deceased_count: number
  cast_count: number
}

export async function getTrivia(): Promise<TriviaFact[]> {
  const now = Date.now()

  // Return cached result if still valid
  if (triviaCache && now < triviaCacheExpiry) {
    return triviaCache
  }

  const db = getPool()
  const facts: TriviaFact[] = []

  // Combined query for all actors stats (was 5 queries, now 1)
  // Uses CTEs to compute each stat in a single pass
  const personsStatsResult = await db.query<PersonsStatsRow>(`
    WITH oldest AS (
      SELECT name, tmdb_id, age_at_death
      FROM actors
      WHERE age_at_death IS NOT NULL
      ORDER BY age_at_death DESC
      LIMIT 1
    ),
    youngest AS (
      SELECT name, tmdb_id, age_at_death
      FROM actors
      WHERE age_at_death IS NOT NULL AND age_at_death > 15
      ORDER BY age_at_death ASC
      LIMIT 1
    ),
    years_lost_total AS (
      SELECT ROUND(SUM(years_lost)) as total
      FROM actors
      WHERE years_lost > 0
    ),
    deadliest_decade AS (
      SELECT (EXTRACT(YEAR FROM deathday)::int / 10 * 10) as decade, COUNT(*) as count
      FROM actors
      WHERE deathday IS NOT NULL
      GROUP BY decade
      ORDER BY count DESC
      LIMIT 1
    ),
    most_years_lost AS (
      SELECT name, tmdb_id, ROUND(years_lost) as years_lost, age_at_death
      FROM actors
      WHERE years_lost > 0
      ORDER BY years_lost DESC
      LIMIT 1
    )
    SELECT
      o.name as oldest_name, o.tmdb_id as oldest_tmdb_id, o.age_at_death as oldest_age,
      y.name as youngest_name, y.tmdb_id as youngest_tmdb_id, y.age_at_death as youngest_age,
      yl.total as total_years_lost,
      dd.decade as deadliest_decade, dd.count as decade_count,
      ml.name as most_lost_name, ml.tmdb_id as most_lost_tmdb_id,
      ml.years_lost as most_lost_years, ml.age_at_death as most_lost_age
    FROM oldest o
    FULL OUTER JOIN youngest y ON true
    FULL OUTER JOIN years_lost_total yl ON true
    FULL OUTER JOIN deadliest_decade dd ON true
    FULL OUTER JOIN most_years_lost ml ON true
  `)

  // Process actors stats
  const ps = personsStatsResult.rows[0]
  if (ps) {
    if (ps.oldest_name && ps.oldest_tmdb_id && ps.oldest_age) {
      facts.push({
        type: "oldest",
        title: "Oldest at Death",
        value: `${ps.oldest_name} lived to ${ps.oldest_age} years old`,
        link: `/actor/${createActorSlug(ps.oldest_name, ps.oldest_tmdb_id)}`,
      })
    }

    if (ps.youngest_name && ps.youngest_tmdb_id && ps.youngest_age) {
      facts.push({
        type: "youngest",
        title: "Youngest at Death",
        value: `${ps.youngest_name} died at just ${ps.youngest_age} years old`,
        link: `/actor/${createActorSlug(ps.youngest_name, ps.youngest_tmdb_id)}`,
      })
    }

    if (ps.total_years_lost) {
      const totalYears = parseInt(ps.total_years_lost, 10)
      facts.push({
        type: "years_lost",
        title: "Total Years Lost",
        value: `${totalYears.toLocaleString()} years of life lost to early deaths`,
      })
    }

    if (ps.deadliest_decade && ps.decade_count) {
      const count = parseInt(ps.decade_count, 10)
      facts.push({
        type: "common_decade",
        title: "Deadliest Decade",
        value: `${count.toLocaleString()} actors died in the ${ps.deadliest_decade}s`,
      })
    }

    if (ps.most_lost_name && ps.most_lost_tmdb_id && ps.most_lost_years && ps.most_lost_age) {
      facts.push({
        type: "most_years_lost",
        title: "Most Potential Lost",
        value: `${ps.most_lost_name} died at ${ps.most_lost_age}, losing ${ps.most_lost_years} expected years`,
        link: `/actor/${createActorSlug(ps.most_lost_name, ps.most_lost_tmdb_id)}`,
      })
    }
  }

  // Separate query for movie with highest mortality (different table)
  const movieResult = await db.query<MovieStatsRow>(`
    SELECT title, tmdb_id, release_year, deceased_count, cast_count
    FROM movies
    WHERE cast_count >= 5 AND deceased_count > 0 AND poster_path IS NOT NULL
    ORDER BY (deceased_count::float / cast_count) DESC
    LIMIT 1
  `)

  if (movieResult.rows[0]) {
    const { title, tmdb_id, release_year, deceased_count, cast_count } = movieResult.rows[0]
    const percentage = Math.round((deceased_count / cast_count) * 100)
    facts.push({
      type: "highest_mortality",
      title: "Highest Mortality Rate",
      value: `${title} (${release_year}): ${percentage}% of cast deceased`,
      link: `/movie/${createMovieSlug(title, release_year, tmdb_id)}`,
    })
  }

  // Cache the result
  triviaCache = facts
  triviaCacheExpiry = now + TRIVIA_CACHE_TTL_MS

  return facts
}

// Get deaths that occurred during this calendar week (any year)
export interface ThisWeekDeathRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string | null
  age_at_death: number | null
  year_of_death: number
}

export async function getDeathsThisWeek(): Promise<ThisWeekDeathRecord[]> {
  const db = getPool()

  // Get current week's start (Sunday) and end (Saturday)
  // Using ISO week would be Monday-Sunday, but we'll use the more common US week
  const result = await db.query<ThisWeekDeathRecord>(`
    SELECT tmdb_id, name, deathday::text, profile_path, cause_of_death, age_at_death,
           EXTRACT(YEAR FROM deathday)::int as year_of_death
    FROM actors
    WHERE deathday IS NOT NULL
      AND (EXTRACT(WEEK FROM deathday), EXTRACT(DOW FROM deathday))
          BETWEEN
          (EXTRACT(WEEK FROM CURRENT_DATE) - 1, 0)
          AND
          (EXTRACT(WEEK FROM CURRENT_DATE), 6)
      OR (
        -- Handle same-week matching for any year
        EXTRACT(MONTH FROM deathday) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY FROM deathday) BETWEEN
            EXTRACT(DAY FROM date_trunc('week', CURRENT_DATE))
            AND EXTRACT(DAY FROM date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')
      )
    ORDER BY
      EXTRACT(MONTH FROM deathday),
      EXTRACT(DAY FROM deathday),
      year_of_death DESC
    LIMIT 20
  `)

  return result.rows
}

// Get popular movies based on TMDB popularity scores
export interface PopularMovieRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  popularity: number
}

export async function getPopularMovies(limit: number = 10): Promise<PopularMovieRecord[]> {
  const db = getPool()

  const result = await db.query<PopularMovieRecord>(
    `SELECT tmdb_id, title, release_year, poster_path, deceased_count, cast_count, popularity
     FROM movies
     WHERE poster_path IS NOT NULL
       AND deceased_count > 0
       AND cast_count >= 3
     ORDER BY popularity DESC
     LIMIT $1`,
    [limit]
  )

  return result.rows
}

// Simpler approach: Get deaths that occurred on the same day of week range
export async function getDeathsThisWeekSimple(): Promise<ThisWeekDeathRecord[]> {
  const db = getPool()

  // Get the day of year range for the current week
  const result = await db.query<ThisWeekDeathRecord>(`
    WITH week_range AS (
      SELECT
        date_trunc('week', CURRENT_DATE)::date as week_start,
        (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date as week_end
    )
    SELECT
      dp.tmdb_id,
      dp.name,
      dp.deathday::text,
      dp.profile_path,
      dp.cause_of_death,
      dp.age_at_death,
      EXTRACT(YEAR FROM dp.deathday)::int as year_of_death
    FROM actors dp, week_range wr
    WHERE dp.deathday IS NOT NULL
      AND (
        -- Match month and day range
        (EXTRACT(MONTH FROM dp.deathday) = EXTRACT(MONTH FROM wr.week_start)
         AND EXTRACT(DAY FROM dp.deathday) >= EXTRACT(DAY FROM wr.week_start)
         AND EXTRACT(DAY FROM dp.deathday) <= EXTRACT(DAY FROM wr.week_end))
        OR
        -- Handle week spanning month boundary
        (EXTRACT(MONTH FROM wr.week_start) != EXTRACT(MONTH FROM wr.week_end)
         AND (
           (EXTRACT(MONTH FROM dp.deathday) = EXTRACT(MONTH FROM wr.week_start)
            AND EXTRACT(DAY FROM dp.deathday) >= EXTRACT(DAY FROM wr.week_start))
           OR
           (EXTRACT(MONTH FROM dp.deathday) = EXTRACT(MONTH FROM wr.week_end)
            AND EXTRACT(DAY FROM dp.deathday) <= EXTRACT(DAY FROM wr.week_end))
         ))
      )
    ORDER BY
      EXTRACT(MONTH FROM dp.deathday),
      EXTRACT(DAY FROM dp.deathday),
      year_of_death DESC
    LIMIT 15
  `)

  return result.rows
}

// ============================================================================
// Deaths by Cause functions (SEO category pages)
// ============================================================================

export interface CauseCategory {
  cause: string
  count: number
  slug: string
}

export async function getCauseCategories(): Promise<CauseCategory[]> {
  const db = getPool()

  const result = await db.query<{ cause_of_death: string; count: string }>(`
    SELECT cause_of_death, COUNT(*) as count
    FROM actors
    WHERE cause_of_death IS NOT NULL
      AND cause_of_death != ''
    GROUP BY cause_of_death
    HAVING COUNT(*) >= 5
    ORDER BY count DESC
  `)

  return result.rows.map((row) => ({
    cause: row.cause_of_death,
    count: parseInt(row.count, 10),
    slug: row.cause_of_death
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  }))
}

export interface DeathByCauseRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string
  cause_of_death_details: string | null
  age_at_death: number | null
  years_lost: number | null
}

export interface DeathsByCauseOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
}

export async function getDeathsByCause(
  cause: string,
  options: DeathsByCauseOptions = {}
): Promise<{ deaths: DeathByCauseRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0, includeObscure = false } = options
  const db = getPool()

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM actors
     WHERE LOWER(cause_of_death) = LOWER($1) AND ($2 = true OR is_obscure = false)`,
    [cause, includeObscure]
  )
  const totalCount = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const result = await db.query<DeathByCauseRecord>(
    `SELECT tmdb_id, name, deathday::text, profile_path, cause_of_death,
            cause_of_death_details, age_at_death, years_lost
     FROM actors
     WHERE LOWER(cause_of_death) = LOWER($1) AND ($4 = true OR is_obscure = false)
     ORDER BY deathday DESC NULLS LAST, name
     LIMIT $2 OFFSET $3`,
    [cause, limit, offset, includeObscure]
  )

  return { deaths: result.rows, totalCount }
}

// ============================================================================
// Deaths by Decade functions (SEO category pages)
// ============================================================================

export interface DecadeCategory {
  decade: number // e.g., 1950, 1960, etc.
  count: number
}

export async function getDecadeCategories(): Promise<DecadeCategory[]> {
  const db = getPool()

  const result = await db.query<{ decade: number; count: string }>(`
    SELECT (EXTRACT(YEAR FROM deathday)::int / 10 * 10) as decade,
           COUNT(*) as count
    FROM actors
    WHERE deathday IS NOT NULL
    GROUP BY decade
    HAVING COUNT(*) >= 5
    ORDER BY decade DESC
  `)

  return result.rows.map((row) => ({
    decade: row.decade,
    count: parseInt(row.count, 10),
  }))
}

export interface DeathByDecadeRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string | null
  age_at_death: number | null
  years_lost: number | null
}

export interface DeathsByDecadeOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
}

export async function getDeathsByDecade(
  decade: number,
  options: DeathsByDecadeOptions = {}
): Promise<{ deaths: DeathByDecadeRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0, includeObscure = false } = options
  const db = getPool()
  const decadeEnd = decade + 9

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM actors
     WHERE EXTRACT(YEAR FROM deathday) BETWEEN $1 AND $2
     AND ($3 = true OR is_obscure = false)`,
    [decade, decadeEnd, includeObscure]
  )
  const totalCount = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const result = await db.query<DeathByDecadeRecord>(
    `SELECT tmdb_id, name, deathday::text, profile_path, cause_of_death,
            age_at_death, years_lost
     FROM actors
     WHERE EXTRACT(YEAR FROM deathday) BETWEEN $1 AND $2
     AND ($5 = true OR is_obscure = false)
     ORDER BY deathday DESC NULLS LAST, name
     LIMIT $3 OFFSET $4`,
    [decade, decadeEnd, limit, offset, includeObscure]
  )

  return { deaths: result.rows, totalCount }
}

// Find the original cause name from a slug
export async function getCauseFromSlug(slug: string): Promise<string | null> {
  const db = getPool()

  // Get all causes and find the one matching the slug
  const result = await db.query<{ cause_of_death: string }>(`
    SELECT DISTINCT cause_of_death
    FROM actors
    WHERE cause_of_death IS NOT NULL
      AND cause_of_death != ''
  `)

  for (const row of result.rows) {
    const causeSlug = row.cause_of_death
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    if (causeSlug === slug) {
      return row.cause_of_death
    }
  }

  return null
}

// ============================================================================
// Actor movie appearances table functions (simplified junction table)
// ============================================================================

// Insert or update an actor movie appearance
export async function upsertActorMovieAppearance(
  appearance: ActorMovieAppearanceRecord
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO actor_movie_appearances (actor_tmdb_id, movie_tmdb_id, character_name, billing_order, age_at_filming)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (actor_tmdb_id, movie_tmdb_id) DO UPDATE SET
       character_name = EXCLUDED.character_name,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming`,
    [
      appearance.actor_tmdb_id,
      appearance.movie_tmdb_id,
      appearance.character_name,
      appearance.billing_order,
      appearance.age_at_filming,
    ]
  )
}

// Batch insert actor movie appearances
export async function batchUpsertActorMovieAppearances(
  appearances: ActorMovieAppearanceRecord[]
): Promise<void> {
  if (appearances.length === 0) return

  const db = getPool()
  const client = await db.connect()
  try {
    await client.query("BEGIN")

    for (const appearance of appearances) {
      await client.query(
        `INSERT INTO actor_movie_appearances (actor_tmdb_id, movie_tmdb_id, character_name, billing_order, age_at_filming)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (actor_tmdb_id, movie_tmdb_id) DO UPDATE SET
           character_name = EXCLUDED.character_name,
           billing_order = EXCLUDED.billing_order,
           age_at_filming = EXCLUDED.age_at_filming`,
        [
          appearance.actor_tmdb_id,
          appearance.movie_tmdb_id,
          appearance.character_name,
          appearance.billing_order,
          appearance.age_at_filming,
        ]
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Get all movies an actor has appeared in (with actor info from actors table)
export async function getActorMovies(
  actorTmdbId: number
): Promise<(ActorMovieAppearanceRecord & { actor_name: string; is_deceased: boolean })[]> {
  const db = getPool()
  const result = await db.query<
    ActorMovieAppearanceRecord & { actor_name: string; is_deceased: boolean }
  >(
    `SELECT ama.*, a.name as actor_name, a.deathday IS NOT NULL as is_deceased
     FROM actor_movie_appearances ama
     JOIN actors a ON ama.actor_tmdb_id = a.tmdb_id
     WHERE ama.actor_tmdb_id = $1`,
    [actorTmdbId]
  )
  return result.rows
}

// Options for getCursedActors query
export interface CursedActorsOptions {
  limit?: number
  offset?: number
  minMovies?: number
  actorStatus?: "living" | "deceased" | "all"
  fromYear?: number
  toYear?: number
}

// Cursed actor record returned from database
export interface CursedActorRecord {
  actor_tmdb_id: number
  actor_name: string
  is_deceased: boolean
  total_movies: number
  total_actual_deaths: number
  total_expected_deaths: number
  curse_score: number
}

// Get "cursed actors" - actors with high co-star mortality
// Ranks actors by total excess deaths (actual - expected) across their filmography
export async function getCursedActors(options: CursedActorsOptions = {}): Promise<{
  actors: CursedActorRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0, minMovies = 2, actorStatus = "all", fromYear, toYear } = options

  const db = getPool()

  // Build dynamic WHERE clause
  const conditions: string[] = ["m.expected_deaths IS NOT NULL"]
  const params: (number | string)[] = []
  let paramIndex = 1

  // Actor status filter (is_deceased derived from actors.deathday IS NOT NULL)
  if (actorStatus === "living") {
    conditions.push(`a.deathday IS NULL`)
  } else if (actorStatus === "deceased") {
    conditions.push(`a.deathday IS NOT NULL`)
  }
  // "all" means no filter on deceased status

  // Year range filters
  if (fromYear !== undefined) {
    conditions.push(`m.release_year >= $${paramIndex}`)
    params.push(fromYear)
    paramIndex++
  }
  if (toYear !== undefined) {
    conditions.push(`m.release_year <= $${paramIndex}`)
    params.push(toYear)
    paramIndex++
  }

  const whereClause = conditions.join(" AND ")

  // Add pagination params
  params.push(minMovies) // for HAVING clause
  const minMoviesParamIndex = paramIndex++
  params.push(limit)
  const limitParamIndex = paramIndex++
  params.push(offset)
  const offsetParamIndex = paramIndex++

  const query = `
    SELECT
      aa.actor_tmdb_id,
      a.name as actor_name,
      (a.deathday IS NOT NULL) as is_deceased,
      COUNT(DISTINCT aa.movie_tmdb_id)::integer as total_movies,
      SUM(m.deceased_count)::integer as total_actual_deaths,
      ROUND(SUM(m.expected_deaths)::numeric, 1) as total_expected_deaths,
      ROUND((SUM(m.deceased_count) - SUM(m.expected_deaths))::numeric, 1) as curse_score,
      COUNT(*) OVER() as total_count
    FROM actor_movie_appearances aa
    JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
    JOIN actors a ON aa.actor_tmdb_id = a.tmdb_id
    WHERE ${whereClause}
    GROUP BY aa.actor_tmdb_id, a.name, a.deathday
    HAVING COUNT(DISTINCT aa.movie_tmdb_id) >= $${minMoviesParamIndex}
    ORDER BY curse_score DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `

  const result = await db.query(query, params)

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

  // Remove the total_count field from each row
  const actors = result.rows.map(
    ({ total_count: _, ...actor }: { total_count: string } & CursedActorRecord) => actor
  )

  return { actors, totalCount }
}

// ============================================================================
// Site statistics functions
// ============================================================================

export interface SiteStats {
  totalDeceasedActors: number
  totalMoviesAnalyzed: number
  topCauseOfDeath: string | null
  avgMortalityPercentage: number | null
}

// In-memory cache for site stats (5-minute TTL)
// This query takes ~205ms and runs on every homepage load
let siteStatsCache: SiteStats | null = null
let siteStatsCacheExpiry = 0
const SITE_STATS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Get aggregate site statistics for the homepage (cached)
export async function getSiteStats(): Promise<SiteStats> {
  const now = Date.now()

  // Return cached result if still valid
  if (siteStatsCache && now < siteStatsCacheExpiry) {
    return siteStatsCache
  }

  const db = getPool()

  // Get counts and top cause of death in a single query
  const result = await db.query<{
    total_actors: string
    total_movies: string
    top_cause: string | null
    avg_mortality: string | null
  }>(`
    SELECT
      (SELECT COUNT(*) FROM actors WHERE deathday IS NOT NULL) as total_actors,
      (SELECT COUNT(*) FROM movies WHERE mortality_surprise_score IS NOT NULL) as total_movies,
      (SELECT cause_of_death FROM actors
       WHERE cause_of_death IS NOT NULL
       GROUP BY cause_of_death
       ORDER BY COUNT(*) DESC
       LIMIT 1) as top_cause,
      (SELECT ROUND(AVG(
        CASE WHEN cast_count > 0
          THEN (deceased_count::numeric / cast_count) * 100
          ELSE NULL
        END
      ), 1) FROM movies WHERE cast_count > 0) as avg_mortality
  `)

  const row = result.rows[0]
  const stats: SiteStats = {
    totalDeceasedActors: parseInt(row.total_actors, 10) || 0,
    totalMoviesAnalyzed: parseInt(row.total_movies, 10) || 0,
    topCauseOfDeath: row.top_cause,
    avgMortalityPercentage: row.avg_mortality ? parseFloat(row.avg_mortality) : null,
  }

  // Cache the result
  siteStatsCache = stats
  siteStatsCacheExpiry = now + SITE_STATS_CACHE_TTL_MS

  return stats
}

// ============================================================================
// Sync state functions for TMDB Changes API synchronization
// ============================================================================

export interface SyncStateRecord {
  sync_type: string
  last_sync_date: string // YYYY-MM-DD
  last_run_at: Date
  items_processed: number
  new_deaths_found: number
  movies_updated: number
  errors_count: number
  // Import tracking columns (optional, only used by import scripts)
  current_phase: string | null
  last_processed_id: number | null
  phase_total: number | null
  phase_completed: number | null
}

/**
 * Get sync state for a given sync type.
 * @param syncType - The sync type identifier (e.g., 'person_changes', 'movie_changes')
 * @returns The sync state record, or null if no sync has been run for this type
 */
export async function getSyncState(syncType: string): Promise<SyncStateRecord | null> {
  const db = getPool()
  const result = await db.query<SyncStateRecord>(
    `SELECT sync_type, last_sync_date::text, last_run_at, items_processed, new_deaths_found, movies_updated, errors_count,
            current_phase, last_processed_id, phase_total, phase_completed
     FROM sync_state WHERE sync_type = $1`,
    [syncType]
  )
  return result.rows[0] || null
}

/**
 * Update or insert sync state. Uses COALESCE to preserve existing values
 * when fields are not provided (null/undefined).
 * @param state - Partial sync state with required sync_type. Omit fields to preserve existing DB values.
 */
export async function updateSyncState(
  state: Partial<SyncStateRecord> & { sync_type: string }
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO sync_state (sync_type, last_sync_date, last_run_at, items_processed, new_deaths_found, movies_updated, errors_count, current_phase, last_processed_id, phase_total, phase_completed)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (sync_type) DO UPDATE SET
       last_sync_date = COALESCE($2, sync_state.last_sync_date),
       last_run_at = NOW(),
       items_processed = COALESCE($3, sync_state.items_processed),
       new_deaths_found = COALESCE($4, sync_state.new_deaths_found),
       movies_updated = COALESCE($5, sync_state.movies_updated),
       errors_count = COALESCE($6, sync_state.errors_count),
       current_phase = COALESCE($7, sync_state.current_phase),
       last_processed_id = COALESCE($8, sync_state.last_processed_id),
       phase_total = COALESCE($9, sync_state.phase_total),
       phase_completed = COALESCE($10, sync_state.phase_completed)`,
    [
      state.sync_type,
      state.last_sync_date || null,
      state.items_processed ?? null,
      state.new_deaths_found ?? null,
      state.movies_updated ?? null,
      state.errors_count ?? null,
      state.current_phase ?? null,
      state.last_processed_id ?? null,
      state.phase_total ?? null,
      state.phase_completed ?? null,
    ]
  )
}

// Get all unique actor TMDB IDs from actor_appearances
export async function getAllActorTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ actor_tmdb_id: number }>(
    `SELECT DISTINCT actor_tmdb_id FROM actor_movie_appearances`
  )
  return new Set(result.rows.map((r) => r.actor_tmdb_id))
}

// Get all TMDB IDs of deceased persons in our database
export async function getDeceasedTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(
    `SELECT tmdb_id FROM actors WHERE deathday IS NOT NULL`
  )
  return new Set(result.rows.map((r) => r.tmdb_id))
}

// Get all movie TMDB IDs from movies table
export async function getAllMovieTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(`SELECT tmdb_id FROM movies`)
  return new Set(result.rows.map((r) => r.tmdb_id))
}

// Get recently deceased actors for homepage display (ordered by death date)
export async function getRecentDeaths(limit: number = 5): Promise<
  Array<{
    tmdb_id: number
    name: string
    deathday: string
    cause_of_death: string | null
    profile_path: string | null
  }>
> {
  const db = getPool()
  const result = await db.query(
    `SELECT tmdb_id, name, deathday, cause_of_death, profile_path
     FROM actors
     WHERE deathday IS NOT NULL
     ORDER BY deathday DESC
     LIMIT $1`,
    [limit]
  )
  return result.rows
}

// ============================================================================
// Forever Young feature - movies with leading actors who died young
// ============================================================================

export interface ForeverYoungMovie {
  tmdb_id: number
  title: string
  release_date: string | null
  actor_name: string
  years_lost: number
}

// Get movies featuring leading actors (top 3 billing) who died abnormally young
// Returns movies ordered by years lost, for random selection
export async function getForeverYoungMovies(limit: number = 100): Promise<ForeverYoungMovie[]> {
  const db = getPool()
  // Find movies where a leading actor died with 40%+ of their expected lifespan still ahead
  // i.e., years_lost > expected_lifespan * 0.40
  const result = await db.query<ForeverYoungMovie>(
    `SELECT DISTINCT ON (m.tmdb_id)
       m.tmdb_id,
       m.title,
       m.release_date,
       a.name as actor_name,
       a.years_lost
     FROM actor_movie_appearances aa
     JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
     JOIN actors a ON aa.actor_tmdb_id = a.tmdb_id
     WHERE aa.billing_order <= 3
       AND a.years_lost > a.expected_lifespan * 0.40
     ORDER BY m.tmdb_id, a.years_lost DESC`,
    []
  )

  // Sort by years_lost and limit after deduplication
  return result.rows.sort((a, b) => b.years_lost - a.years_lost).slice(0, limit)
}

// Paginated version for the Forever Young list page
export interface ForeverYoungMovieRecord {
  movie_tmdb_id: number
  movie_title: string
  movie_release_year: number | null
  movie_poster_path: string | null
  actor_tmdb_id: number
  actor_name: string
  actor_profile_path: string | null
  years_lost: number
  cause_of_death: string | null
  cause_of_death_details: string | null
}

export interface ForeverYoungOptions {
  limit?: number
  offset?: number
}

// Get movies featuring leading actors who died abnormally young with pagination
export async function getForeverYoungMoviesPaginated(
  options: ForeverYoungOptions = {}
): Promise<{ movies: ForeverYoungMovieRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  // Find movies where a leading actor died with 40%+ of their expected lifespan still ahead
  // Uses CTE to get one actor per movie (the one who lost the most years),
  // then paginates and returns with total count
  const result = await db.query<ForeverYoungMovieRecord & { total_count: string }>(
    `WITH forever_young_movies AS (
       SELECT DISTINCT ON (m.tmdb_id)
         m.tmdb_id as movie_tmdb_id,
         m.title as movie_title,
         m.release_year as movie_release_year,
         m.poster_path as movie_poster_path,
         a.tmdb_id as actor_tmdb_id,
         a.name as actor_name,
         a.profile_path as actor_profile_path,
         a.years_lost,
         a.cause_of_death,
         a.cause_of_death_details
       FROM actor_movie_appearances aa
       JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
       JOIN actors a ON aa.actor_tmdb_id = a.tmdb_id
       WHERE aa.billing_order <= 3
         AND a.years_lost > a.expected_lifespan * 0.40
       ORDER BY m.tmdb_id, a.years_lost DESC
     )
     SELECT COUNT(*) OVER() as total_count, *
     FROM forever_young_movies
     ORDER BY years_lost DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const movies = result.rows.map(({ total_count: _total_count, ...movie }) => movie)

  return { movies, totalCount }
}

// ============================================================================
// Actor profile functions
// ============================================================================

export interface ActorFilmographyMovie {
  movieId: number
  title: string
  releaseYear: number | null
  character: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
}

// ============================================================================
// COVID-19 deaths functions
// ============================================================================

export interface CovidDeathOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
}

// Get deceased persons who died from COVID-19 or related causes
export async function getCovidDeaths(options: CovidDeathOptions = {}): Promise<{
  persons: ActorRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0, includeObscure = false } = options
  const db = getPool()

  const result = await db.query<ActorRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM actors
     WHERE (cause_of_death ILIKE '%covid%'
        OR cause_of_death ILIKE '%coronavirus%'
        OR cause_of_death ILIKE '%sars-cov-2%'
        OR cause_of_death_details ILIKE '%covid%'
        OR cause_of_death_details ILIKE '%coronavirus%'
        OR cause_of_death_details ILIKE '%sars-cov-2%')
     AND ($3 = true OR is_obscure = false)
     ORDER BY deathday DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, includeObscure]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const persons = result.rows.map(({ total_count: _total_count, ...person }) => person)

  return { persons, totalCount }
}

// ============================================================================
// Unnatural deaths functions
// ============================================================================

// Categories of unnatural death with their SQL pattern conditions
export const UNNATURAL_DEATH_CATEGORIES = {
  suicide: {
    label: "Suicide",
    patterns: [
      "suicide",
      "self-inflicted",
      "took own life",
      "took his own life",
      "took her own life",
      "died by suicide",
      "hanging to death",
    ],
  },
  accident: {
    label: "Accidents",
    patterns: [
      "traffic collision",
      "car accident",
      "motorcycle accident",
      "automobile accident",
      "road accident",
      "struck by vehicle",
      "bicycle accident",
      "plane crash",
      "aviation accident",
      "helicopter crash",
      "aircraft crash",
      "falling from height",
      "falling",
      "accidental fall",
      "accidental drowning",
      "drowning",
    ],
  },
  overdose: {
    label: "Overdose",
    patterns: ["drug overdose", "overdose", "intoxication", "barbiturate"],
  },
  homicide: {
    label: "Homicide",
    patterns: [
      "gunshot wound",
      "gunshot",
      "shooting",
      "homicide",
      "murdered",
      "stabbing",
      "stab wound",
      "strangulation",
      "strangled",
    ],
  },
  other: {
    label: "Other",
    patterns: [
      "carbon monoxide poisoning",
      "cyanide poisoning",
      "burns",
      "fire",
      "smoke inhalation",
      "september 11",
      "animal attack",
      "heat stroke",
      "hyperthermia",
      "exposure and dehydration",
    ],
  },
} as const

export type UnnaturalDeathCategory = keyof typeof UNNATURAL_DEATH_CATEGORIES

export interface UnnaturalDeathsOptions {
  limit?: number
  offset?: number
  category?: UnnaturalDeathCategory | "all"
  hideSuicides?: boolean // Deprecated - use showSelfInflicted instead
  showSelfInflicted?: boolean
  includeObscure?: boolean
}

/**
 * SQL Pattern Building for Unnatural Deaths
 *
 * SECURITY NOTE: These functions build SQL fragments from HARDCODED CONSTANTS only.
 * The patterns come from UNNATURAL_DEATH_CATEGORIES (defined above with `as const`),
 * which are compile-time string literals, NOT user input.
 *
 * This is an intentional exception to the "no string interpolation" SQL guideline because:
 * 1. All patterns are hardcoded constants defined in this file
 * 2. Patterns are escaped via escapeSqlLikePattern() for defense-in-depth
 * 3. PostgreSQL doesn't support parameterized LIKE patterns efficiently
 * 4. Refactoring to parameterized queries would require significant complexity
 *    (dynamic parameter counts, array unnesting) with no security benefit
 *
 * DO NOT use these functions with user-provided input.
 */

// Escape single quotes in SQL LIKE patterns for defense-in-depth
function escapeSqlLikePattern(pattern: string): string {
  return pattern.replace(/'/g, "''")
}

// Build SQL condition for a category's patterns (hardcoded constants only)
function buildCategoryCondition(patterns: readonly string[]): string {
  return patterns
    .map((p) => {
      const escaped = escapeSqlLikePattern(p.toLowerCase())
      return `LOWER(COALESCE(cause_of_death, '') || ' ' || COALESCE(cause_of_death_details, '')) LIKE '%${escaped}%'`
    })
    .join(" OR ")
}

// Get all unnatural death pattern conditions
function getAllUnnaturalPatterns(): string {
  const conditions = Object.values(UNNATURAL_DEATH_CATEGORIES)
    .map((cat) => `(${buildCategoryCondition(cat.patterns)})`)
    .join(" OR ")
  return conditions
}

// Get non-suicide unnatural pattern conditions
function getNonSuicideUnnaturalPatterns(): string {
  const conditions = Object.entries(UNNATURAL_DEATH_CATEGORIES)
    .filter(([key]) => key !== "suicide")
    .map(([, cat]) => `(${buildCategoryCondition(cat.patterns)})`)
    .join(" OR ")
  return conditions
}

// Get deceased persons who died from unnatural causes
export async function getUnnaturalDeaths(options: UnnaturalDeathsOptions = {}): Promise<{
  persons: ActorRecord[]
  totalCount: number
  categoryCounts: Record<UnnaturalDeathCategory, number>
}> {
  const {
    limit = 50,
    offset = 0,
    category = "all",
    hideSuicides = false,
    showSelfInflicted,
    includeObscure = false,
  } = options
  const db = getPool()

  // Support both old hideSuicides and new showSelfInflicted parameters
  // showSelfInflicted=true means show suicides, showSelfInflicted=false means hide
  // hideSuicides=true means hide suicides (deprecated)
  // Default: hide suicides (showSelfInflicted=false)
  const shouldHideSuicides =
    showSelfInflicted !== undefined ? !showSelfInflicted : (hideSuicides ?? true)

  // Build WHERE clause based on category and suicide visibility
  let whereCondition: string
  if (category === "all") {
    whereCondition = shouldHideSuicides
      ? getNonSuicideUnnaturalPatterns()
      : getAllUnnaturalPatterns()
  } else if (category === "suicide" && shouldHideSuicides) {
    // User is filtering to suicide but also hiding suicides - return empty
    return {
      persons: [],
      totalCount: 0,
      categoryCounts: { suicide: 0, accident: 0, overdose: 0, homicide: 0, other: 0 },
    }
  } else {
    const categoryInfo = UNNATURAL_DEATH_CATEGORIES[category]
    whereCondition = buildCategoryCondition(categoryInfo.patterns)
  }

  // Get persons matching the filter
  const result = await db.query<ActorRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM actors
     WHERE (${whereCondition}) AND ($3 = true OR is_obscure = false)
     ORDER BY deathday DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, includeObscure]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const persons = result.rows.map(({ total_count: _total_count, ...person }) => person)

  // Get counts for each category (for the filter badges) - also apply obscure filter
  const categoryCountsResult = await db.query<{ category: string; count: string }>(
    `SELECT
      CASE
        WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.suicide.patterns)} THEN 'suicide'
        WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.accident.patterns)} THEN 'accident'
        WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.overdose.patterns)} THEN 'overdose'
        WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.homicide.patterns)} THEN 'homicide'
        WHEN ${buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.other.patterns)} THEN 'other'
      END as category,
      COUNT(*) as count
    FROM actors
    WHERE (${getAllUnnaturalPatterns()}) AND ($1 = true OR is_obscure = false)
    GROUP BY category`,
    [includeObscure]
  )

  const categoryCounts: Record<UnnaturalDeathCategory, number> = {
    suicide: 0,
    accident: 0,
    overdose: 0,
    homicide: 0,
    other: 0,
  }

  for (const row of categoryCountsResult.rows) {
    if (row.category && row.category in categoryCounts) {
      categoryCounts[row.category as UnnaturalDeathCategory] = parseInt(row.count, 10)
    }
  }

  return { persons, totalCount, categoryCounts }
}

// Get all deceased persons, paginated (for "All Deaths" page)
// Requires actors to have appeared in 2+ movies OR 10+ TV episodes
export interface AllDeathsOptions {
  limit?: number
  offset?: number
  includeObscure?: boolean
  search?: string
}

export async function getAllDeaths(options: AllDeathsOptions = {}): Promise<{
  persons: ActorRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0, includeObscure = false, search } = options
  const db = getPool()

  // Always pass search parameter (null if not searching) - avoids SQL string interpolation
  const searchPattern = search ? `%${search}%` : null

  const result = await db.query<ActorRecord & { total_count: string }>(
    `WITH actor_appearances AS (
       SELECT
         a.tmdb_id,
         COUNT(DISTINCT ama.movie_tmdb_id) as movie_count,
         COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) as episode_count
       FROM actors a
       LEFT JOIN actor_movie_appearances ama ON ama.actor_tmdb_id = a.tmdb_id
       LEFT JOIN actor_show_appearances asa ON asa.actor_tmdb_id = a.tmdb_id
       WHERE a.deathday IS NOT NULL
       GROUP BY a.tmdb_id
       HAVING COUNT(DISTINCT ama.movie_tmdb_id) >= 2
          OR COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) >= 10
     )
     SELECT COUNT(*) OVER () as total_count, actors.*
     FROM actors
     JOIN actor_appearances aa ON aa.tmdb_id = actors.tmdb_id
     WHERE ($3 = true OR is_obscure = false)
       AND ($4::text IS NULL OR actors.name ILIKE $4)
     ORDER BY deathday DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, includeObscure, searchPattern]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const persons = result.rows.map(({ total_count: _total_count, ...person }) => person)

  return { persons, totalCount }
}

// Get actor's filmography from our database
export async function getActorFilmography(actorTmdbId: number): Promise<ActorFilmographyMovie[]> {
  const db = getPool()

  const filmographyResult = await db.query<{
    movie_id: number
    title: string
    release_year: number | null
    character_name: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
  }>(
    `SELECT
       m.tmdb_id as movie_id,
       m.title,
       m.release_year,
       aa.character_name,
       m.poster_path,
       m.deceased_count,
       m.cast_count
     FROM actor_movie_appearances aa
     JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
     WHERE aa.actor_tmdb_id = $1
     ORDER BY m.release_year DESC NULLS LAST`,
    [actorTmdbId]
  )

  return filmographyResult.rows.map((row) => ({
    movieId: row.movie_id,
    title: row.title,
    releaseYear: row.release_year,
    character: row.character_name,
    posterPath: row.poster_path,
    deceasedCount: row.deceased_count,
    castCount: row.cast_count,
  }))
}

// ============================================================================
// Death Watch feature - living actors most likely to die soon
// ============================================================================

export interface DeathWatchOptions {
  limit?: number
  offset?: number
  minAge?: number
  includeObscure?: boolean
  search?: string
}

export interface DeathWatchActorRecord {
  actor_tmdb_id: number
  actor_name: string
  birthday: string
  age: number
  profile_path: string | null
  popularity: number | null
  total_movies: number
  total_episodes: number
}

// Get living actors for the Death Watch feature
// Returns actors ordered by age (oldest first = highest death probability)
// Death probability is calculated in application code using actuarial tables
// Requires actors to have appeared in 2+ movies OR 10+ TV episodes
export async function getDeathWatchActors(options: DeathWatchOptions = {}): Promise<{
  actors: DeathWatchActorRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0, minAge, includeObscure = false, search } = options

  const db = getPool()

  // Build dynamic WHERE conditions
  const conditions: string[] = []
  const params: (number | boolean | string)[] = []
  let paramIndex = 1

  // Min age filter (applied in outer WHERE)
  if (minAge !== undefined) {
    conditions.push(`age >= $${paramIndex}`)
    params.push(minAge)
    paramIndex++
  }

  // Obscure filter - exclude actors without profile photos or low popularity
  if (!includeObscure) {
    conditions.push(`profile_path IS NOT NULL`)
    conditions.push(`popularity >= 5.0`)
  }

  // Search filter
  if (search) {
    conditions.push(`actor_name ILIKE $${paramIndex}`)
    params.push(`%${search}%`)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Add pagination params
  params.push(limit)
  const limitParamIndex = paramIndex++
  params.push(offset)
  const offsetParamIndex = paramIndex++

  const query = `
    WITH living_actors AS (
      SELECT
        a.tmdb_id as actor_tmdb_id,
        a.name as actor_name,
        a.birthday,
        a.profile_path,
        a.popularity,
        COUNT(DISTINCT ama.movie_tmdb_id) as total_movies,
        COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) as total_episodes,
        EXTRACT(YEAR FROM age(a.birthday))::integer as age
      FROM actors a
      LEFT JOIN actor_movie_appearances ama ON ama.actor_tmdb_id = a.tmdb_id
      LEFT JOIN actor_show_appearances asa ON asa.actor_tmdb_id = a.tmdb_id
      WHERE a.deathday IS NULL
        AND a.birthday IS NOT NULL
      GROUP BY a.tmdb_id, a.name, a.birthday, a.profile_path, a.popularity
      HAVING COUNT(DISTINCT ama.movie_tmdb_id) >= 2
         OR COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) >= 10
    )
    SELECT
      actor_tmdb_id,
      actor_name,
      birthday::text,
      age,
      profile_path,
      popularity::decimal,
      total_movies::integer,
      total_episodes::integer,
      COUNT(*) OVER() as total_count
    FROM living_actors
    ${whereClause}
    ORDER BY age DESC, popularity DESC NULLS LAST
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `

  const result = await db.query(query, params)

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0

  // Remove the total_count field from each row
  const actors = result.rows.map(
    ({
      total_count: _,
      ...actor
    }: { total_count: string } & DeathWatchActorRecord): DeathWatchActorRecord => ({
      ...actor,
      popularity: actor.popularity ? parseFloat(String(actor.popularity)) : null,
    })
  )

  return { actors, totalCount }
}

// ============================================================================
// Movies by Genre functions (SEO category pages)
// ============================================================================

export interface GenreCategory {
  genre: string
  count: number
  slug: string
}

export async function getGenreCategories(): Promise<GenreCategory[]> {
  const db = getPool()

  // Unnest the genres array and count movies per genre
  const result = await db.query<{ genre: string; count: string }>(`
    SELECT unnest(genres) as genre, COUNT(*) as count
    FROM movies
    WHERE genres IS NOT NULL
      AND array_length(genres, 1) > 0
      AND deceased_count > 0
    GROUP BY genre
    HAVING COUNT(*) >= 5
    ORDER BY count DESC, genre
  `)

  return result.rows.map((row) => ({
    genre: row.genre,
    count: parseInt(row.count, 10),
    slug: row.genre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  }))
}

export interface MovieByGenreRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

export interface MoviesByGenreOptions {
  limit?: number
  offset?: number
}

export async function getMoviesByGenre(
  genre: string,
  options: MoviesByGenreOptions = {}
): Promise<{ movies: MovieByGenreRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM movies
     WHERE $1 = ANY(genres)
       AND deceased_count > 0`,
    [genre]
  )
  const totalCount = parseInt(countResult.rows[0].count, 10)

  // Get paginated results, sorted by mortality surprise score (cursed movies first)
  const result = await db.query<MovieByGenreRecord>(
    `SELECT tmdb_id, title, release_year, poster_path, deceased_count,
            cast_count, expected_deaths, mortality_surprise_score
     FROM movies
     WHERE $1 = ANY(genres)
       AND deceased_count > 0
     ORDER BY mortality_surprise_score DESC NULLS LAST, deceased_count DESC, title
     LIMIT $2 OFFSET $3`,
    [genre, limit, offset]
  )

  return { movies: result.rows, totalCount }
}

// Find the original genre name from a slug
export async function getGenreFromSlug(slug: string): Promise<string | null> {
  const db = getPool()

  // Get all genres and find the one matching the slug
  const result = await db.query<{ genre: string }>(`
    SELECT DISTINCT unnest(genres) as genre
    FROM movies
    WHERE genres IS NOT NULL
      AND array_length(genres, 1) > 0
  `)

  for (const row of result.rows) {
    const genreSlug = row.genre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    if (genreSlug === slug) {
      return row.genre
    }
  }

  return null
}

// ============================================================================
// TV Shows table functions
// ============================================================================

export interface ShowRecord {
  tmdb_id: number
  name: string
  first_air_date: string | null
  last_air_date: string | null
  poster_path: string | null
  backdrop_path: string | null
  genres: string[]
  status: string | null
  number_of_seasons: number | null
  number_of_episodes: number | null
  popularity: number | null
  vote_average: number | null
  origin_country: string[]
  original_language: string | null
  cast_count: number | null
  deceased_count: number | null
  living_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get a show by TMDB ID
export async function getShow(tmdbId: number): Promise<ShowRecord | null> {
  const db = getPool()
  const result = await db.query<ShowRecord>("SELECT * FROM shows WHERE tmdb_id = $1", [tmdbId])
  return result.rows[0] || null
}

// Insert or update a show
export async function upsertShow(show: ShowRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO shows (
       tmdb_id, name, first_air_date, last_air_date, poster_path, backdrop_path,
       genres, status, number_of_seasons, number_of_episodes, popularity, vote_average,
       origin_country, original_language, cast_count, deceased_count, living_count,
       expected_deaths, mortality_surprise_score, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       first_air_date = EXCLUDED.first_air_date,
       last_air_date = EXCLUDED.last_air_date,
       poster_path = EXCLUDED.poster_path,
       backdrop_path = EXCLUDED.backdrop_path,
       genres = EXCLUDED.genres,
       status = EXCLUDED.status,
       number_of_seasons = EXCLUDED.number_of_seasons,
       number_of_episodes = EXCLUDED.number_of_episodes,
       popularity = EXCLUDED.popularity,
       vote_average = EXCLUDED.vote_average,
       origin_country = EXCLUDED.origin_country,
       original_language = COALESCE(EXCLUDED.original_language, shows.original_language),
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       living_count = EXCLUDED.living_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       updated_at = CURRENT_TIMESTAMP`,
    [
      show.tmdb_id,
      show.name,
      show.first_air_date,
      show.last_air_date,
      show.poster_path,
      show.backdrop_path,
      show.genres,
      show.status,
      show.number_of_seasons,
      show.number_of_episodes,
      show.popularity,
      show.vote_average,
      show.origin_country,
      show.original_language,
      show.cast_count,
      show.deceased_count,
      show.living_count,
      show.expected_deaths,
      show.mortality_surprise_score,
    ]
  )
}

// ============================================================================
// Seasons table functions
// ============================================================================

export interface SeasonRecord {
  show_tmdb_id: number
  season_number: number
  name: string | null
  air_date: string | null
  episode_count: number | null
  poster_path: string | null
  cast_count: number | null
  deceased_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get seasons for a show
export async function getSeasons(showTmdbId: number): Promise<SeasonRecord[]> {
  const db = getPool()
  const result = await db.query<SeasonRecord>(
    "SELECT * FROM seasons WHERE show_tmdb_id = $1 ORDER BY season_number",
    [showTmdbId]
  )
  return result.rows
}

// Insert or update a season
export async function upsertSeason(season: SeasonRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO seasons (
       show_tmdb_id, season_number, name, air_date, episode_count, poster_path,
       cast_count, deceased_count, expected_deaths, mortality_surprise_score
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (show_tmdb_id, season_number) DO UPDATE SET
       name = EXCLUDED.name,
       air_date = EXCLUDED.air_date,
       episode_count = EXCLUDED.episode_count,
       poster_path = EXCLUDED.poster_path,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score`,
    [
      season.show_tmdb_id,
      season.season_number,
      season.name,
      season.air_date,
      season.episode_count,
      season.poster_path,
      season.cast_count,
      season.deceased_count,
      season.expected_deaths,
      season.mortality_surprise_score,
    ]
  )
}

// ============================================================================
// Episodes table functions
// ============================================================================

export interface EpisodeRecord {
  show_tmdb_id: number
  season_number: number
  episode_number: number
  name: string | null
  air_date: string | null
  runtime: number | null
  cast_count: number | null
  deceased_count: number | null
  guest_star_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get episodes for a season
export async function getEpisodes(
  showTmdbId: number,
  seasonNumber: number
): Promise<EpisodeRecord[]> {
  const db = getPool()
  const result = await db.query<EpisodeRecord>(
    "SELECT * FROM episodes WHERE show_tmdb_id = $1 AND season_number = $2 ORDER BY episode_number",
    [showTmdbId, seasonNumber]
  )
  return result.rows
}

// Insert or update an episode
export async function upsertEpisode(episode: EpisodeRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO episodes (
       show_tmdb_id, season_number, episode_number, name, air_date, runtime,
       cast_count, deceased_count, guest_star_count, expected_deaths, mortality_surprise_score
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (show_tmdb_id, season_number, episode_number) DO UPDATE SET
       name = EXCLUDED.name,
       air_date = EXCLUDED.air_date,
       runtime = EXCLUDED.runtime,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       guest_star_count = EXCLUDED.guest_star_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score`,
    [
      episode.show_tmdb_id,
      episode.season_number,
      episode.episode_number,
      episode.name,
      episode.air_date,
      episode.runtime,
      episode.cast_count,
      episode.deceased_count,
      episode.guest_star_count,
      episode.expected_deaths,
      episode.mortality_surprise_score,
    ]
  )
}

// ============================================================================
// Show actor appearances table functions
// ============================================================================

// Show actor appearance record (junction table only - actor metadata comes from actors table)
export interface ShowActorAppearanceRecord {
  actor_tmdb_id: number
  show_tmdb_id: number
  season_number: number
  episode_number: number
  character_name: string | null
  appearance_type: string // 'regular', 'recurring', 'guest'
  billing_order: number | null
  age_at_filming: number | null
}

// Insert or update a show actor appearance
export async function upsertShowActorAppearance(
  appearance: ShowActorAppearanceRecord
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO actor_show_appearances (
       actor_tmdb_id, show_tmdb_id, season_number, episode_number,
       character_name, appearance_type, billing_order, age_at_filming
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (actor_tmdb_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
       character_name = EXCLUDED.character_name,
       appearance_type = EXCLUDED.appearance_type,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming`,
    [
      appearance.actor_tmdb_id,
      appearance.show_tmdb_id,
      appearance.season_number,
      appearance.episode_number,
      appearance.character_name,
      appearance.appearance_type,
      appearance.billing_order,
      appearance.age_at_filming,
    ]
  )
}

// Batch insert show actor appearances using bulk VALUES for efficiency
export async function batchUpsertShowActorAppearances(
  appearances: ShowActorAppearanceRecord[]
): Promise<void> {
  if (appearances.length === 0) return

  const db = getPool()

  // Process in chunks of 100 to avoid query size limits
  const CHUNK_SIZE = 100
  for (let i = 0; i < appearances.length; i += CHUNK_SIZE) {
    const chunk = appearances.slice(i, i + CHUNK_SIZE)

    // Build VALUES clause with numbered parameters (8 columns now)
    const values: unknown[] = []
    const placeholders = chunk.map((appearance, index) => {
      const offset = index * 8
      values.push(
        appearance.actor_tmdb_id,
        appearance.show_tmdb_id,
        appearance.season_number,
        appearance.episode_number,
        appearance.character_name,
        appearance.appearance_type,
        appearance.billing_order,
        appearance.age_at_filming
      )
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
    })

    await db.query(
      `INSERT INTO actor_show_appearances (
         actor_tmdb_id, show_tmdb_id, season_number, episode_number,
         character_name, appearance_type, billing_order, age_at_filming
       )
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (actor_tmdb_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
         character_name = EXCLUDED.character_name,
         appearance_type = EXCLUDED.appearance_type,
         billing_order = EXCLUDED.billing_order,
         age_at_filming = EXCLUDED.age_at_filming`,
      values
    )
  }
}

// Get unique actors for a show (aggregated across all episodes)
export async function getShowActors(
  showTmdbId: number
): Promise<Array<{ actorTmdbId: number; actorName: string; isDeceased: boolean }>> {
  const db = getPool()
  const result = await db.query<{
    actor_tmdb_id: number
    actor_name: string
    is_deceased: boolean
  }>(
    `SELECT DISTINCT asa.actor_tmdb_id, a.name as actor_name, (a.deathday IS NOT NULL) as is_deceased
     FROM actor_show_appearances asa
     JOIN actors a ON asa.actor_tmdb_id = a.tmdb_id
     WHERE asa.show_tmdb_id = $1
     ORDER BY a.name`,
    [showTmdbId]
  )
  return result.rows.map((row) => ({
    actorTmdbId: row.actor_tmdb_id,
    actorName: row.actor_name,
    isDeceased: row.is_deceased,
  }))
}
