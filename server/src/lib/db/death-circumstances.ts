/**
 * Death circumstances database functions.
 *
 * Functions for querying detailed death information, notable deaths,
 * and related metadata.
 */

import { createActorSlug } from "../slug-utils.js"
import { getPool } from "./pool.js"
import type {
  ActorDeathCircumstancesRecord,
  NotableDeathActor,
  NotableDeathsOptions,
  NotableDeathsResponse,
} from "./types.js"

// ============================================================================
// Death Circumstances functions
// ============================================================================

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
    actors: result.rows.map(
      (row): NotableDeathActor => ({
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
