/**
 * Database queries for admin death detail coverage management.
 *
 * Provides queries for:
 * - Coverage statistics (actors with/without death pages)
 * - Actor filtering and pagination for coverage management
 * - Historical coverage trends from snapshots
 * - Enrichment candidate prioritization
 */

import { Pool } from "pg"
import { splitSearchWords } from "../shared/search-utils.js"

// ============================================================================
// Types
// ============================================================================

export interface CoverageStats {
  total_deceased_actors: number
  actors_with_death_pages: number
  actors_without_death_pages: number
  coverage_percentage: number
  enrichment_candidates_count: number
  high_priority_count: number
}

export interface ActorTopCredit {
  title: string
  year: number | null
  type: "movie" | "show"
}

export interface ActorCoverageInfo {
  id: number
  name: string
  tmdb_id: number | null
  deathday: string | null
  popularity: number
  has_detailed_death_info: boolean
  enriched_at: string | null
  age_at_death: number | null
  cause_of_death: string | null
  profile_path: string | null
  death_manner: string | null
  has_biography: boolean
  has_enriched_bio: boolean
  bio_enriched_at: string | null
  enrichment_version: string | null
  biography_version: string | null
  top_credits: ActorTopCredit[]
}

export interface CoverageTrendPoint {
  captured_at: string
  total_deceased_actors: number
  actors_with_death_pages: number
  actors_without_death_pages: number
  coverage_percentage: number
  enrichment_candidates_count: number
  high_priority_count: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ActorCoverageFilters {
  hasDeathPage?: boolean
  hasEnrichedBio?: boolean
  minPopularity?: number
  maxPopularity?: number
  deathDateStart?: string
  deathDateEnd?: string
  searchName?: string
  causeOfDeath?: string
  deathManner?: string
  deathEnrichmentVersion?: string
  bioEnrichmentVersion?: string
  orderBy?: "death_date" | "popularity" | "name" | "enriched_at" | "interestingness"
  orderDirection?: "asc" | "desc"
}

export interface CauseOfDeathOption {
  value: string // normalized cause value
  label: string // display label (same as value)
  count: number // number of actors
}

export interface ActorPreviewMovie {
  title: string
  releaseYear: number | null
  character: string | null
  popularity: number
}

export interface ActorPreviewShow {
  name: string
  firstAirYear: number | null
  character: string | null
  episodeCount: number
}

export interface ActorPreviewData {
  topMovies: ActorPreviewMovie[]
  topShows: ActorPreviewShow[]
  totalMovies: number
  totalShows: number
}

// ============================================================================
// Coverage Statistics
// ============================================================================

/**
 * Get real-time coverage statistics.
 */
export async function getCoverageStats(pool: Pool): Promise<CoverageStats> {
  const result = await pool.query<CoverageStats>(`
    WITH deceased_actors AS (
      SELECT
        COUNT(*) as total_deceased_actors,
        COUNT(*) FILTER (WHERE has_detailed_death_info = true) as actors_with_death_pages,
        COUNT(*) FILTER (WHERE has_detailed_death_info = false OR has_detailed_death_info IS NULL) as actors_without_death_pages
      FROM actors
      WHERE deathday IS NOT NULL
    ),
    enrichment_stats AS (
      SELECT
        COUNT(*) as enrichment_candidates_count,
        COUNT(*) FILTER (WHERE tmdb_popularity >= 10) as high_priority_count
      FROM actors
      WHERE deathday IS NOT NULL
        AND (has_detailed_death_info = false OR has_detailed_death_info IS NULL)
        AND (enriched_at IS NULL OR enriched_at < NOW() - INTERVAL '30 days')
    )
    SELECT
      da.total_deceased_actors,
      da.actors_with_death_pages,
      da.actors_without_death_pages,
      ROUND(
        CASE
          WHEN da.total_deceased_actors > 0
          THEN (da.actors_with_death_pages::numeric / da.total_deceased_actors::numeric) * 100
          ELSE 0
        END,
        2
      ) as coverage_percentage,
      es.enrichment_candidates_count,
      es.high_priority_count
    FROM deceased_actors da
    CROSS JOIN enrichment_stats es
  `)

  return result.rows[0]
}

/**
 * Get filtered, paginated list of actors for coverage management.
 */
export async function getActorsForCoverage(
  pool: Pool,
  filters: ActorCoverageFilters,
  page: number,
  pageSize: number
): Promise<PaginatedResult<ActorCoverageInfo>> {
  const offset = (page - 1) * pageSize

  // Build WHERE clauses
  const whereClauses: string[] = ["deathday IS NOT NULL"]
  const params: unknown[] = []
  let paramIndex = 1

  if (filters.hasDeathPage !== undefined) {
    if (filters.hasDeathPage) {
      // Has death page: look for explicit true
      whereClauses.push(`has_detailed_death_info = true`)
    } else {
      // Without death page: NULL or false (most are NULL)
      whereClauses.push(`(has_detailed_death_info IS NULL OR has_detailed_death_info = false)`)
    }
  }

  if (filters.minPopularity !== undefined) {
    whereClauses.push(`dof_popularity >= $${paramIndex++}`)
    params.push(filters.minPopularity)
  }

  if (filters.maxPopularity !== undefined) {
    whereClauses.push(`dof_popularity <= $${paramIndex++}`)
    params.push(filters.maxPopularity)
  }

  if (filters.deathDateStart) {
    whereClauses.push(`deathday >= $${paramIndex++}`)
    params.push(filters.deathDateStart)
  }

  if (filters.deathDateEnd) {
    whereClauses.push(`deathday <= $${paramIndex++}`)
    params.push(filters.deathDateEnd)
  }

  if (filters.searchName) {
    const words = splitSearchWords(filters.searchName)
    for (const word of words) {
      whereClauses.push(`name ILIKE $${paramIndex++}`)
      params.push(`%${word}%`)
    }
  }

  if (filters.causeOfDeath) {
    // Match actors whose cause_of_death, when normalized if possible,
    // equals the filter value. Falls back to the original cause_of_death
    // when no normalization mapping exists.
    whereClauses.push(
      `COALESCE(
        (
          SELECT n.normalized_cause
          FROM cause_of_death_normalizations n
          WHERE n.original_cause = actors.cause_of_death
          LIMIT 1
        ),
        actors.cause_of_death
      ) = $${paramIndex++}`
    )
    params.push(filters.causeOfDeath)
  }

  if (filters.deathManner) {
    whereClauses.push(`death_manner = $${paramIndex++}`)
    params.push(filters.deathManner)
  }

  if (filters.hasEnrichedBio !== undefined) {
    if (filters.hasEnrichedBio) {
      whereClauses.push(`abd.id IS NOT NULL`)
    } else {
      whereClauses.push(`abd.id IS NULL`)
    }
  }

  if (filters.deathEnrichmentVersion) {
    if (filters.deathEnrichmentVersion === "__null__") {
      whereClauses.push(`enrichment_version IS NULL`)
    } else {
      whereClauses.push(`enrichment_version = $${paramIndex++}`)
      params.push(filters.deathEnrichmentVersion)
    }
  }

  if (filters.bioEnrichmentVersion) {
    if (filters.bioEnrichmentVersion === "__null__") {
      whereClauses.push(`biography_version IS NULL`)
    } else {
      whereClauses.push(`biography_version = $${paramIndex++}`)
      params.push(filters.bioEnrichmentVersion)
    }
  }

  const whereClause = whereClauses.join(" AND ")

  // Build ORDER BY clause without string interpolation
  const orderBy = filters.orderBy || "popularity"
  const orderDirection = filters.orderDirection || "desc"

  // Map order direction to numeric values for CASE expression
  const isAsc = orderDirection === "asc" ? 1 : 0
  const isDesc = orderDirection === "desc" ? 1 : 0

  // Add order direction as parameters
  params.push(isAsc, isDesc)
  const ascParam = `$${paramIndex++}`
  const descParam = `$${paramIndex++}`

  // Build ORDER BY using CASE expressions instead of string interpolation
  let orderByClause: string
  switch (orderBy) {
    case "death_date":
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN deathday END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN deathday END DESC NULLS LAST`
      break
    case "name":
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN name END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN name END DESC NULLS LAST`
      break
    case "enriched_at":
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN enriched_at END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN enriched_at END DESC NULLS LAST`
      break
    case "interestingness":
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN interestingness_score END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN interestingness_score END DESC NULLS LAST`
      break
    case "popularity":
    default:
      orderByClause = `CASE WHEN ${ascParam} = 1 THEN dof_popularity END ASC NULLS LAST, CASE WHEN ${descParam} = 1 THEN dof_popularity END DESC NULLS LAST`
      break
  }

  // Use window function to get total count in same query (performance optimization)
  // Eliminates separate COUNT query - significant speedup for large tables
  // Cast popularity to float to ensure JavaScript number type (pg returns numeric as string)
  const dataResult = await pool.query<
    ActorCoverageInfo & { total_count: string; top_credits_json: ActorTopCredit[] | null }
  >(
    `SELECT
       actors.id,
       actors.name,
       actors.tmdb_id,
       actors.deathday,
       actors.dof_popularity::float as popularity,
       actors.has_detailed_death_info,
       actors.enriched_at,
       actors.age_at_death,
       actors.cause_of_death,
       actors.profile_path,
       actors.death_manner,
       (actors.biography IS NOT NULL) as has_biography,
       (abd.id IS NOT NULL) as has_enriched_bio,
       abd.updated_at as bio_enriched_at,
       actors.enrichment_version,
       actors.biography_version,
       tc.top_credits_json,
       COUNT(*) OVER() as total_count
     FROM actors
     LEFT JOIN actor_biography_details abd ON abd.actor_id = actors.id
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object('title', sub.title, 'year', sub.year, 'type', sub.type)
                ORDER BY sub.pop DESC
              ) AS top_credits_json
       FROM (
         SELECT m.title, m.release_year AS year, 'movie' AS type, COALESCE(m.dof_popularity, 0) AS pop
         FROM actor_movie_appearances ama
         JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
         WHERE ama.actor_id = actors.id
         UNION ALL
         SELECT s.name AS title, EXTRACT(YEAR FROM s.first_air_date)::integer AS year, 'show' AS type, COALESCE(s.dof_popularity, 0) AS pop
         FROM actor_show_appearances asa
         JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
         WHERE asa.actor_id = actors.id
         GROUP BY s.tmdb_id, s.name, s.first_air_date, s.dof_popularity
         ORDER BY pop DESC
         LIMIT 3
       ) sub
     ) tc ON true
     WHERE ${whereClause}
     ORDER BY ${orderByClause}, actors.id ASC
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...params, pageSize, offset]
  )

  const total = dataResult.rows.length > 0 ? parseInt(dataResult.rows[0].total_count, 10) : 0

  // Remove total_count and raw JSON, parse top_credits
  const items = dataResult.rows.map(({ total_count: _total_count, top_credits_json, ...item }) => ({
    ...item,
    top_credits: top_credits_json ?? [],
  }))

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Get historical coverage trends from snapshots.
 */
export async function getCoverageTrends(
  pool: Pool,
  startDate: string,
  endDate: string,
  granularity: "daily" | "weekly" | "monthly" = "daily"
): Promise<CoverageTrendPoint[]> {
  // For daily granularity, return all snapshots in range
  if (granularity === "daily") {
    const result = await pool.query<CoverageTrendPoint>(
      `SELECT
         captured_at,
         total_deceased_actors,
         actors_with_death_pages,
         actors_without_death_pages,
         coverage_percentage,
         enrichment_candidates_count,
         high_priority_count
       FROM death_coverage_snapshots
       WHERE captured_at >= $1 AND captured_at <= $2
       ORDER BY captured_at ASC`,
      [startDate, endDate]
    )
    return result.rows
  }

  // For weekly/monthly, aggregate snapshots
  const dateFormat = granularity === "weekly" ? "YYYY-IW" : "YYYY-MM"

  const result = await pool.query<CoverageTrendPoint>(
    `SELECT
       MAX(captured_at) as captured_at,
       AVG(total_deceased_actors)::integer as total_deceased_actors,
       AVG(actors_with_death_pages)::integer as actors_with_death_pages,
       AVG(actors_without_death_pages)::integer as actors_without_death_pages,
       AVG(coverage_percentage)::numeric(5,2) as coverage_percentage,
       AVG(enrichment_candidates_count)::integer as enrichment_candidates_count,
       AVG(high_priority_count)::integer as high_priority_count
     FROM death_coverage_snapshots
     WHERE captured_at >= $1 AND captured_at <= $2
     GROUP BY TO_CHAR(captured_at, $3)
     ORDER BY MAX(captured_at) ASC`,
    [startDate, endDate, dateFormat]
  )

  return result.rows
}

/**
 * Get prioritized list of actors for enrichment.
 */
export async function getEnrichmentCandidates(
  pool: Pool,
  minPopularity: number = 5,
  limit: number = 100
): Promise<ActorCoverageInfo[]> {
  // Cast popularity to float to ensure JavaScript number type (pg returns numeric as string)
  const result = await pool.query<ActorCoverageInfo>(
    `SELECT
       id,
       name,
       tmdb_id,
       deathday,
       dof_popularity::float as popularity,
       has_detailed_death_info,
       enriched_at,
       age_at_death,
       cause_of_death
     FROM actors
     WHERE deathday IS NOT NULL
       AND (has_detailed_death_info = false OR has_detailed_death_info IS NULL)
       AND (enriched_at IS NULL OR enriched_at < NOW() - INTERVAL '30 days')
       AND dof_popularity >= $1
     ORDER BY dof_popularity DESC NULLS LAST, deathday DESC NULLS LAST
     LIMIT $2`,
    [minPopularity, limit]
  )

  return result.rows
}

/**
 * Get distinct causes of death for filter dropdown.
 * Uses normalization table for grouping, returns causes with at least 3 actors.
 */
export async function getDistinctCausesOfDeath(pool: Pool): Promise<CauseOfDeathOption[]> {
  const result = await pool.query<{ cause: string; count: string }>(
    `SELECT
       COALESCE(n.normalized_cause, a.cause_of_death) as cause,
       COUNT(*)::text as count
     FROM actors a
     LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
     WHERE a.deathday IS NOT NULL AND a.cause_of_death IS NOT NULL
     GROUP BY COALESCE(n.normalized_cause, a.cause_of_death)
     HAVING COUNT(*) >= 3
     ORDER BY COUNT(*) DESC
     LIMIT 100`
  )

  return result.rows.map((row) => ({
    value: row.cause,
    label: row.cause,
    count: parseInt(row.count, 10),
  }))
}

export interface EnrichmentVersionOption {
  value: string
  count: number
}

export interface EnrichmentVersionsResult {
  deathVersions: EnrichmentVersionOption[]
  bioVersions: EnrichmentVersionOption[]
}

/**
 * Get distinct enrichment versions for filter dropdowns.
 */
export async function getDistinctEnrichmentVersions(pool: Pool): Promise<EnrichmentVersionsResult> {
  const [deathResult, bioResult] = await Promise.all([
    pool.query<{ version: string; count: string }>(
      `SELECT enrichment_version as version, COUNT(*)::text as count
       FROM actors
       WHERE deathday IS NOT NULL AND enrichment_version IS NOT NULL
       GROUP BY enrichment_version
       ORDER BY enrichment_version DESC`
    ),
    pool.query<{ version: string; count: string }>(
      `SELECT biography_version::text as version, COUNT(*)::text as count
       FROM actors
       WHERE deathday IS NOT NULL AND biography_version IS NOT NULL
       GROUP BY biography_version
       ORDER BY biography_version DESC`
    ),
  ])

  return {
    deathVersions: deathResult.rows.map((row) => ({
      value: row.version,
      count: parseInt(row.count, 10),
    })),
    bioVersions: bioResult.rows.map((row) => ({
      value: row.version,
      count: parseInt(row.count, 10),
    })),
  }
}

/**
 * Get actor preview data for hover card (top movies and shows).
 */
export async function getActorPreview(pool: Pool, actorId: number): Promise<ActorPreviewData> {
  // Fetch top 5 movies by popularity
  const moviesResult = await pool.query<{
    title: string
    release_year: number | null
    character_name: string | null
    dof_popularity: number
  }>(
    `SELECT m.title, m.release_year, ama.character_name, COALESCE(m.dof_popularity, 0)::float as dof_popularity
     FROM actor_movie_appearances ama
     JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
     WHERE ama.actor_id = $1
     ORDER BY m.dof_popularity DESC NULLS LAST
     LIMIT 5`,
    [actorId]
  )

  // Fetch top 3 shows by episode count
  // Each row in actor_show_appearances represents one episode, so we count rows per show
  // Pick first character name alphabetically when it varies across episodes
  const showsResult = await pool.query<{
    name: string
    first_air_year: number | null
    character_name: string | null
    episode_count: number
  }>(
    `SELECT s.name, EXTRACT(YEAR FROM s.first_air_date)::integer as first_air_year,
            (array_agg(asa.character_name ORDER BY asa.character_name NULLS LAST))[1] as character_name,
            COUNT(*) as episode_count
     FROM actor_show_appearances asa
     JOIN shows s ON asa.show_tmdb_id = s.tmdb_id
     WHERE asa.actor_id = $1
     GROUP BY s.tmdb_id, s.name, s.first_air_date
     ORDER BY COUNT(*) DESC
     LIMIT 3`,
    [actorId]
  )

  // Get total counts
  const countsResult = await pool.query<{ total_movies: string; total_shows: string }>(
    `SELECT
       (SELECT COUNT(*) FROM actor_movie_appearances WHERE actor_id = $1)::text as total_movies,
       (SELECT COUNT(*) FROM actor_show_appearances WHERE actor_id = $1)::text as total_shows`,
    [actorId]
  )

  return {
    topMovies: moviesResult.rows.map((row) => ({
      title: row.title,
      releaseYear: row.release_year,
      character: row.character_name,
      popularity: row.dof_popularity ?? 0,
    })),
    topShows: showsResult.rows.map((row) => ({
      name: row.name,
      firstAirYear: row.first_air_year,
      character: row.character_name,
      episodeCount: row.episode_count ?? 0,
    })),
    totalMovies: parseInt(countsResult.rows[0]?.total_movies ?? "0", 10),
    totalShows: parseInt(countsResult.rows[0]?.total_shows ?? "0", 10),
  }
}

/**
 * Capture current coverage snapshot for historical tracking.
 * Called by daily cron job.
 */
export async function captureCurrentSnapshot(pool: Pool): Promise<void> {
  const stats = await getCoverageStats(pool)

  await pool.query(
    `INSERT INTO death_coverage_snapshots (
       captured_at,
       total_deceased_actors,
       actors_with_death_pages,
       actors_without_death_pages,
       coverage_percentage,
       enrichment_candidates_count,
       high_priority_count
     ) VALUES (NOW(), $1, $2, $3, $4, $5, $6)`,
    [
      stats.total_deceased_actors,
      stats.actors_with_death_pages,
      stats.actors_without_death_pages,
      stats.coverage_percentage,
      stats.enrichment_candidates_count,
      stats.high_priority_count,
    ]
  )
}
