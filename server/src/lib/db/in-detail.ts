/**
 * In Detail database functions.
 *
 * Queries for actors with thoroughly researched profiles — either detailed
 * death information (has_detailed_death_info = true) or enriched biographies
 * (present in actor_biography_details), sorted by enrichment date by default.
 */

import { createActorSlug } from "../slug-utils.js"
import { getPool } from "./pool.js"
import type { InDetailActor, InDetailOptions, InDetailResponse } from "./types.js"

// Sort column allowlist — maps user-facing sort keys to SQL column names
const IN_DETAIL_SORT_MAP: Record<string, { column: string; defaultDir: string }> = {
  updated: { column: "enriched_at_combined", defaultDir: "DESC" },
  date: { column: "a.deathday", defaultDir: "DESC" },
  name: { column: "a.name", defaultDir: "ASC" },
  age: { column: "a.age_at_death", defaultDir: "DESC" },
}

export async function getInDetailActors(options: InDetailOptions = {}): Promise<InDetailResponse> {
  const db = getPool()
  const { page = 1, pageSize = 50, includeObscure = false, search, sort, dir } = options
  const offset = (page - 1) * pageSize

  // Sort column comes from hardcoded allowlist, NOT user input (safe for SQL interpolation)
  const sortEntry = IN_DETAIL_SORT_MAP[sort || "updated"] || IN_DETAIL_SORT_MAP.updated
  const sortColumn = sortEntry.column
  const sortDirection = dir === "asc" ? "ASC" : dir === "desc" ? "DESC" : sortEntry.defaultDir
  const nullsOrder = sortDirection === "ASC" ? "NULLS FIRST" : "NULLS LAST"

  // Build parameterized conditions
  // Uses abd from LEFT JOIN below instead of a correlated EXISTS subquery
  const conditions: string[] = [`(a.has_detailed_death_info = true OR abd.id IS NOT NULL)`]
  const params: (string | number | boolean)[] = []
  let paramIndex = 1

  if (!includeObscure) {
    conditions.push("a.is_obscure = false")
  }

  if (search) {
    const words = search.trim().split(/\s+/)
    for (const word of words) {
      conditions.push(`a.name ILIKE $${paramIndex}`)
      params.push(`%${word}%`)
      paramIndex++
    }
  }

  const whereClause = conditions.join(" AND ")

  // Get total count (needs LEFT JOIN for abd.id IS NOT NULL condition)
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM actors a
     LEFT JOIN actor_biography_details abd ON a.id = abd.actor_id
     WHERE ${whereClause}`,
    params
  )
  const totalCount = parseInt(countResult.rows[0]?.count || "0", 10)

  // Get paginated actors with top films via lateral join
  const result = await db.query<{
    id: number
    tmdb_id: number | null
    name: string
    profile_path: string | null
    deathday: string | null
    age_at_death: number | null
    cause_of_death: string | null
    death_manner: string | null
    enriched_at_combined: string | null
    circumstances_confidence: string | null
    has_detailed_death_info: boolean
    has_enriched_bio: boolean
    top_films: Array<{ title: string; year: number | null }> | null
  }>(
    `SELECT
       a.id, a.tmdb_id, a.name, a.profile_path, a.deathday,
       a.age_at_death, a.cause_of_death, a.death_manner,
       COALESCE(GREATEST(a.enriched_at, abd.updated_at), a.enriched_at, abd.updated_at) as enriched_at_combined,
       adc.circumstances_confidence,
       COALESCE(a.has_detailed_death_info, false) as has_detailed_death_info,
       (abd.id IS NOT NULL) as has_enriched_bio,
       tf.films as top_films
     FROM actors a
     LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
     LEFT JOIN actor_biography_details abd ON a.id = abd.actor_id
     LEFT JOIN LATERAL (
       SELECT json_agg(sub.film) as films
       FROM (
         SELECT json_build_object('title', m.title, 'year', m.release_year) as film
         FROM actor_movie_appearances ama
         JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
         WHERE ama.actor_id = a.id
         ORDER BY m.tmdb_popularity DESC NULLS LAST
         LIMIT 3
       ) sub
     ) tf ON true
     WHERE ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection} ${nullsOrder}, a.name, a.id
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset]
  )

  return {
    actors: result.rows.map(
      (row): InDetailActor => ({
        id: row.id,
        tmdbId: row.tmdb_id,
        name: row.name,
        profilePath: row.profile_path,
        deathday: row.deathday,
        ageAtDeath: row.age_at_death,
        causeOfDeath: row.cause_of_death,
        deathManner: row.death_manner,
        enrichedAt: row.enriched_at_combined,
        circumstancesConfidence: row.circumstances_confidence,
        slug: createActorSlug(row.name, row.id),
        topFilms: row.top_films || [],
        hasDetailedDeathInfo: row.has_detailed_death_info,
        hasEnrichedBio: row.has_enriched_bio,
      })
    ),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  }
}
