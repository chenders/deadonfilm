/**
 * Shared helper for resolving related celebrity slugs.
 * Used by both the actor profile and death details routes.
 */

import { getPool } from "./db/pool.js"
import { createActorSlug } from "./slug-utils.js"
import type { RelatedCelebrity } from "./db/types.js"

export interface ResolvedRelatedCelebrity {
  name: string
  tmdbId: number | null
  relationship: string
  slug: string | null
}

/**
 * Resolve slugs for an array of related celebrities by looking up
 * their internal actor IDs via tmdb_id or name match.
 * Uses canonical actor names from the database for slug generation.
 */
export async function resolveRelatedCelebritySlugs(
  celebrities: RelatedCelebrity[]
): Promise<ResolvedRelatedCelebrity[]> {
  if (celebrities.length === 0) return []

  const pool = getPool()

  const tmdbIds = celebrities.map((c) => c.tmdb_id).filter((id): id is number => id != null)
  const names = celebrities.map((c) => c.name).filter((n): n is string => Boolean(n))

  // Batch lookup by tmdb_id
  const tmdbIdToActor = new Map<number, { id: number; name: string }>()
  if (tmdbIds.length > 0) {
    const result = await pool.query<{ tmdb_id: number | null; id: number; name: string }>(
      "SELECT tmdb_id, id, name FROM actors WHERE tmdb_id = ANY($1)",
      [tmdbIds]
    )
    for (const row of result.rows) {
      if (row.tmdb_id != null && !tmdbIdToActor.has(row.tmdb_id)) {
        tmdbIdToActor.set(row.tmdb_id, { id: row.id, name: row.name })
      }
    }
  }

  // Batch lookup by name
  const nameToActor = new Map<string, { id: number; name: string }>()
  if (names.length > 0) {
    const result = await pool.query<{ name: string; id: number }>(
      "SELECT name, id FROM actors WHERE name = ANY($1)",
      [names]
    )
    for (const row of result.rows) {
      if (!nameToActor.has(row.name)) {
        nameToActor.set(row.name, { id: row.id, name: row.name })
      }
    }
  }

  return celebrities.map((celeb) => {
    let actor: { id: number; name: string } | null = null

    // Precedence: first try tmdb_id, then exact name match
    if (celeb.tmdb_id != null) {
      actor = tmdbIdToActor.get(celeb.tmdb_id) ?? null
    }
    if (actor == null) {
      actor = nameToActor.get(celeb.name) ?? null
    }

    return {
      name: celeb.name,
      tmdbId: celeb.tmdb_id,
      relationship: celeb.relationship,
      // Use the canonical actor name from the database for slug generation
      slug: actor ? createActorSlug(actor.name, actor.id) : null,
    }
  })
}
