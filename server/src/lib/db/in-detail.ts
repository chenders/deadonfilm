/**
 * In Detail database functions.
 *
 * Queries for actors with thoroughly researched death information
 * (has_detailed_death_info = true), sorted by enrichment date by default.
 */

import { createActorSlug } from "../slug-utils.js"
import { getPool } from "./pool.js"
import type { InDetailActor, InDetailOptions, InDetailResponse } from "./types.js"

// Sort column allowlist — maps user-facing sort keys to SQL column names
const IN_DETAIL_SORT_MAP: Record<string, { column: string; defaultDir: string }> = {
  updated: { column: "a.enriched_at", defaultDir: "DESC" },
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
  const conditions: string[] = ["a.deathday IS NOT NULL", "a.has_detailed_death_info = true"]
  const params: (string | number | boolean)[] = []
  let paramIndex = 1

  if (!includeObscure) {
    conditions.push("a.is_obscure = false")
  }

  if (search) {
    conditions.push(`a.name ILIKE $${paramIndex}`)
    params.push(`%${search}%`)
    paramIndex++
  }

  const whereClause = conditions.join(" AND ")

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM actors a
     LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
     WHERE ${whereClause}`,
    params
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
    enriched_at: string | null
    circumstances_confidence: string | null
  }>(
    `SELECT
       a.id, a.tmdb_id, a.name, a.profile_path, a.deathday,
       a.age_at_death, a.cause_of_death, a.death_manner,
       a.enriched_at,
       adc.circumstances_confidence
     FROM actors a
     LEFT JOIN actor_death_circumstances adc ON a.id = adc.actor_id
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
        enrichedAt: row.enriched_at,
        circumstancesConfidence: row.circumstances_confidence,
        slug: createActorSlug(row.name, row.id),
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
