/**
 * Actor database functions.
 *
 * Functions for managing actors in the database - CRUD operations,
 * death info updates, and filmography queries.
 */

import { getPool } from "./pool.js"
import type {
  ActorRecord,
  ActorInput,
  ActorFilmographyMovie,
  ActorFilmographyShow,
  DeathInfoSource,
} from "./types.js"

// ============================================================================
// Actor CRUD functions
// ============================================================================

// Get an actor by TMDB ID
export async function getActor(tmdbId: number): Promise<ActorRecord | null> {
  const db = getPool()
  const result = await db.query<ActorRecord>("SELECT * FROM actors WHERE tmdb_id = $1", [tmdbId])
  return result.rows[0] || null
}

// Get multiple actors by TMDB IDs
export async function getActors(tmdbIds: number[]): Promise<Map<number, ActorRecord>> {
  if (tmdbIds.length === 0) return new Map()

  const db = getPool()
  const placeholders = tmdbIds.map((_, i) => `$${i + 1}`).join(", ")
  const result = await db.query<ActorRecord>(
    `SELECT * FROM actors WHERE tmdb_id IN (${placeholders})`,
    tmdbIds
  )

  const map = new Map<number, ActorRecord>()
  for (const row of result.rows) {
    // tmdb_id should never be null here since we're querying by tmdb_id,
    // but we need to satisfy TypeScript
    if (row.tmdb_id !== null) {
      map.set(row.tmdb_id, row)
    }
  }
  return map
}

// Insert or update an actor
// Note: COALESCE prioritizes existing values over new values to preserve first-found data.
// This is intentional - once we have death info, we don't overwrite it with potentially
// different/conflicting data from later lookups.
// Returns the actor's internal id (useful for creating appearance records)
export async function upsertActor(actor: ActorInput): Promise<number> {
  const db = getPool()

  // For actors with tmdb_id, use ON CONFLICT on tmdb_id
  // For actors without tmdb_id (TVmaze/TheTVDB only), use a different approach
  if (actor.tmdb_id === null || actor.tmdb_id === undefined) {
    // Non-TMDB actor - look up by external IDs or insert new
    if (actor.tvmaze_person_id) {
      const existing = await db.query<{ id: number }>(
        `SELECT id FROM actors WHERE tvmaze_person_id = $1`,
        [actor.tvmaze_person_id]
      )
      if (existing.rows.length > 0) {
        // Update existing actor
        await db.query(
          `UPDATE actors SET
             name = $2,
             birthday = COALESCE(birthday, $3),
             deathday = COALESCE(deathday, $4),
             profile_path = COALESCE(profile_path, $5),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existing.rows[0].id,
            actor.name,
            actor.birthday ?? null,
            actor.deathday ?? null,
            actor.profile_path ?? null,
          ]
        )
        return existing.rows[0].id
      }
    }
    if (actor.thetvdb_person_id) {
      const existing = await db.query<{ id: number }>(
        `SELECT id FROM actors WHERE thetvdb_person_id = $1`,
        [actor.thetvdb_person_id]
      )
      if (existing.rows.length > 0) {
        // Update existing actor
        await db.query(
          `UPDATE actors SET
             name = $2,
             birthday = COALESCE(birthday, $3),
             deathday = COALESCE(deathday, $4),
             profile_path = COALESCE(profile_path, $5),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existing.rows[0].id,
            actor.name,
            actor.birthday ?? null,
            actor.deathday ?? null,
            actor.profile_path ?? null,
          ]
        )
        return existing.rows[0].id
      }
    }
    if (actor.imdb_person_id) {
      const existing = await db.query<{ id: number }>(
        `SELECT id FROM actors WHERE imdb_person_id = $1`,
        [actor.imdb_person_id]
      )
      if (existing.rows.length > 0) {
        // Update existing actor
        await db.query(
          `UPDATE actors SET
             name = $2,
             birthday = COALESCE(birthday, $3),
             deathday = COALESCE(deathday, $4),
             profile_path = COALESCE(profile_path, $5),
             updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            existing.rows[0].id,
            actor.name,
            actor.birthday ?? null,
            actor.deathday ?? null,
            actor.profile_path ?? null,
          ]
        )
        return existing.rows[0].id
      }
    }
    // Insert new non-TMDB actor
    const result = await db.query<{ id: number }>(
      `INSERT INTO actors (name, birthday, deathday, profile_path, popularity, tvmaze_person_id, thetvdb_person_id, imdb_person_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       RETURNING id`,
      [
        actor.name,
        actor.birthday ?? null,
        actor.deathday ?? null,
        actor.profile_path ?? null,
        actor.popularity ?? null,
        actor.tvmaze_person_id ?? null,
        actor.thetvdb_person_id ?? null,
        actor.imdb_person_id ?? null,
      ]
    )
    return result.rows[0].id
  }

  // TMDB actor - use ON CONFLICT on tmdb_id
  const result = await db.query<{ id: number }>(
    `INSERT INTO actors (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, profile_path, age_at_death, expected_lifespan, years_lost, popularity, violent_death, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       birthday = COALESCE(actors.birthday, EXCLUDED.birthday),
       deathday = COALESCE(actors.deathday, EXCLUDED.deathday),
       cause_of_death = COALESCE(actors.cause_of_death, EXCLUDED.cause_of_death),
       cause_of_death_source = COALESCE(actors.cause_of_death_source, EXCLUDED.cause_of_death_source),
       cause_of_death_details = COALESCE(actors.cause_of_death_details, EXCLUDED.cause_of_death_details),
       cause_of_death_details_source = COALESCE(actors.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
       wikipedia_url = COALESCE(actors.wikipedia_url, EXCLUDED.wikipedia_url),
       profile_path = COALESCE(actors.profile_path, EXCLUDED.profile_path),
       age_at_death = COALESCE(actors.age_at_death, EXCLUDED.age_at_death),
       expected_lifespan = COALESCE(actors.expected_lifespan, EXCLUDED.expected_lifespan),
       years_lost = COALESCE(actors.years_lost, EXCLUDED.years_lost),
       popularity = COALESCE(actors.popularity, EXCLUDED.popularity),
       violent_death = COALESCE(actors.violent_death, EXCLUDED.violent_death),
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      actor.tmdb_id,
      actor.name,
      actor.birthday ?? null,
      actor.deathday ?? null,
      actor.cause_of_death ?? null,
      actor.cause_of_death_source ?? null,
      actor.cause_of_death_details ?? null,
      actor.cause_of_death_details_source ?? null,
      actor.wikipedia_url ?? null,
      actor.profile_path ?? null,
      actor.age_at_death ?? null,
      actor.expected_lifespan ?? null,
      actor.years_lost ?? null,
      actor.popularity ?? null,
      actor.violent_death ?? null,
    ]
  )
  return result.rows[0].id
}

// Batch insert/update actors
// Returns a map of tmdb_id -> internal actor id (for creating appearance records)
export async function batchUpsertActors(actors: ActorInput[]): Promise<Map<number, number>> {
  const tmdbIdToActorId = new Map<number, number>()
  if (actors.length === 0) return tmdbIdToActorId

  const db = getPool()

  // Use a transaction for batch insert
  const client = await db.connect()
  try {
    await client.query("BEGIN")

    for (const actor of actors) {
      // Skip actors without TMDB IDs - they should use upsertActor directly
      if (actor.tmdb_id === null || actor.tmdb_id === undefined) {
        console.warn(`Skipping actor without tmdb_id in batchUpsertActors: ${actor.name}`)
        continue
      }

      const result = await client.query<{ id: number; tmdb_id: number }>(
        `INSERT INTO actors (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, profile_path, age_at_death, expected_lifespan, years_lost, popularity, violent_death, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
         ON CONFLICT (tmdb_id) DO UPDATE SET
           name = EXCLUDED.name,
           birthday = COALESCE(actors.birthday, EXCLUDED.birthday),
           deathday = COALESCE(actors.deathday, EXCLUDED.deathday),
           cause_of_death = COALESCE(actors.cause_of_death, EXCLUDED.cause_of_death),
           cause_of_death_source = COALESCE(actors.cause_of_death_source, EXCLUDED.cause_of_death_source),
           cause_of_death_details = COALESCE(actors.cause_of_death_details, EXCLUDED.cause_of_death_details),
           cause_of_death_details_source = COALESCE(actors.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
           wikipedia_url = COALESCE(actors.wikipedia_url, EXCLUDED.wikipedia_url),
           profile_path = COALESCE(actors.profile_path, EXCLUDED.profile_path),
           age_at_death = COALESCE(actors.age_at_death, EXCLUDED.age_at_death),
           expected_lifespan = COALESCE(actors.expected_lifespan, EXCLUDED.expected_lifespan),
           years_lost = COALESCE(actors.years_lost, EXCLUDED.years_lost),
           popularity = COALESCE(actors.popularity, EXCLUDED.popularity),
           violent_death = COALESCE(actors.violent_death, EXCLUDED.violent_death),
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, tmdb_id`,
        [
          actor.tmdb_id,
          actor.name,
          actor.birthday ?? null,
          actor.deathday ?? null,
          actor.cause_of_death ?? null,
          actor.cause_of_death_source ?? null,
          actor.cause_of_death_details ?? null,
          actor.cause_of_death_details_source ?? null,
          actor.wikipedia_url ?? null,
          actor.profile_path ?? null,
          actor.age_at_death ?? null,
          actor.expected_lifespan ?? null,
          actor.years_lost ?? null,
          actor.popularity ?? null,
          actor.violent_death ?? null,
        ]
      )

      if (result.rows[0]) {
        tmdbIdToActorId.set(result.rows[0].tmdb_id, result.rows[0].id)
      }
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }

  return tmdbIdToActorId
}

// ============================================================================
// Death info update functions
// ============================================================================

// Update just the cause of death and wikipedia URL for an existing actor
// Note: COALESCE prioritizes existing values - see comment on upsertActor
export async function updateDeathInfo(
  tmdbId: number,
  causeOfDeath: string | null,
  causeOfDeathSource: DeathInfoSource,
  causeOfDeathDetails: string | null,
  causeOfDeathDetailsSource: DeathInfoSource,
  wikipediaUrl: string | null
): Promise<void> {
  const db = getPool()
  await db.query(
    `UPDATE actors
     SET cause_of_death = COALESCE(cause_of_death, $2),
         cause_of_death_source = COALESCE(cause_of_death_source, $3),
         cause_of_death_details = COALESCE(cause_of_death_details, $4),
         cause_of_death_details_source = COALESCE(cause_of_death_details_source, $5),
         wikipedia_url = COALESCE(wikipedia_url, $6),
         updated_at = CURRENT_TIMESTAMP
     WHERE tmdb_id = $1`,
    [
      tmdbId,
      causeOfDeath,
      causeOfDeathSource,
      causeOfDeathDetails,
      causeOfDeathDetailsSource,
      wikipediaUrl,
    ]
  )
}

// Update death info by internal actor ID (for non-TMDB actors like those from IMDb)
// Note: COALESCE prioritizes existing values - see comment on upsertActor
export async function updateDeathInfoByActorId(
  actorId: number,
  causeOfDeath: string | null,
  causeOfDeathSource: DeathInfoSource,
  causeOfDeathDetails: string | null,
  causeOfDeathDetailsSource: DeathInfoSource,
  wikipediaUrl: string | null
): Promise<void> {
  const db = getPool()
  await db.query(
    `UPDATE actors
     SET cause_of_death = COALESCE(cause_of_death, $2),
         cause_of_death_source = COALESCE(cause_of_death_source, $3),
         cause_of_death_details = COALESCE(cause_of_death_details, $4),
         cause_of_death_details_source = COALESCE(cause_of_death_details_source, $5),
         wikipedia_url = COALESCE(wikipedia_url, $6),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      actorId,
      causeOfDeath,
      causeOfDeathSource,
      causeOfDeathDetails,
      causeOfDeathDetailsSource,
      wikipediaUrl,
    ]
  )
}

// ============================================================================
// Actor lookup functions
// ============================================================================

// Get actor by internal ID
export async function getActorById(id: number): Promise<ActorRecord | null> {
  const db = getPool()
  const result = await db.query<ActorRecord>("SELECT * FROM actors WHERE id = $1", [id])
  return result.rows[0] || null
}

// Get deceased actors who died on a specific month/day (for "On This Day" feature)
// Only returns actors with a profile photo
export async function getDeceasedByMonthDay(month: number, day: number): Promise<ActorRecord[]> {
  const db = getPool()
  const result = await db.query<ActorRecord>(
    `SELECT * FROM actors
     WHERE deathday IS NOT NULL
       AND EXTRACT(MONTH FROM deathday) = $1
       AND EXTRACT(DAY FROM deathday) = $2
       AND profile_path IS NOT NULL
     ORDER BY deathday DESC`,
    [month, day]
  )
  return result.rows
}

// ============================================================================
// Actor filmography functions
// ============================================================================

// Get actor's filmography from our database
export async function getActorFilmography(actorTmdbId: number): Promise<ActorFilmographyMovie[]> {
  const db = getPool()

  // Use CTE to calculate mortality stats once per movie, then join with actor's appearances.
  // This avoids N+1 correlated subqueries that were causing slow performance.
  const filmographyResult = await db.query<{
    movie_id: number
    title: string
    release_year: number | null
    character_name: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
  }>(
    `WITH actor_movies AS (
       -- Get all movies this actor appeared in
       SELECT aa.movie_tmdb_id, aa.character_name
       FROM actor_movie_appearances aa
       JOIN actors a ON aa.actor_id = a.id
       WHERE a.tmdb_id = $1
     ),
     movie_stats AS (
       -- Calculate stats for just these movies (single pass)
       SELECT
         aa.movie_tmdb_id,
         COUNT(DISTINCT a.id)::int as cast_count,
         COUNT(DISTINCT a.id) FILTER (WHERE a.deathday IS NOT NULL)::int as deceased_count
       FROM actor_movie_appearances aa
       JOIN actors a ON aa.actor_id = a.id
       WHERE aa.movie_tmdb_id IN (SELECT movie_tmdb_id FROM actor_movies)
       GROUP BY aa.movie_tmdb_id
     )
     SELECT
       m.tmdb_id as movie_id,
       m.title,
       m.release_year,
       am.character_name,
       m.poster_path,
       COALESCE(ms.deceased_count, 0) as deceased_count,
       COALESCE(ms.cast_count, 0) as cast_count
     FROM actor_movies am
     JOIN movies m ON am.movie_tmdb_id = m.tmdb_id
     LEFT JOIN movie_stats ms ON m.tmdb_id = ms.movie_tmdb_id
     ORDER BY m.release_year DESC NULLS LAST`,
    [actorTmdbId]
  )

  return filmographyResult.rows.map((row) => ({
    movieId: row.movie_id,
    title: row.title,
    releaseYear: row.release_year,
    character: row.character_name,
    posterPath: row.poster_path,
    deceasedCount: row.deceased_count,
    castCount: row.cast_count,
  }))
}

export async function getActorShowFilmography(
  actorTmdbId: number
): Promise<ActorFilmographyShow[]> {
  const db = getPool()

  // Use CTE to calculate mortality stats once per show, then join with actor's appearances.
  // This avoids N+1 correlated subqueries that were causing slow performance.
  const filmographyResult = await db.query<{
    show_id: number
    name: string
    first_air_year: number | null
    last_air_year: number | null
    character_name: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
    episode_count: number
  }>(
    `WITH actor_shows AS (
       -- Get all shows this actor appeared in with their character and episode count
       SELECT
         asa.show_tmdb_id,
         asa.actor_id,
         COUNT(DISTINCT (asa.season_number, asa.episode_number))::int as episode_count,
         -- Get most common character name for this actor in this show
         (ARRAY_AGG(asa.character_name ORDER BY asa.character_name)
          FILTER (WHERE asa.character_name IS NOT NULL))[1] as character_name
       FROM actor_show_appearances asa
       JOIN actors a ON asa.actor_id = a.id
       WHERE a.tmdb_id = $1
       GROUP BY asa.show_tmdb_id, asa.actor_id
     ),
     show_stats AS (
       -- Calculate stats for just these shows (single pass)
       SELECT
         asa.show_tmdb_id,
         COUNT(DISTINCT a.id)::int as cast_count,
         COUNT(DISTINCT a.id) FILTER (WHERE a.deathday IS NOT NULL)::int as deceased_count
       FROM actor_show_appearances asa
       JOIN actors a ON asa.actor_id = a.id
       WHERE asa.show_tmdb_id IN (SELECT show_tmdb_id FROM actor_shows)
       GROUP BY asa.show_tmdb_id
     )
     SELECT
       s.tmdb_id as show_id,
       s.name,
       EXTRACT(YEAR FROM s.first_air_date)::int as first_air_year,
       EXTRACT(YEAR FROM s.last_air_date)::int as last_air_year,
       ash.character_name,
       s.poster_path,
       COALESCE(ss.deceased_count, 0) as deceased_count,
       COALESCE(ss.cast_count, 0) as cast_count,
       ash.episode_count
     FROM actor_shows ash
     JOIN shows s ON ash.show_tmdb_id = s.tmdb_id
     LEFT JOIN show_stats ss ON s.tmdb_id = ss.show_tmdb_id
     ORDER BY s.first_air_date DESC NULLS LAST`,
    [actorTmdbId]
  )

  return filmographyResult.rows.map((row) => ({
    showId: row.show_id,
    name: row.name,
    firstAirYear: row.first_air_year,
    lastAirYear: row.last_air_year,
    character: row.character_name,
    posterPath: row.poster_path,
    deceasedCount: row.deceased_count,
    castCount: row.cast_count,
    episodeCount: row.episode_count,
  }))
}
