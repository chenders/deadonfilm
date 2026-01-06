/**
 * Database functions module.
 *
 * Pool management functions are imported from ./db/pool.js.
 * This file contains all domain-specific database functions.
 */

import { createActorSlug, createMovieSlug } from "./slug-utils.js"
import { categorizeCauseOfDeath, CAUSE_CATEGORIES as CauseCategories } from "./cause-categories.js"

// Re-export pool functions for backward compatibility
export { getPool, resetPool, queryWithRetry, initDatabase } from "./db/pool.js"

// Import getPool for local use
import { getPool } from "./db/pool.js"

// ============================================================================
// Type definitions
// ============================================================================

export type DeathInfoSource = "claude" | "wikipedia" | null

// Date precision for partial dates (year-only, year+month, full date)
export type DatePrecision = "year" | "month" | "day"

// Actor record - unified table for all actors (living and deceased)
export interface ActorRecord {
  id: number
  tmdb_id: number | null // null for non-TMDB actors (from TVmaze/TheTVDB)
  name: string
  birthday: string | null
  birthday_precision?: DatePrecision | null // null/undefined means 'day' (full precision)
  deathday: string | null // null for living actors
  deathday_precision?: DatePrecision | null // null/undefined means 'day' (full precision)
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

  // External IDs for cross-platform matching
  tvmaze_person_id: number | null
  thetvdb_person_id: number | null
  imdb_person_id: string | null // IMDb uses string IDs like "nm0000001"

  // Computed column
  is_obscure: boolean | null
}

// Input type for upserting actors - only name is required
// tmdb_id can be null for non-TMDB actors
export type ActorInput = Pick<ActorRecord, "name"> &
  Partial<Omit<ActorRecord, "name" | "is_obscure">>

// Simplified movie appearance record (junction table only)
export interface ActorMovieAppearanceRecord {
  actor_id: number
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
    // tmdb_id should never be null here since we're querying by tmdb_id,
    // but we need to satisfy TypeScript
    if (row.tmdb_id !== null) {
      map.set(row.tmdb_id, row)
    }
  }
  return map
}

// Insert or update an actor
// Note: COALESCE prioritizes existing values over new values to preserve first-found data.
// This is intentional - once we have death info, we don't overwrite it with potentially
// different/conflicting data from later lookups.
// Returns the actor's internal id (useful for creating appearance records)
export async function upsertActor(actor: ActorInput): Promise<number> {
  const db = getPool()

  // For actors with tmdb_id, use ON CONFLICT on tmdb_id
  // For actors without tmdb_id (TVmaze/TheTVDB only), use a different approach
  if (actor.tmdb_id === null || actor.tmdb_id === undefined) {
    // Non-TMDB actor - look up by external IDs or insert new
    if (actor.tvmaze_person_id) {
      const existing = await db.query<{ id: number }>(
        `SELECT id FROM actors WHERE tvmaze_person_id = $1`,
        [actor.tvmaze_person_id]
      )
      if (existing.rows.length > 0) {
        // Update existing actor
        await db.query(
          `UPDATE actors SET
             name = $2,
             birthday = COALESCE(birthday, $3),
             deathday = COALESCE(deathday, $4),
             profile_path = COALESCE(profile_path, $5),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existing.rows[0].id,
            actor.name,
            actor.birthday ?? null,
            actor.deathday ?? null,
            actor.profile_path ?? null,
          ]
        )
        return existing.rows[0].id
      }
    }
    if (actor.thetvdb_person_id) {
      const existing = await db.query<{ id: number }>(
        `SELECT id FROM actors WHERE thetvdb_person_id = $1`,
        [actor.thetvdb_person_id]
      )
      if (existing.rows.length > 0) {
        // Update existing actor
        await db.query(
          `UPDATE actors SET
             name = $2,
             birthday = COALESCE(birthday, $3),
             deathday = COALESCE(deathday, $4),
             profile_path = COALESCE(profile_path, $5),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existing.rows[0].id,
            actor.name,
            actor.birthday ?? null,
            actor.deathday ?? null,
            actor.profile_path ?? null,
          ]
        )
        return existing.rows[0].id
      }
    }
    if (actor.imdb_person_id) {
      const existing = await db.query<{ id: number }>(
        `SELECT id FROM actors WHERE imdb_person_id = $1`,
        [actor.imdb_person_id]
      )
      if (existing.rows.length > 0) {
        // Update existing actor
        await db.query(
          `UPDATE actors SET
             name = $2,
             birthday = COALESCE(birthday, $3),
             deathday = COALESCE(deathday, $4),
             profile_path = COALESCE(profile_path, $5),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existing.rows[0].id,
            actor.name,
            actor.birthday ?? null,
            actor.deathday ?? null,
            actor.profile_path ?? null,
          ]
        )
        return existing.rows[0].id
      }
    }
    // Insert new non-TMDB actor
    const result = await db.query<{ id: number }>(
      `INSERT INTO actors (name, birthday, deathday, profile_path, popularity, tvmaze_person_id, thetvdb_person_id, imdb_person_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        actor.name,
        actor.birthday ?? null,
        actor.deathday ?? null,
        actor.profile_path ?? null,
        actor.popularity ?? null,
        actor.tvmaze_person_id ?? null,
        actor.thetvdb_person_id ?? null,
        actor.imdb_person_id ?? null,
      ]
    )
    return result.rows[0].id
  }

  // TMDB actor - use ON CONFLICT on tmdb_id
  const result = await db.query<{ id: number }>(
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
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
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
  return result.rows[0].id
}

// Batch insert/update actors
// Returns a map of tmdb_id -> internal actor id (for creating appearance records)
export async function batchUpsertActors(actors: ActorInput[]): Promise<Map<number, number>> {
  const tmdbIdToActorId = new Map<number, number>()
  if (actors.length === 0) return tmdbIdToActorId

  const db = getPool()

  // Use a transaction for batch insert
  const client = await db.connect()
  try {
    await client.query("BEGIN")

    for (const actor of actors) {
      // Skip actors without TMDB IDs - they should use upsertActor directly
      if (actor.tmdb_id === null || actor.tmdb_id === undefined) {
        console.warn(`Skipping actor without tmdb_id in batchUpsertActors: ${actor.name}`)
        continue
      }

      const result = await client.query<{ id: number; tmdb_id: number }>(
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
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, tmdb_id`,
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

      if (result.rows[0]) {
        tmdbIdToActorId.set(result.rows[0].tmdb_id, result.rows[0].id)
      }
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  return tmdbIdToActorId
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

// Update death info by internal actor ID (for non-TMDB actors like those from IMDb)
// Note: COALESCE prioritizes existing values - see comment on upsertActor
export async function updateDeathInfoByActorId(
  actorId: number,
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
     WHERE id = $1`,
    [
      actorId,
      causeOfDeath,
      causeOfDeathSource,
      causeOfDeathDetails,
      causeOfDeathDetailsSource,
      wikipediaUrl,
    ]
  )
}

// Get actor by internal ID
export async function getActorById(id: number): Promise<ActorRecord | null> {
  const db = getPool()
  const result = await db.query<ActorRecord>("SELECT * FROM actors WHERE id = $1", [id])
  return result.rows[0] || null
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
    `INSERT INTO actor_movie_appearances (actor_id, movie_tmdb_id, character_name, billing_order, age_at_filming)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (actor_id, movie_tmdb_id) DO UPDATE SET
       character_name = EXCLUDED.character_name,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming`,
    [
      appearance.actor_id,
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
        `INSERT INTO actor_movie_appearances (actor_id, movie_tmdb_id, character_name, billing_order, age_at_filming)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (actor_id, movie_tmdb_id) DO UPDATE SET
           character_name = EXCLUDED.character_name,
           billing_order = EXCLUDED.billing_order,
           age_at_filming = EXCLUDED.age_at_filming`,
        [
          appearance.actor_id,
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
     JOIN actors a ON ama.actor_id = a.id
     WHERE a.tmdb_id = $1`,
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
  actor_id: number
  actor_tmdb_id: number | null
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
      aa.actor_id,
      a.tmdb_id as actor_tmdb_id,
      a.name as actor_name,
      (a.deathday IS NOT NULL) as is_deceased,
      COUNT(DISTINCT aa.movie_tmdb_id)::integer as total_movies,
      SUM(m.deceased_count)::integer as total_actual_deaths,
      ROUND(SUM(m.expected_deaths)::numeric, 1) as total_expected_deaths,
      ROUND((SUM(m.deceased_count) - SUM(m.expected_deaths))::numeric, 1) as curse_score,
      COUNT(*) OVER() as total_count
    FROM actor_movie_appearances aa
    JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
    JOIN actors a ON aa.actor_id = a.id
    WHERE ${whereClause}
    GROUP BY aa.actor_id, a.tmdb_id, a.name, a.deathday
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
  totalActors: number
  totalDeceasedActors: number
  totalMoviesAnalyzed: number
  topCauseOfDeath: string | null
  topCauseOfDeathCategorySlug: string | null
  avgMortalityPercentage: number | null
  causeOfDeathPercentage: number | null
  actorsWithCauseKnown: number | null
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
    total_all_actors: string
    total_deceased_actors: string
    total_movies: string
    top_cause: string | null
    avg_mortality: string | null
    cause_pct: string | null
    cause_known_count: string | null
  }>(`
    SELECT
      (SELECT COUNT(*) FROM actors) as total_all_actors,
      (SELECT COUNT(*) FROM actors WHERE deathday IS NOT NULL) as total_deceased_actors,
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
      ), 1) FROM movies WHERE cast_count > 0) as avg_mortality,
      (SELECT ROUND(
        COUNT(*) FILTER (WHERE cause_of_death IS NOT NULL)::numeric /
        NULLIF(COUNT(*), 0) * 100, 1
      ) FROM actors WHERE deathday IS NOT NULL) as cause_pct,
      (SELECT COUNT(*) FROM actors WHERE deathday IS NOT NULL AND cause_of_death IS NOT NULL) as cause_known_count
  `)

  const row = result.rows[0]
  const categoryKey = row.top_cause ? categorizeCauseOfDeath(row.top_cause) : null
  const stats: SiteStats = {
    totalActors: parseInt(row.total_all_actors, 10) || 0,
    totalDeceasedActors: parseInt(row.total_deceased_actors, 10) || 0,
    totalMoviesAnalyzed: parseInt(row.total_movies, 10) || 0,
    topCauseOfDeath: row.top_cause,
    topCauseOfDeathCategorySlug: categoryKey ? CauseCategories[categoryKey].slug : null,
    avgMortalityPercentage: row.avg_mortality ? parseFloat(row.avg_mortality) : null,
    causeOfDeathPercentage: row.cause_pct ? parseFloat(row.cause_pct) : null,
    actorsWithCauseKnown: row.cause_known_count ? parseInt(row.cause_known_count, 10) : null,
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

// Get all unique actor TMDB IDs from actor_appearances (excludes actors without TMDB IDs)
export async function getAllActorTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(
    `SELECT DISTINCT a.tmdb_id
     FROM actor_movie_appearances ama
     JOIN actors a ON ama.actor_id = a.id
     WHERE a.tmdb_id IS NOT NULL`
  )
  return new Set(result.rows.map((r) => r.tmdb_id))
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
    cause_of_death_details: string | null
    profile_path: string | null
  }>
> {
  const db = getPool()
  // Use same filtering as getAllDeaths: require 2+ movies or 10+ TV episodes
  const result = await db.query(
    `WITH actor_appearances AS (
       SELECT
         a.id,
         COUNT(DISTINCT ama.movie_tmdb_id) as movie_count,
         COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) as episode_count
       FROM actors a
       LEFT JOIN actor_movie_appearances ama ON ama.actor_id = a.id
       LEFT JOIN actor_show_appearances asa ON asa.actor_id = a.id
       WHERE a.deathday IS NOT NULL
       GROUP BY a.id
       HAVING COUNT(DISTINCT ama.movie_tmdb_id) >= 2
          OR COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) >= 10
     )
     SELECT a.tmdb_id, a.name, a.deathday, a.cause_of_death, a.cause_of_death_details, a.profile_path
     FROM actors a
     JOIN actor_appearances aa ON aa.id = a.id
     WHERE a.is_obscure = false
     ORDER BY a.deathday DESC
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
     JOIN actors a ON aa.actor_id = a.id
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
  actor_id: number
  actor_tmdb_id: number | null
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
         a.id as actor_id,
         a.tmdb_id as actor_tmdb_id,
         a.name as actor_name,
         a.profile_path as actor_profile_path,
         a.years_lost,
         a.cause_of_death,
         a.cause_of_death_details
       FROM actor_movie_appearances aa
       JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
       JOIN actors a ON aa.actor_id = a.id
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

export interface ActorFilmographyShow {
  showId: number
  name: string
  firstAirYear: number | null
  lastAirYear: number | null
  character: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  episodeCount: number
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
      // Use specific burn-related terms to avoid matching actor names like "George Burns"
      "burn injuries",
      "severe burns",
      "burned to death",
      "third-degree burns",
      "house fire",
      "fire",
      "smoke inhalation",
      // Use 9/11-specific terms to avoid matching deaths that happened on September 11 of other years
      "september 11 attacks",
      "september 11, 2001",
      "9/11",
      "world trade center",
      "twin towers",
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
         a.id,
         COUNT(DISTINCT ama.movie_tmdb_id) as movie_count,
         COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) as episode_count
       FROM actors a
       LEFT JOIN actor_movie_appearances ama ON ama.actor_id = a.id
       LEFT JOIN actor_show_appearances asa ON asa.actor_id = a.id
       WHERE a.deathday IS NOT NULL
       GROUP BY a.id
       HAVING COUNT(DISTINCT ama.movie_tmdb_id) >= 2
          OR COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) >= 10
     )
     SELECT COUNT(*) OVER () as total_count, actors.*
     FROM actors
     JOIN actor_appearances aa ON aa.id = actors.id
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

  // Use CTE to calculate mortality stats once per movie, then join with actor's appearances.
  // This avoids N+1 correlated subqueries that were causing slow performance.
  const filmographyResult = await db.query<{
    movie_id: number
    title: string
    release_year: number | null
    character_name: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
  }>(
    `WITH actor_movies AS (
       -- Get all movies this actor appeared in
       SELECT aa.movie_tmdb_id, aa.character_name
       FROM actor_movie_appearances aa
       JOIN actors a ON aa.actor_id = a.id
       WHERE a.tmdb_id = $1
     ),
     movie_stats AS (
       -- Calculate stats for just these movies (single pass)
       SELECT
         aa.movie_tmdb_id,
         COUNT(DISTINCT a.id)::int as cast_count,
         COUNT(DISTINCT a.id) FILTER (WHERE a.deathday IS NOT NULL)::int as deceased_count
       FROM actor_movie_appearances aa
       JOIN actors a ON aa.actor_id = a.id
       WHERE aa.movie_tmdb_id IN (SELECT movie_tmdb_id FROM actor_movies)
       GROUP BY aa.movie_tmdb_id
     )
     SELECT
       m.tmdb_id as movie_id,
       m.title,
       m.release_year,
       am.character_name,
       m.poster_path,
       COALESCE(ms.deceased_count, 0) as deceased_count,
       COALESCE(ms.cast_count, 0) as cast_count
     FROM actor_movies am
     JOIN movies m ON am.movie_tmdb_id = m.tmdb_id
     LEFT JOIN movie_stats ms ON m.tmdb_id = ms.movie_tmdb_id
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

export async function getActorShowFilmography(
  actorTmdbId: number
): Promise<ActorFilmographyShow[]> {
  const db = getPool()

  // Use CTE to calculate mortality stats once per show, then join with actor's appearances.
  // This avoids N+1 correlated subqueries that were causing slow performance.
  const filmographyResult = await db.query<{
    show_id: number
    name: string
    first_air_year: number | null
    last_air_year: number | null
    character_name: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
    episode_count: number
  }>(
    `WITH actor_shows AS (
       -- Get all shows this actor appeared in with their character and episode count
       SELECT
         asa.show_tmdb_id,
         asa.actor_id,
         COUNT(DISTINCT (asa.season_number, asa.episode_number))::int as episode_count,
         -- Get most common character name for this actor in this show
         (ARRAY_AGG(asa.character_name ORDER BY asa.character_name)
          FILTER (WHERE asa.character_name IS NOT NULL))[1] as character_name
       FROM actor_show_appearances asa
       JOIN actors a ON asa.actor_id = a.id
       WHERE a.tmdb_id = $1
       GROUP BY asa.show_tmdb_id, asa.actor_id
     ),
     show_stats AS (
       -- Calculate stats for just these shows (single pass)
       SELECT
         asa.show_tmdb_id,
         COUNT(DISTINCT a.id)::int as cast_count,
         COUNT(DISTINCT a.id) FILTER (WHERE a.deathday IS NOT NULL)::int as deceased_count
       FROM actor_show_appearances asa
       JOIN actors a ON asa.actor_id = a.id
       WHERE asa.show_tmdb_id IN (SELECT show_tmdb_id FROM actor_shows)
       GROUP BY asa.show_tmdb_id
     )
     SELECT
       s.tmdb_id as show_id,
       s.name,
       EXTRACT(YEAR FROM s.first_air_date)::int as first_air_year,
       EXTRACT(YEAR FROM s.last_air_date)::int as last_air_year,
       ash.character_name,
       s.poster_path,
       COALESCE(ss.deceased_count, 0) as deceased_count,
       COALESCE(ss.cast_count, 0) as cast_count,
       ash.episode_count
     FROM actor_shows ash
     JOIN shows s ON ash.show_tmdb_id = s.tmdb_id
     LEFT JOIN show_stats ss ON s.tmdb_id = ss.show_tmdb_id
     ORDER BY s.first_air_date DESC NULLS LAST`,
    [actorTmdbId]
  )

  return filmographyResult.rows.map((row) => ({
    showId: row.show_id,
    name: row.name,
    firstAirYear: row.first_air_year,
    lastAirYear: row.last_air_year,
    character: row.character_name,
    posterPath: row.poster_path,
    deceasedCount: row.deceased_count,
    castCount: row.cast_count,
    episodeCount: row.episode_count,
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
  actor_id: number
  actor_tmdb_id: number | null
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
        a.id as actor_id,
        a.tmdb_id as actor_tmdb_id,
        a.name as actor_name,
        a.birthday,
        a.profile_path,
        a.popularity,
        COUNT(DISTINCT ama.movie_tmdb_id) as total_movies,
        COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) as total_episodes,
        EXTRACT(YEAR FROM age(a.birthday))::integer as age
      FROM actors a
      LEFT JOIN actor_movie_appearances ama ON ama.actor_id = a.id
      LEFT JOIN actor_show_appearances asa ON asa.actor_id = a.id
      WHERE a.deathday IS NULL
        AND a.birthday IS NOT NULL
      GROUP BY a.id, a.tmdb_id, a.name, a.birthday, a.profile_path, a.popularity
      HAVING COUNT(DISTINCT ama.movie_tmdb_id) >= 2
         OR COUNT(DISTINCT (asa.show_tmdb_id, asa.season_number, asa.episode_number)) >= 10
    )
    SELECT
      actor_id,
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
  // External IDs
  tvmaze_id: number | null
  thetvdb_id: number | null
  imdb_id: string | null
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

// Update external IDs for a show (TVmaze, TheTVDB, IMDb)
export async function updateShowExternalIds(
  tmdbId: number,
  tvmazeId: number | null,
  thetvdbId: number | null,
  imdbId?: string | null
): Promise<void> {
  const db = getPool()
  await db.query(
    `UPDATE shows
     SET tvmaze_id = COALESCE($2, tvmaze_id),
         thetvdb_id = COALESCE($3, thetvdb_id),
         imdb_id = COALESCE($4, imdb_id),
         updated_at = CURRENT_TIMESTAMP
     WHERE tmdb_id = $1`,
    [tmdbId, tvmazeId, thetvdbId, imdbId ?? null]
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
  // Data source tracking for fallback sources
  episode_data_source?: string | null
  cast_data_source?: string | null
  tvmaze_episode_id?: number | null
  thetvdb_episode_id?: number | null
  imdb_episode_id?: string | null
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

// Get episode counts grouped by season for a show
export async function getEpisodeCountsBySeasonFromDb(
  showTmdbId: number
): Promise<Map<number, number>> {
  const db = getPool()
  const result = await db.query<{ season_number: number; count: string }>(
    "SELECT season_number, COUNT(*) as count FROM episodes WHERE show_tmdb_id = $1 GROUP BY season_number ORDER BY season_number",
    [showTmdbId]
  )
  const counts = new Map<number, number>()
  for (const row of result.rows) {
    counts.set(row.season_number, parseInt(row.count, 10))
  }
  return counts
}

// Insert or update an episode
export async function upsertEpisode(episode: EpisodeRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO episodes (
       show_tmdb_id, season_number, episode_number, name, air_date, runtime,
       cast_count, deceased_count, guest_star_count, expected_deaths, mortality_surprise_score,
       episode_data_source, cast_data_source, tvmaze_episode_id, thetvdb_episode_id, imdb_episode_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (show_tmdb_id, season_number, episode_number) DO UPDATE SET
       name = EXCLUDED.name,
       air_date = EXCLUDED.air_date,
       runtime = EXCLUDED.runtime,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       guest_star_count = EXCLUDED.guest_star_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       episode_data_source = COALESCE(EXCLUDED.episode_data_source, episodes.episode_data_source),
       cast_data_source = COALESCE(EXCLUDED.cast_data_source, episodes.cast_data_source),
       tvmaze_episode_id = COALESCE(EXCLUDED.tvmaze_episode_id, episodes.tvmaze_episode_id),
       thetvdb_episode_id = COALESCE(EXCLUDED.thetvdb_episode_id, episodes.thetvdb_episode_id),
       imdb_episode_id = COALESCE(EXCLUDED.imdb_episode_id, episodes.imdb_episode_id)`,
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
      episode.episode_data_source ?? "tmdb",
      episode.cast_data_source ?? "tmdb",
      episode.tvmaze_episode_id ?? null,
      episode.thetvdb_episode_id ?? null,
      episode.imdb_episode_id ?? null,
    ]
  )
}

// ============================================================================
// Show actor appearances table functions
// ============================================================================

// Show actor appearance record (junction table only - actor metadata comes from actors table)
export interface ShowActorAppearanceRecord {
  actor_id: number
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
       actor_id, show_tmdb_id, season_number, episode_number,
       character_name, appearance_type, billing_order, age_at_filming
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (actor_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
       character_name = EXCLUDED.character_name,
       appearance_type = EXCLUDED.appearance_type,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming`,
    [
      appearance.actor_id,
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
        appearance.actor_id,
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
         actor_id, show_tmdb_id, season_number, episode_number,
         character_name, appearance_type, billing_order, age_at_filming
       )
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (actor_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
         character_name = EXCLUDED.character_name,
         appearance_type = EXCLUDED.appearance_type,
         billing_order = EXCLUDED.billing_order,
         age_at_filming = EXCLUDED.age_at_filming`,
      values
    )
  }
}

// Get unique actors for a show (aggregated across all episodes)
export async function getShowActors(showTmdbId: number): Promise<
  Array<{
    actorId: number
    actorTmdbId: number | null
    actorName: string
    isDeceased: boolean
  }>
> {
  const db = getPool()
  const result = await db.query<{
    actor_id: number
    actor_tmdb_id: number | null
    actor_name: string
    is_deceased: boolean
  }>(
    `SELECT DISTINCT asa.actor_id, a.tmdb_id as actor_tmdb_id, a.name as actor_name, (a.deathday IS NOT NULL) as is_deceased
     FROM actor_show_appearances asa
     JOIN actors a ON asa.actor_id = a.id
     WHERE asa.show_tmdb_id = $1
     ORDER BY a.name`,
    [showTmdbId]
  )
  return result.rows.map((row) => ({
    actorId: row.actor_id,
    actorTmdbId: row.actor_tmdb_id,
    actorName: row.actor_name,
    isDeceased: row.is_deceased,
  }))
}

// Deceased actor with episode appearances for show page
export interface DeceasedShowActor {
  id: number
  tmdb_id: number | null
  name: string
  profile_path: string | null
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  cause_of_death_source: DeathInfoSource
  cause_of_death_details: string | null
  cause_of_death_details_source: DeathInfoSource
  wikipedia_url: string | null
  age_at_death: number | null
  years_lost: number | null
  total_episodes: number
  episodes: Array<{
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>
}

// Get all deceased actors for a show with their episode appearances
export async function getDeceasedActorsForShow(showTmdbId: number): Promise<DeceasedShowActor[]> {
  const db = getPool()

  // First get all deceased actors with their aggregated episode count
  const actorsResult = await db.query<{
    id: number
    tmdb_id: number | null
    name: string
    profile_path: string | null
    birthday: string | null
    deathday: string
    cause_of_death: string | null
    cause_of_death_source: DeathInfoSource
    cause_of_death_details: string | null
    cause_of_death_details_source: DeathInfoSource
    wikipedia_url: string | null
    age_at_death: number | null
    years_lost: number | null
    total_episodes: number
  }>(
    `SELECT
       a.id,
       a.tmdb_id,
       a.name,
       a.profile_path,
       a.birthday,
       a.deathday,
       a.cause_of_death,
       a.cause_of_death_source,
       a.cause_of_death_details,
       a.cause_of_death_details_source,
       a.wikipedia_url,
       a.age_at_death,
       a.years_lost,
       COUNT(DISTINCT (asa.season_number, asa.episode_number))::int as total_episodes
     FROM actors a
     JOIN actor_show_appearances asa ON asa.actor_id = a.id
     WHERE asa.show_tmdb_id = $1
       AND a.deathday IS NOT NULL
     GROUP BY a.id, a.tmdb_id, a.name, a.profile_path, a.birthday, a.deathday,
              a.cause_of_death, a.cause_of_death_source, a.cause_of_death_details,
              a.cause_of_death_details_source, a.wikipedia_url, a.age_at_death, a.years_lost
     ORDER BY a.deathday DESC`,
    [showTmdbId]
  )

  if (actorsResult.rows.length === 0) {
    return []
  }

  // Get episode appearances for all deceased actors (using internal id)
  const actorIds = actorsResult.rows.map((a) => a.id)
  const episodesResult = await db.query<{
    actor_id: number
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>(
    `SELECT
       asa.actor_id,
       asa.season_number,
       asa.episode_number,
       e.name as episode_name,
       asa.character_name
     FROM actor_show_appearances asa
     LEFT JOIN episodes e ON e.show_tmdb_id = asa.show_tmdb_id
       AND e.season_number = asa.season_number
       AND e.episode_number = asa.episode_number
     WHERE asa.show_tmdb_id = $1
       AND asa.actor_id = ANY($2)
     ORDER BY asa.season_number, asa.episode_number`,
    [showTmdbId, actorIds]
  )

  // Group episodes by actor (using internal id)
  const episodesByActor = new Map<
    number,
    Array<{
      season_number: number
      episode_number: number
      episode_name: string | null
      character_name: string | null
    }>
  >()
  for (const ep of episodesResult.rows) {
    const existing = episodesByActor.get(ep.actor_id) || []
    existing.push({
      season_number: ep.season_number,
      episode_number: ep.episode_number,
      episode_name: ep.episode_name,
      character_name: ep.character_name,
    })
    episodesByActor.set(ep.actor_id, existing)
  }

  return actorsResult.rows.map((actor) => ({
    ...actor,
    episodes: episodesByActor.get(actor.id) || [],
  }))
}

export interface LivingShowActor {
  id: number
  tmdb_id: number | null
  name: string
  profile_path: string | null
  birthday: string | null
  total_episodes: number
  episodes: Array<{
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>
}

// Get all living actors for a show with their episode appearances
export async function getLivingActorsForShow(showTmdbId: number): Promise<LivingShowActor[]> {
  const db = getPool()

  // First get all living actors with their aggregated episode count
  const actorsResult = await db.query<{
    id: number
    tmdb_id: number | null
    name: string
    profile_path: string | null
    birthday: string | null
    total_episodes: number
  }>(
    `SELECT
       a.id,
       a.tmdb_id,
       a.name,
       a.profile_path,
       a.birthday,
       COUNT(DISTINCT (asa.season_number, asa.episode_number))::int as total_episodes
     FROM actors a
     JOIN actor_show_appearances asa ON asa.actor_id = a.id
     WHERE asa.show_tmdb_id = $1
       AND a.deathday IS NULL
     GROUP BY a.id, a.tmdb_id, a.name, a.profile_path, a.birthday
     ORDER BY total_episodes DESC, a.name`,
    [showTmdbId]
  )

  if (actorsResult.rows.length === 0) {
    return []
  }

  // Get episode appearances for all living actors (using internal id)
  const actorIds = actorsResult.rows.map((a) => a.id)
  const episodesResult = await db.query<{
    actor_id: number
    season_number: number
    episode_number: number
    episode_name: string | null
    character_name: string | null
  }>(
    `SELECT
       asa.actor_id,
       asa.season_number,
       asa.episode_number,
       e.name as episode_name,
       asa.character_name
     FROM actor_show_appearances asa
     LEFT JOIN episodes e ON e.show_tmdb_id = asa.show_tmdb_id
       AND e.season_number = asa.season_number
       AND e.episode_number = asa.episode_number
     WHERE asa.show_tmdb_id = $1
       AND asa.actor_id = ANY($2)
     ORDER BY asa.season_number, asa.episode_number`,
    [showTmdbId, actorIds]
  )

  // Group episodes by actor (using internal id)
  const episodesByActor = new Map<
    number,
    Array<{
      season_number: number
      episode_number: number
      episode_name: string | null
      character_name: string | null
    }>
  >()
  for (const ep of episodesResult.rows) {
    const existing = episodesByActor.get(ep.actor_id) || []
    existing.push({
      season_number: ep.season_number,
      episode_number: ep.episode_number,
      episode_name: ep.episode_name,
      character_name: ep.character_name,
    })
    episodesByActor.set(ep.actor_id, existing)
  }

  return actorsResult.rows.map((actor) => ({
    ...actor,
    episodes: episodesByActor.get(actor.id) || [],
  }))
}

// ============================================================================
// Causes of Death Category Functions
// ============================================================================

import {
  CAUSE_CATEGORIES,
  buildCategoryCaseStatement,
  buildCategoryCondition as buildCauseCategoryCondition,
  getCategoryBySlug,
  createCauseSlug,
} from "./cause-categories.js"

// Re-export for convenience
export { CAUSE_CATEGORIES, type CauseCategoryKey } from "./cause-categories.js"

export interface CauseCategoryStats {
  slug: string
  label: string
  count: number
  avgAge: number | null
  avgYearsLost: number | null
  topCauses: Array<{ cause: string; count: number; slug: string }>
}

export interface CauseCategoryIndexResponse {
  categories: CauseCategoryStats[]
  totalWithKnownCause: number
  overallAvgAge: number | null
  overallAvgYearsLost: number | null
  mostCommonCategory: string | null
}

/**
 * Get all cause categories with counts and statistics for the index page.
 */
export async function getCauseCategoryIndex(): Promise<CauseCategoryIndexResponse> {
  const db = getPool()
  const categoryCase = buildCategoryCaseStatement()

  // Get category counts and stats
  const categoriesResult = await db.query<{
    category_slug: string
    count: string
    avg_age: string | null
    avg_years_lost: string | null
  }>(
    `SELECT
       ${categoryCase} as category_slug,
       COUNT(*) as count,
       ROUND(AVG(age_at_death)::numeric, 1) as avg_age,
       ROUND(AVG(years_lost)::numeric, 1) as avg_years_lost
     FROM actors
     WHERE deathday IS NOT NULL
       AND cause_of_death IS NOT NULL
       AND is_obscure = false
     GROUP BY category_slug
     ORDER BY count DESC`
  )

  // Get top 3 specific causes per category (using normalized causes for grouping)
  const topCausesResult = await db.query<{
    category_slug: string
    cause: string
    count: string
  }>(
    `WITH ranked_causes AS (
       SELECT
         ${categoryCase} as category_slug,
         COALESCE(n.normalized_cause, a.cause_of_death) as cause,
         COUNT(*) as count,
         ROW_NUMBER() OVER (PARTITION BY ${categoryCase} ORDER BY COUNT(*) DESC) as rn
       FROM actors a
       LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
       WHERE a.deathday IS NOT NULL
         AND a.cause_of_death IS NOT NULL
         AND a.is_obscure = false
       GROUP BY category_slug, COALESCE(n.normalized_cause, a.cause_of_death)
     )
     SELECT category_slug, cause, count
     FROM ranked_causes
     WHERE rn <= 3
     ORDER BY category_slug, count DESC`
  )

  // Get overall stats
  const overallResult = await db.query<{
    total_count: string
    avg_age: string | null
    avg_years_lost: string | null
  }>(
    `SELECT
       COUNT(*) as total_count,
       ROUND(AVG(age_at_death)::numeric, 1) as avg_age,
       ROUND(AVG(years_lost)::numeric, 1) as avg_years_lost
     FROM actors
     WHERE deathday IS NOT NULL
       AND cause_of_death IS NOT NULL
       AND is_obscure = false`
  )

  // Group top causes by category
  const topCausesByCategory = new Map<
    string,
    Array<{ cause: string; count: number; slug: string }>
  >()
  for (const row of topCausesResult.rows) {
    const existing = topCausesByCategory.get(row.category_slug) || []
    existing.push({
      cause: row.cause,
      count: parseInt(row.count, 10),
      slug: createCauseSlug(row.cause),
    })
    topCausesByCategory.set(row.category_slug, existing)
  }

  // Build categories array with labels
  const categories: CauseCategoryStats[] = categoriesResult.rows.map((row) => {
    const categoryInfo = getCategoryBySlug(row.category_slug)
    return {
      slug: row.category_slug,
      label: categoryInfo?.label || "Other",
      count: parseInt(row.count, 10),
      avgAge: row.avg_age ? parseFloat(row.avg_age) : null,
      avgYearsLost: row.avg_years_lost ? parseFloat(row.avg_years_lost) : null,
      topCauses: topCausesByCategory.get(row.category_slug) || [],
    }
  })

  const overall = overallResult.rows[0]
  const mostCommon = categories.length > 0 ? categories[0].slug : null

  return {
    categories,
    totalWithKnownCause: parseInt(overall?.total_count || "0", 10),
    overallAvgAge: overall?.avg_age ? parseFloat(overall.avg_age) : null,
    overallAvgYearsLost: overall?.avg_years_lost ? parseFloat(overall.avg_years_lost) : null,
    mostCommonCategory: mostCommon,
  }
}

export interface CauseCategoryDetailResponse {
  slug: string
  label: string
  count: number
  percentage: number
  avgAge: number | null
  avgYearsLost: number | null
  notableActors: Array<{
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeath: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
  }>
  decadeBreakdown: Array<{ decade: string; count: number }>
  specificCauses: Array<{ cause: string; slug: string; count: number }>
  actors: Array<{
    rank: number
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeath: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
    yearsLost: number | null
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

export interface CauseCategoryOptions {
  page?: number
  pageSize?: number
  specificCause?: string | null
  includeObscure?: boolean
}

/**
 * Get details for a specific category with actor list.
 */
export async function getCauseCategory(
  categorySlug: string,
  options: CauseCategoryOptions = {}
): Promise<CauseCategoryDetailResponse | null> {
  const db = getPool()
  const { page = 1, pageSize = 50, specificCause = null, includeObscure = false } = options

  const categoryInfo = getCategoryBySlug(categorySlug)
  if (!categoryInfo) return null

  // Build the category filter condition
  const isOtherCategory = categorySlug === "other"
  let categoryCondition: string

  if (isOtherCategory) {
    // 'other' category = doesn't match any known patterns
    const allKnownPatterns = Object.entries(CAUSE_CATEGORIES)
      .filter(([key]) => key !== "other")
      .flatMap(([, cat]) => cat.patterns)
    categoryCondition = `NOT (${buildCauseCategoryCondition(allKnownPatterns)})`
  } else {
    categoryCondition = buildCauseCategoryCondition(categoryInfo.patterns)
  }

  // Add specific cause filter if provided
  const causeFilter = specificCause ? `AND LOWER(cause_of_death) = LOWER($3)` : ""
  const obscureFilter = includeObscure ? "" : "AND is_obscure = false"

  // Get category stats
  const statsResult = await db.query<{
    count: string
    avg_age: string | null
    avg_years_lost: string | null
  }>(
    `SELECT
       COUNT(*) as count,
       ROUND(AVG(age_at_death)::numeric, 1) as avg_age,
       ROUND(AVG(years_lost)::numeric, 1) as avg_years_lost
     FROM actors
     WHERE deathday IS NOT NULL
       AND cause_of_death IS NOT NULL
       AND (${categoryCondition})
       ${obscureFilter}`,
    []
  )

  // Get total actors with known cause (for percentage)
  const totalResult = await db.query<{ total: string }>(
    `SELECT COUNT(*) as total
     FROM actors
     WHERE deathday IS NOT NULL
       AND cause_of_death IS NOT NULL
       ${obscureFilter}`
  )

  // Get notable actors (top 5 by popularity)
  const notableResult = await db.query<ActorRecord>(
    `SELECT
       id, tmdb_id, name, profile_path, deathday,
       cause_of_death, cause_of_death_details, age_at_death
     FROM actors
     WHERE deathday IS NOT NULL
       AND cause_of_death IS NOT NULL
       AND (${categoryCondition})
       ${obscureFilter}
     ORDER BY popularity DESC NULLS LAST
     LIMIT 5`
  )

  // Get decade breakdown
  const decadeResult = await db.query<{ decade: string; count: string }>(
    `SELECT
       (EXTRACT(YEAR FROM deathday::date)::int / 10 * 10)::text || 's' as decade,
       COUNT(*) as count
     FROM actors
     WHERE deathday IS NOT NULL
       AND cause_of_death IS NOT NULL
       AND (${categoryCondition})
       ${obscureFilter}
     GROUP BY decade
     ORDER BY decade`
  )

  // Get specific causes within category (using normalized causes for grouping)
  const causesResult = await db.query<{ cause: string; count: string; avg_age: string | null }>(
    `SELECT COALESCE(n.normalized_cause, a.cause_of_death) as cause,
            COUNT(*) as count,
            AVG(a.age_at_death)::numeric(10,1) as avg_age
     FROM actors a
     LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
     WHERE a.deathday IS NOT NULL
       AND a.cause_of_death IS NOT NULL
       AND (${categoryCondition})
       ${obscureFilter}
     GROUP BY COALESCE(n.normalized_cause, a.cause_of_death)
     HAVING COUNT(*) >= 2
     ORDER BY count DESC
     LIMIT 20`
  )

  // Get paginated actors
  const offset = (page - 1) * pageSize
  const actorsParams: (string | number | boolean)[] = [pageSize, offset]
  if (specificCause) actorsParams.push(specificCause)

  const actorsResult = await db.query<ActorRecord & { total_count: string }>(
    `SELECT
       id, tmdb_id, name, profile_path, deathday,
       cause_of_death, cause_of_death_details, age_at_death, years_lost,
       COUNT(*) OVER() as total_count
     FROM actors
     WHERE deathday IS NOT NULL
       AND cause_of_death IS NOT NULL
       AND (${categoryCondition})
       ${obscureFilter}
       ${causeFilter}
     ORDER BY popularity DESC NULLS LAST, name
     LIMIT $1 OFFSET $2`,
    actorsParams
  )

  const stats = statsResult.rows[0]
  const total = parseInt(totalResult.rows[0]?.total || "0", 10)
  const count = parseInt(stats?.count || "0", 10)
  const totalActorsInQuery = parseInt(actorsResult.rows[0]?.total_count || "0", 10)

  return {
    slug: categorySlug,
    label: categoryInfo.label,
    count,
    percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    avgAge: stats?.avg_age ? parseFloat(stats.avg_age) : null,
    avgYearsLost: stats?.avg_years_lost ? parseFloat(stats.avg_years_lost) : null,
    notableActors: notableResult.rows.map((a) => ({
      id: a.id,
      tmdbId: a.tmdb_id,
      name: a.name,
      profilePath: a.profile_path,
      deathday: a.deathday!,
      causeOfDeath: a.cause_of_death!,
      causeOfDeathDetails: a.cause_of_death_details,
      ageAtDeath: a.age_at_death,
    })),
    decadeBreakdown: decadeResult.rows.map((d) => ({
      decade: d.decade,
      count: parseInt(d.count, 10),
    })),
    specificCauses: causesResult.rows.map((c) => ({
      cause: c.cause,
      slug: createCauseSlug(c.cause),
      count: parseInt(c.count, 10),
      avgAge: c.avg_age ? parseFloat(c.avg_age) : null,
    })),
    actors: actorsResult.rows.map((a, idx) => ({
      rank: offset + idx + 1,
      id: a.id,
      tmdbId: a.tmdb_id,
      name: a.name,
      profilePath: a.profile_path,
      deathday: a.deathday!,
      causeOfDeath: a.cause_of_death!,
      causeOfDeathDetails: a.cause_of_death_details,
      ageAtDeath: a.age_at_death,
      yearsLost: a.years_lost ? parseFloat(a.years_lost.toString()) : null,
    })),
    pagination: {
      page,
      pageSize,
      totalCount: totalActorsInQuery,
      totalPages: Math.ceil(totalActorsInQuery / pageSize),
    },
  }
}

export interface SpecificCauseResponse {
  cause: string
  slug: string
  categorySlug: string
  categoryLabel: string
  count: number
  avgAge: number | null
  avgYearsLost: number | null
  notableActors: Array<{
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
  }>
  decadeBreakdown: Array<{ decade: string; count: number }>
  actors: Array<{
    rank: number
    id: number
    tmdbId: number | null
    name: string
    profilePath: string | null
    deathday: string
    causeOfDeathDetails: string | null
    ageAtDeath: number | null
    yearsLost: number | null
  }>
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

export interface SpecificCauseOptions {
  page?: number
  pageSize?: number
  includeObscure?: boolean
}

/**
 * Find the original cause_of_death string from a slug within a category.
 */
export async function getCauseFromSlugInCategory(
  categorySlug: string,
  causeSlug: string
): Promise<string | null> {
  const db = getPool()
  const categoryInfo = getCategoryBySlug(categorySlug)
  if (!categoryInfo) return null

  // Build category condition
  const isOtherCategory = categorySlug === "other"
  let categoryCondition: string

  if (isOtherCategory) {
    const allKnownPatterns = Object.entries(CAUSE_CATEGORIES)
      .filter(([key]) => key !== "other")
      .flatMap(([, cat]) => cat.patterns)
    categoryCondition = `NOT (${buildCauseCategoryCondition(allKnownPatterns)})`
  } else {
    categoryCondition = buildCauseCategoryCondition(categoryInfo.patterns)
  }

  // Get all distinct normalized causes in this category and find the one matching the slug
  const result = await db.query<{ cause: string }>(
    `SELECT DISTINCT COALESCE(n.normalized_cause, a.cause_of_death) as cause
     FROM actors a
     LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
     WHERE a.deathday IS NOT NULL
       AND a.cause_of_death IS NOT NULL
       AND (${categoryCondition})`
  )

  for (const row of result.rows) {
    if (createCauseSlug(row.cause) === causeSlug) {
      return row.cause
    }
  }

  return null
}

/**
 * Get details for a specific cause of death with actor list.
 */
export async function getSpecificCause(
  categorySlug: string,
  causeSlug: string,
  options: SpecificCauseOptions = {}
): Promise<SpecificCauseResponse | null> {
  const db = getPool()
  const { page = 1, pageSize = 50, includeObscure = false } = options

  const categoryInfo = getCategoryBySlug(categorySlug)
  if (!categoryInfo) return null

  // Find the actual cause string from the slug
  // actualCause is now the normalized cause name
  const actualCause = await getCauseFromSlugInCategory(categorySlug, causeSlug)
  if (!actualCause) return null

  const obscureFilter = includeObscure ? "" : "AND a.is_obscure = false"

  // Get stats for this specific cause (matching by normalized cause)
  const statsResult = await db.query<{
    count: string
    avg_age: string | null
    avg_years_lost: string | null
  }>(
    `SELECT
       COUNT(*) as count,
       ROUND(AVG(a.age_at_death)::numeric, 1) as avg_age,
       ROUND(AVG(a.years_lost)::numeric, 1) as avg_years_lost
     FROM actors a
     LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
     WHERE a.deathday IS NOT NULL
       AND LOWER(COALESCE(n.normalized_cause, a.cause_of_death)) = LOWER($1)
       ${obscureFilter}`,
    [actualCause]
  )

  // Get notable actors (top 3 by popularity)
  const notableResult = await db.query<ActorRecord>(
    `SELECT
       a.id, a.tmdb_id, a.name, a.profile_path, a.deathday,
       a.cause_of_death_details, a.age_at_death
     FROM actors a
     LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
     WHERE a.deathday IS NOT NULL
       AND LOWER(COALESCE(n.normalized_cause, a.cause_of_death)) = LOWER($1)
       ${obscureFilter}
     ORDER BY a.popularity DESC NULLS LAST
     LIMIT 3`,
    [actualCause]
  )

  // Get decade breakdown
  const decadeResult = await db.query<{ decade: string; count: string }>(
    `SELECT
       (EXTRACT(YEAR FROM a.deathday::date)::int / 10 * 10)::text || 's' as decade,
       COUNT(*) as count
     FROM actors a
     LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
     WHERE a.deathday IS NOT NULL
       AND LOWER(COALESCE(n.normalized_cause, a.cause_of_death)) = LOWER($1)
       ${obscureFilter}
     GROUP BY decade
     ORDER BY decade`,
    [actualCause]
  )

  // Get paginated actors
  const offset = (page - 1) * pageSize
  const actorsResult = await db.query<ActorRecord & { total_count: string }>(
    `SELECT
       a.id, a.tmdb_id, a.name, a.profile_path, a.deathday,
       a.cause_of_death_details, a.age_at_death, a.years_lost,
       COUNT(*) OVER() as total_count
     FROM actors a
     LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
     WHERE a.deathday IS NOT NULL
       AND LOWER(COALESCE(n.normalized_cause, a.cause_of_death)) = LOWER($1)
       ${obscureFilter}
     ORDER BY a.popularity DESC NULLS LAST, a.name
     LIMIT $2 OFFSET $3`,
    [actualCause, pageSize, offset]
  )

  const stats = statsResult.rows[0]
  const count = parseInt(stats?.count || "0", 10)
  const totalActorsInQuery = parseInt(actorsResult.rows[0]?.total_count || "0", 10)

  return {
    cause: actualCause,
    slug: causeSlug,
    categorySlug,
    categoryLabel: categoryInfo.label,
    count,
    avgAge: stats?.avg_age ? parseFloat(stats.avg_age) : null,
    avgYearsLost: stats?.avg_years_lost ? parseFloat(stats.avg_years_lost) : null,
    notableActors: notableResult.rows.map((a) => ({
      id: a.id,
      tmdbId: a.tmdb_id,
      name: a.name,
      profilePath: a.profile_path,
      deathday: a.deathday!,
      causeOfDeathDetails: a.cause_of_death_details,
      ageAtDeath: a.age_at_death,
    })),
    decadeBreakdown: decadeResult.rows.map((d) => ({
      decade: d.decade,
      count: parseInt(d.count, 10),
    })),
    actors: actorsResult.rows.map((a, idx) => ({
      rank: offset + idx + 1,
      id: a.id,
      tmdbId: a.tmdb_id,
      name: a.name,
      profilePath: a.profile_path,
      deathday: a.deathday!,
      causeOfDeathDetails: a.cause_of_death_details,
      ageAtDeath: a.age_at_death,
      yearsLost: a.years_lost ? parseFloat(a.years_lost.toString()) : null,
    })),
    pagination: {
      page,
      pageSize,
      totalCount: totalActorsInQuery,
      totalPages: Math.ceil(totalActorsInQuery / pageSize),
    },
  }
}

// ============================================================================
// Death Circumstances functions
// ============================================================================

// Type definitions for death circumstances
export interface ProjectInfo {
  title: string
  year: number | null
  tmdb_id: number | null
  imdb_id: string | null
  type: "movie" | "show" | "documentary" | "unknown"
}

export interface RelatedCelebrity {
  name: string
  tmdb_id: number | null
  relationship: string
}

export interface SourceEntry {
  url: string | null
  archive_url: string | null
  description: string
}

export interface DeathSources {
  cause?: SourceEntry[]
  birthday?: SourceEntry[]
  deathday?: SourceEntry[]
  circumstances?: SourceEntry[]
  rumored?: SourceEntry[]
}

export interface ActorDeathCircumstancesRecord {
  id: number
  actor_id: number
  circumstances: string | null
  circumstances_confidence: string | null
  rumored_circumstances: string | null
  cause_confidence: string | null
  details_confidence: string | null
  birthday_confidence: string | null
  deathday_confidence: string | null
  location_of_death: string | null
  last_project: ProjectInfo | null
  career_status_at_death: string | null
  posthumous_releases: ProjectInfo[] | null
  related_celebrity_ids: number[] | null
  related_celebrities: RelatedCelebrity[] | null
  notable_factors: string[] | null
  sources: DeathSources | null
  additional_context: string | null
  raw_response: unknown | null
  created_at: string
  updated_at: string
}

/**
 * Get death circumstances for an actor by their internal ID.
 */
export async function getActorDeathCircumstances(
  actorId: number
): Promise<ActorDeathCircumstancesRecord | null> {
  const db = getPool()
  const result = await db.query<ActorDeathCircumstancesRecord>(
    `SELECT * FROM actor_death_circumstances WHERE actor_id = $1`,
    [actorId]
  )
  return result.rows[0] || null
}

/**
 * Get death circumstances for an actor by TMDB ID.
 */
export async function getActorDeathCircumstancesByTmdbId(
  tmdbId: number
): Promise<ActorDeathCircumstancesRecord | null> {
  const db = getPool()
  const result = await db.query<ActorDeathCircumstancesRecord>(
    `SELECT adc.*
     FROM actor_death_circumstances adc
     JOIN actors a ON adc.actor_id = a.id
     WHERE a.tmdb_id = $1`,
    [tmdbId]
  )
  return result.rows[0] || null
}

// Response type for notable deaths list
export interface NotableDeathActor {
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  deathday: string
  ageAtDeath: number | null
  causeOfDeath: string | null
  deathManner: string | null
  strangeDeath: boolean
  notableFactors: string[] | null
  circumstancesConfidence: string | null
  slug: string
}

export interface NotableDeathsOptions {
  page?: number
  pageSize?: number
  filter?: "all" | "strange" | "disputed" | "controversial"
  includeObscure?: boolean
}

export interface NotableDeathsResponse {
  actors: NotableDeathActor[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}

/**
 * Get paginated list of actors with detailed death information.
 */
export async function getNotableDeaths(
  options: NotableDeathsOptions = {}
): Promise<NotableDeathsResponse> {
  const db = getPool()
  const { page = 1, pageSize = 50, filter = "all", includeObscure = false } = options
  const offset = (page - 1) * pageSize

  // Build filter conditions
  const conditions: string[] = ["a.deathday IS NOT NULL", "a.has_detailed_death_info = true"]

  if (!includeObscure) {
    conditions.push("a.is_obscure = false")
  }

  if (filter === "strange") {
    conditions.push("a.strange_death = true")
  } else if (filter === "disputed") {
    conditions.push("adc.circumstances_confidence = 'disputed'")
  } else if (filter === "controversial") {
    conditions.push("'controversial' = ANY(adc.notable_factors)")
  }

  const whereClause = conditions.join(" AND ")

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM actors a
     LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
     WHERE ${whereClause}`
  )
  const totalCount = parseInt(countResult.rows[0]?.count || "0", 10)

  // Get paginated actors
  const result = await db.query<{
    id: number
    tmdb_id: number | null
    name: string
    profile_path: string | null
    deathday: string
    age_at_death: number | null
    cause_of_death: string | null
    death_manner: string | null
    strange_death: boolean | null
    notable_factors: string[] | null
    circumstances_confidence: string | null
  }>(
    `SELECT
       a.id, a.tmdb_id, a.name, a.profile_path, a.deathday,
       a.age_at_death, a.cause_of_death, a.death_manner, a.strange_death,
       adc.notable_factors, adc.circumstances_confidence
     FROM actors a
     LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
     WHERE ${whereClause}
     ORDER BY a.popularity DESC NULLS LAST, a.deathday DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  )

  return {
    actors: result.rows.map((row) => ({
      id: row.id,
      tmdbId: row.tmdb_id,
      name: row.name,
      profilePath: row.profile_path,
      deathday: row.deathday,
      ageAtDeath: row.age_at_death,
      causeOfDeath: row.cause_of_death,
      deathManner: row.death_manner,
      strangeDeath: row.strange_death ?? false,
      notableFactors: row.notable_factors,
      circumstancesConfidence: row.circumstances_confidence,
      slug: row.tmdb_id ? createActorSlug(row.name, row.tmdb_id) : "",
    })),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  }
}

/**
 * Check if an actor has detailed death info by TMDB ID.
 */
export async function hasDetailedDeathInfo(tmdbId: number): Promise<boolean> {
  const db = getPool()
  const result = await db.query<{ has_detailed_death_info: boolean | null }>(
    `SELECT has_detailed_death_info FROM actors WHERE tmdb_id = $1`,
    [tmdbId]
  )
  return result.rows[0]?.has_detailed_death_info === true
}
