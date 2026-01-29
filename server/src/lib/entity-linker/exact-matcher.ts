/**
 * Exact entity matching using database lookups and regex word boundaries.
 *
 * Finds exact name matches of actors, movies, and TV shows in text.
 * Confidence is always 1.0 for exact matches.
 */

import type { Pool } from "pg"
import type { EntityLink, LinkableEntity, LinkedRange } from "./types.js"
import { createActorSlug, createMovieSlug, createShowSlug } from "../slug-utils.js"

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Check if a range overlaps with any existing linked ranges
 */
export function overlapsExisting(start: number, end: number, linkedRanges: LinkedRange[]): boolean {
  return linkedRanges.some(
    (range) =>
      (start >= range.start && start < range.end) ||
      (end > range.start && end <= range.end) ||
      (start <= range.start && end >= range.end)
  )
}

// ============================================================================
// Database Queries
// ============================================================================

/**
 * Get all linkable entities from the database.
 *
 * For actors: Only deceased actors with tmdb_id (required for actor pages).
 * For movies/shows: Filter by popularity or deceased count to avoid obscure titles.
 */
export async function getLinkableEntities(
  db: Pool,
  excludeActorId?: number
): Promise<LinkableEntity[]> {
  // Get deceased actors with TMDB IDs
  // Actors without tmdb_id don't have pages, so nothing to link to
  const actorQuery = excludeActorId
    ? `SELECT id, tmdb_id, name
       FROM actors
       WHERE deathday IS NOT NULL
         AND tmdb_id IS NOT NULL
         AND id != $1
       ORDER BY popularity DESC NULLS LAST
       LIMIT 5000`
    : `SELECT id, tmdb_id, name
       FROM actors
       WHERE deathday IS NOT NULL
         AND tmdb_id IS NOT NULL
       ORDER BY popularity DESC NULLS LAST
       LIMIT 5000`

  const actorParams = excludeActorId ? [excludeActorId] : []
  const actorsResult = await db.query<{
    id: number
    tmdb_id: number
    name: string
  }>(actorQuery, actorParams)

  // Get popular movies (avoid obscure titles that could cause false positives)
  const moviesResult = await db.query<{
    tmdb_id: number
    title: string
    release_year: number | null
  }>(`
    SELECT tmdb_id, title,
           EXTRACT(YEAR FROM release_date)::int as release_year
    FROM movies
    WHERE popularity >= 5 OR deceased_count >= 3
    ORDER BY popularity DESC NULLS LAST
    LIMIT 5000
  `)

  // Get popular shows
  const showsResult = await db.query<{
    tmdb_id: number
    name: string
    first_air_year: number | null
  }>(`
    SELECT tmdb_id, name,
           EXTRACT(YEAR FROM first_air_date)::int as first_air_year
    FROM shows
    WHERE popularity >= 5 OR deceased_count >= 3
    ORDER BY popularity DESC NULLS LAST
    LIMIT 5000
  `)

  // Map to LinkableEntity format, filtering out entries with missing names
  const actors: LinkableEntity[] = actorsResult.rows
    .filter((a) => a.name && a.id)
    .map((a) => ({
      type: "actor" as const,
      id: a.id,
      name: a.name,
      tmdbId: a.tmdb_id,
      slug: createActorSlug(a.name, a.id),
    }))

  const movies: LinkableEntity[] = moviesResult.rows
    .filter((m) => m.title && m.tmdb_id)
    .map((m) => ({
      type: "movie" as const,
      name: m.title,
      tmdbId: m.tmdb_id,
      slug: createMovieSlug(m.title, m.release_year, m.tmdb_id),
      year: m.release_year,
    }))

  const shows: LinkableEntity[] = showsResult.rows
    .filter((s) => s.name && s.tmdb_id)
    .map((s) => ({
      type: "show" as const,
      name: s.name,
      tmdbId: s.tmdb_id,
      slug: createShowSlug(s.name, s.first_air_year, s.tmdb_id),
      year: s.first_air_year,
    }))

  return [...actors, ...movies, ...shows]
}

// ============================================================================
// Main Exact Matcher
// ============================================================================

/**
 * Find exact matches of entity names in text.
 *
 * Strategy:
 * 1. Get all linkable entities from database
 * 2. Sort by name length (longest first) to avoid partial matches
 * 3. Use regex with word boundaries for case-insensitive matching
 * 4. Skip overlapping matches
 *
 * @param db - Database pool
 * @param text - Text to search for entities
 * @param excludeActorId - Actor ID to exclude (prevent self-linking)
 * @returns Array of exact match EntityLinks with confidence 1.0
 */
export async function findExactMatches(
  db: Pool,
  text: string,
  excludeActorId?: number
): Promise<EntityLink[]> {
  // Early return for empty or very short text
  if (!text || text.length < 3) {
    return []
  }

  const entities = await getLinkableEntities(db, excludeActorId)

  // Sort by name length (longest first) to avoid partial matches
  // e.g., "The Godfather Part II" should match before "The Godfather"
  entities.sort((a, b) => b.name.length - a.name.length)

  const links: EntityLink[] = []
  const linkedRanges: LinkedRange[] = []

  for (const entity of entities) {
    // Skip very short names (high false positive risk)
    if (entity.name.length < 3) continue

    // Create regex with word boundaries for exact matching
    const escapedName = escapeRegex(entity.name)
    const pattern = new RegExp(`\\b${escapedName}\\b`, "gi")

    for (const match of text.matchAll(pattern)) {
      const start = match.index!
      const end = start + match[0].length

      // Skip overlapping matches
      if (overlapsExisting(start, end, linkedRanges)) continue

      links.push({
        start,
        end,
        text: match[0],
        entityType: entity.type,
        entityId: entity.tmdbId,
        entitySlug: entity.slug,
        matchMethod: "exact",
        confidence: 1.0,
      })

      linkedRanges.push({ start, end })
    }
  }

  // Sort by position in text
  links.sort((a, b) => a.start - b.start)

  return links
}
