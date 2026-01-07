/**
 * Trivia, popular movies, and featured content database functions.
 */

import { getPool } from "./pool.js"
import { createActorSlug, createMovieSlug } from "../slug-utils.js"
import type {
  FeaturedMovieRecord,
  PopularMovieRecord,
  ThisWeekDeathRecord,
  TriviaFact,
} from "./types.js"

// ============================================================================
// Featured Movies
// ============================================================================

/**
 * Get the movie with the highest mortality surprise score.
 */
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

// ============================================================================
// Trivia Facts
// ============================================================================

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

/**
 * Get interesting trivia facts from the database (cached for 5 minutes).
 */
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

// ============================================================================
// This Week Deaths
// ============================================================================

/**
 * Get deaths that occurred during this calendar week (any year).
 */
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

/**
 * Simpler approach: Get deaths that occurred on the same day of week range.
 */
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
// Popular Movies
// ============================================================================

/**
 * Get popular movies based on TMDB popularity scores.
 */
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
