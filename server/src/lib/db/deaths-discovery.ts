/**
 * Deaths discovery database functions.
 *
 * Functions for death-related discovery features: by decade, recent deaths,
 * forever young, COVID deaths, unnatural deaths, all deaths, death watch.
 */

import { getPool } from "./pool.js"
import type {
  ActorRecord,
  DeathByDecadeRecord,
  DeathsByDecadeOptions,
  ForeverYoungMovie,
  ForeverYoungMovieRecord,
  ForeverYoungOptions,
  CovidDeathOptions,
  UnnaturalDeathsOptions,
  UnnaturalDeathCategory,
  AllDeathsOptions,
  DeathWatchOptions,
  DeathWatchActorRecord,
} from "./types.js"

// ============================================================================
// Deaths by Decade functions
// ============================================================================

// Get deaths for a specific decade
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

// ============================================================================
// Recent Deaths functions
// ============================================================================

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
// COVID-19 deaths functions
// ============================================================================

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

// Get suicide pattern conditions (for exclusion)
function getSuicidePatterns(): string {
  return buildCategoryCondition(UNNATURAL_DEATH_CATEGORIES.suicide.patterns)
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

  // When hiding suicides, also exclude records that match suicide patterns
  // (e.g., "suicide by gunshot wound" matches homicide pattern but should be excluded)
  const suicideExclusion = shouldHideSuicides ? `AND NOT (${getSuicidePatterns()})` : ""

  // Get persons matching the filter
  const result = await db.query<ActorRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM actors
     WHERE (${whereCondition}) ${suicideExclusion} AND ($3 = true OR is_obscure = false)
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

// ============================================================================
// All Deaths functions (paginated list of all deceased actors)
// ============================================================================

// Get all deceased persons, paginated (for "All Deaths" page)
// Requires actors to have appeared in 2+ movies OR 10+ TV episodes
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

// ============================================================================
// Death Watch feature - living actors most likely to die soon
// ============================================================================

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
