/**
 * Death link backfiller module.
 *
 * Provides reusable functions for populating TMDB IDs in death-related records.
 * Used by both the CLI backfill script and the enrichment commit workflow.
 */

import type { Pool, PoolClient } from "pg"
import type { ProjectInfo, RelatedCelebrity } from "./db/types.js"

// ============================================================================
// Types
// ============================================================================

export interface BackfillResult {
  linksAdded: number
  actorsLinked: number
  projectsLinked: number
  celebritiesLinked: number
}

interface DeathCircumstanceRecord {
  id: number
  actor_id: number
  last_project: ProjectInfo | null
  posthumous_releases: ProjectInfo[] | null
  related_celebrities: RelatedCelebrity[] | null
}

// Extended types to handle both snake_case and camelCase field names
type ProjectInfoWithCamelCase = ProjectInfo & { tmdbId?: number | null }
type RelatedCelebrityWithCamelCase = RelatedCelebrity & { tmdbId?: number | null }

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Look up a movie or show by title and optional year.
 * Returns the tmdb_id if found, null otherwise.
 */
export async function lookupProject(
  db: Pool | PoolClient,
  title: string,
  year: number | null,
  type: string
): Promise<number | null> {
  // Try movies first (unless type explicitly says show)
  if (type !== "show") {
    const movieQuery = year
      ? `SELECT tmdb_id FROM movies WHERE LOWER(title) = LOWER($1) AND release_year = $2 LIMIT 1`
      : `SELECT tmdb_id FROM movies WHERE LOWER(title) = LOWER($1) LIMIT 1`
    const movieParams = year ? [title, year] : [title]
    const movieResult = await db.query<{ tmdb_id: number }>(movieQuery, movieParams)
    if (movieResult.rows.length > 0) {
      return movieResult.rows[0].tmdb_id
    }
  }

  // Try shows
  if (type !== "movie") {
    const showQuery = year
      ? `SELECT tmdb_id FROM shows WHERE LOWER(name) = LOWER($1) AND EXTRACT(YEAR FROM first_air_date) = $2 LIMIT 1`
      : `SELECT tmdb_id FROM shows WHERE LOWER(name) = LOWER($1) LIMIT 1`
    const showParams = year ? [title, year] : [title]
    const showResult = await db.query<{ tmdb_id: number }>(showQuery, showParams)
    if (showResult.rows.length > 0) {
      return showResult.rows[0].tmdb_id
    }
  }

  return null
}

/**
 * Look up an actor by name.
 * Returns the tmdb_id if found, null otherwise.
 */
export async function lookupActor(db: Pool | PoolClient, name: string): Promise<number | null> {
  // Exact match first
  const exactResult = await db.query<{ tmdb_id: number }>(
    `SELECT tmdb_id FROM actors WHERE LOWER(name) = LOWER($1) AND tmdb_id IS NOT NULL LIMIT 1`,
    [name]
  )
  if (exactResult.rows.length > 0) {
    return exactResult.rows[0].tmdb_id
  }

  // Try without middle names/initials (e.g., "John Q. Public" -> "John Public")
  const simplifiedName = name.replace(/\s+[A-Z]\.?\s+/g, " ").trim()
  if (simplifiedName !== name) {
    const simplifiedResult = await db.query<{ tmdb_id: number }>(
      `SELECT tmdb_id FROM actors WHERE LOWER(name) = LOWER($1) AND tmdb_id IS NOT NULL LIMIT 1`,
      [simplifiedName]
    )
    if (simplifiedResult.rows.length > 0) {
      return simplifiedResult.rows[0].tmdb_id
    }
  }

  return null
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get tmdb_id from project (handles both snake_case and camelCase)
 */
export function getProjectTmdbId(project: ProjectInfoWithCamelCase): number | null {
  return project.tmdb_id ?? project.tmdbId ?? null
}

/**
 * Set tmdb_id on project (sets both for compatibility)
 */
export function setProjectTmdbId(project: ProjectInfoWithCamelCase, tmdbId: number): void {
  project.tmdb_id = tmdbId
  project.tmdbId = tmdbId
}

/**
 * Get tmdb_id from celebrity (handles both snake_case and camelCase)
 */
export function getCelebrityTmdbId(celebrity: RelatedCelebrityWithCamelCase): number | null {
  return celebrity.tmdb_id ?? celebrity.tmdbId ?? null
}

/**
 * Set tmdb_id on celebrity (sets both for compatibility)
 */
export function setCelebrityTmdbId(celebrity: RelatedCelebrityWithCamelCase, tmdbId: number): void {
  celebrity.tmdb_id = tmdbId
  celebrity.tmdbId = tmdbId
}

// ============================================================================
// Core Backfill Functions
// ============================================================================

/**
 * Process a single project and try to fill in the tmdb_id.
 * Returns true if the project was updated.
 */
export async function processProject(
  db: Pool | PoolClient,
  project: ProjectInfoWithCamelCase
): Promise<boolean> {
  if (getProjectTmdbId(project) !== null) {
    return false // Already has tmdb_id
  }

  const tmdbId = await lookupProject(db, project.title, project.year, project.type)
  if (tmdbId !== null) {
    setProjectTmdbId(project, tmdbId)
    return true
  }

  return false
}

/**
 * Process a single celebrity and try to fill in the tmdb_id.
 * Returns true if the celebrity was updated.
 */
export async function processCelebrity(
  db: Pool | PoolClient,
  celebrity: RelatedCelebrityWithCamelCase
): Promise<boolean> {
  if (getCelebrityTmdbId(celebrity) !== null) {
    return false // Already has tmdb_id
  }

  const tmdbId = await lookupActor(db, celebrity.name)
  if (tmdbId !== null) {
    setCelebrityTmdbId(celebrity, tmdbId)
    return true
  }

  return false
}

/**
 * Backfill TMDB IDs for death circumstances of specific actors.
 *
 * This function is designed to be called within an existing transaction
 * (e.g., during enrichment commit) or standalone for batch processing.
 *
 * @param db - Database pool or client (if using within a transaction, pass the client)
 * @param actorIds - Array of actor IDs to process
 * @returns BackfillResult with statistics about what was linked
 */
export async function backfillLinksForActors(
  db: Pool | PoolClient,
  actorIds: number[]
): Promise<BackfillResult> {
  const result: BackfillResult = {
    linksAdded: 0,
    actorsLinked: 0,
    projectsLinked: 0,
    celebritiesLinked: 0,
  }

  if (actorIds.length === 0) {
    return result
  }

  // Query death circumstances for the specified actors
  const recordsResult = await db.query<DeathCircumstanceRecord>(
    `SELECT
       id,
       actor_id,
       last_project,
       posthumous_releases,
       related_celebrities
     FROM actor_death_circumstances
     WHERE actor_id = ANY($1)
       AND (
         last_project IS NOT NULL OR
         posthumous_releases IS NOT NULL OR
         related_celebrities IS NOT NULL
       )`,
    [actorIds]
  )

  const records = recordsResult.rows

  for (const record of records) {
    let recordModified = false

    // Process last_project
    if (record.last_project) {
      const linked = await processProject(db, record.last_project)
      if (linked) {
        result.projectsLinked++
        result.linksAdded++
        recordModified = true
      }
    }

    // Process posthumous_releases
    if (record.posthumous_releases) {
      for (const project of record.posthumous_releases) {
        const linked = await processProject(db, project)
        if (linked) {
          result.projectsLinked++
          result.linksAdded++
          recordModified = true
        }
      }
    }

    // Process related_celebrities
    if (record.related_celebrities) {
      for (const celebrity of record.related_celebrities) {
        const linked = await processCelebrity(db, celebrity)
        if (linked) {
          result.celebritiesLinked++
          result.linksAdded++
          recordModified = true
        }
      }
    }

    // Update the record if modified
    if (recordModified) {
      await db.query(
        `UPDATE actor_death_circumstances
         SET last_project = $2,
             posthumous_releases = $3,
             related_celebrities = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          record.id,
          record.last_project ? JSON.stringify(record.last_project) : null,
          record.posthumous_releases ? JSON.stringify(record.posthumous_releases) : null,
          record.related_celebrities ? JSON.stringify(record.related_celebrities) : null,
        ]
      )
      result.actorsLinked++
    }
  }

  return result
}
