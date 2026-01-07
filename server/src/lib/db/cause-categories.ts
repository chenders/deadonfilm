/**
 * Cause of death category database functions.
 *
 * Functions for querying deaths by cause, hierarchical cause categories,
 * and related SEO pages.
 */

import { getPool } from "./pool.js"
import type {
  ActorRecord,
  CauseCategory,
  DeathByCauseRecord,
  DeathsByCauseOptions,
  DecadeCategory,
  CauseCategoryStats,
  CauseCategoryIndexResponse,
  CauseCategoryDetailResponse,
  CauseCategoryOptions,
  SpecificCauseResponse,
  SpecificCauseOptions,
} from "./types.js"

import {
  CAUSE_CATEGORIES,
  buildCategoryCaseStatement,
  buildCategoryCondition as buildCauseCategoryCondition,
  getCategoryBySlug,
  createCauseSlug,
} from "../cause-categories.js"

// Re-export for convenience
export { CAUSE_CATEGORIES, type CauseCategoryKey } from "../cause-categories.js"

// ============================================================================
// Deaths by Cause functions (SEO category pages)
// ============================================================================

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
// Deaths by Decade functions (SEO category pages)
// ============================================================================

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

// ============================================================================
// Causes of Death Category Functions (Hierarchical)
// ============================================================================

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
