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
import { createActorSlug } from "../slug-utils.js"

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

  // TMDB actor - upsert using ON CONFLICT on the partial unique index for tmdb_id
  const result = await db.query<{ id: number }>(
    `INSERT INTO actors (
       tmdb_id,
       name,
       birthday,
       deathday,
       cause_of_death,
       cause_of_death_source,
       cause_of_death_details,
       cause_of_death_details_source,
       wikipedia_url,
       profile_path,
       age_at_death,
       expected_lifespan,
       years_lost,
       popularity,
       violent_death,
       deathday_confidence,
       deathday_verification_source,
       deathday_verified_at,
       updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
       CURRENT_TIMESTAMP
     )
     ON CONFLICT (tmdb_id) WHERE tmdb_id IS NOT NULL
     DO UPDATE SET
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
       deathday_confidence = COALESCE(actors.deathday_confidence, EXCLUDED.deathday_confidence),
       deathday_verification_source = COALESCE(actors.deathday_verification_source, EXCLUDED.deathday_verification_source),
       deathday_verified_at = COALESCE(actors.deathday_verified_at, EXCLUDED.deathday_verified_at),
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
      actor.deathday_confidence ?? null,
      actor.deathday_verification_source ?? null,
      actor.deathday_verified_at ?? null,
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

      // Use ON CONFLICT to handle upsert atomically
      const result = await client.query<{ id: number }>(
        `INSERT INTO actors (
           tmdb_id,
           name,
           birthday,
           deathday,
           cause_of_death,
           cause_of_death_source,
           cause_of_death_details,
           cause_of_death_details_source,
           wikipedia_url,
           profile_path,
           age_at_death,
           expected_lifespan,
           years_lost,
           popularity,
           violent_death,
           deathday_confidence,
           deathday_verification_source,
           deathday_verified_at,
           updated_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
           CURRENT_TIMESTAMP
         )
         ON CONFLICT (tmdb_id) WHERE tmdb_id IS NOT NULL
         DO UPDATE SET
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
           deathday_confidence = COALESCE(actors.deathday_confidence, EXCLUDED.deathday_confidence),
           deathday_verification_source = COALESCE(actors.deathday_verification_source, EXCLUDED.deathday_verification_source),
           deathday_verified_at = COALESCE(actors.deathday_verified_at, EXCLUDED.deathday_verified_at),
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
          actor.deathday_confidence ?? null,
          actor.deathday_verification_source ?? null,
          actor.deathday_verified_at ?? null,
        ]
      )

      tmdbIdToActorId.set(actor.tmdb_id, result.rows[0].id)
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

/**
 * Look up actor by either internal id or tmdb_id with slug validation.
 *
 * CRITICAL: With 99,003 overlapping IDs (18% of database), slug validation is MANDATORY.
 * Simply preferring id over tmdb_id would return the wrong actor 18% of the time.
 *
 * @param id - Numeric ID from URL (could be actor.id OR actor.tmdb_id)
 * @param slugFromUrl - Full slug from URL (e.g., "john-wayne-4165")
 * @returns Actor record and which field matched, or null if not found
 */
export async function getActorByEitherIdWithSlug(
  id: number,
  slugFromUrl: string
): Promise<{ actor: ActorRecord; matchedBy: "id" | "tmdb_id" } | null> {
  const db = getPool()

  // Query for actors where EITHER id or tmdb_id matches
  const result = await db.query<ActorRecord>(
    `SELECT * FROM actors WHERE id = $1 OR tmdb_id = $1 LIMIT 2`,
    [id]
  )

  if (result.rows.length === 0) {
    return null
  }

  if (result.rows.length === 1) {
    // Unambiguous match - only one actor has this ID
    const actor = result.rows[0]
    const matchedBy = actor.id === id ? "id" : "tmdb_id"

    // Still validate slug to catch name changes or bad URLs
    const expectedSlug = createActorSlug(actor.name, id)
    if (!slugMatches(slugFromUrl, expectedSlug)) {
      console.warn("[SLUG MISMATCH] Single match but slug invalid", {
        id,
        slugFromUrl,
        expectedSlug,
        actorName: actor.name,
      })
      return null // Treat as not found
    }

    return { actor, matchedBy }
  }

  // OVERLAP CASE: Two actors matched (99,003 cases like this exist!)
  // One matched by actor.id, one by actor.tmdb_id
  // MUST validate slug to determine which actor was intended

  const actorByInternalId = result.rows.find((a) => a.id === id)
  const actorByTmdbId = result.rows.find((a) => a.tmdb_id === id)

  // Validate slug against both actors
  const slugMatchesInternalId =
    actorByInternalId && slugMatches(slugFromUrl, createActorSlug(actorByInternalId.name, id))

  const slugMatchesTmdbId =
    actorByTmdbId && slugMatches(slugFromUrl, createActorSlug(actorByTmdbId.name, id))

  if (slugMatchesInternalId && !slugMatchesTmdbId) {
    // Slug matches the actor.id actor
    return { actor: actorByInternalId!, matchedBy: "id" }
  }

  if (slugMatchesTmdbId && !slugMatchesInternalId) {
    // Slug matches the actor.tmdb_id actor (legacy URL)
    return { actor: actorByTmdbId!, matchedBy: "tmdb_id" }
  }

  // AMBIGUOUS: Either both match or neither match
  // Log for investigation and return null
  console.error("[OVERLAP AMBIGUOUS] Cannot determine correct actor from slug", {
    id,
    slugFromUrl,
    actorByIdName: actorByInternalId?.name,
    actorByTmdbIdName: actorByTmdbId?.name,
    slugMatchesInternalId,
    slugMatchesTmdbId,
  })

  return null
}

/**
 * Check if URL slug matches expected slug (fuzzy match on name portion).
 * Allows for minor differences due to special character handling.
 */
function slugMatches(urlSlug: string, expectedSlug: string): boolean {
  // Extract name portion (everything before last hyphen)
  const urlName = urlSlug.substring(0, urlSlug.lastIndexOf("-"))
  const expectedName = expectedSlug.substring(0, expectedSlug.lastIndexOf("-"))

  // Normalize and compare (case-insensitive, handle apostrophes, etc.)
  return urlName.toLowerCase() === expectedName.toLowerCase()
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

// ============================================================================
// Enrichment query functions
// ============================================================================

/**
 * Return type for actors needing death detail enrichment.
 * Matches the fields expected by the enrich-death-details script.
 */
export interface ActorForEnrichmentQuery {
  id: number
  tmdb_id: number | null
  name: string
  birthday: Date | string | null
  deathday: Date | string
  cause_of_death: string | null
  cause_of_death_details: string | null
  popularity: number | null
  circumstances: string | null
  notable_factors: string[] | null
  /** Movie title (only populated when using top-billed-year query) */
  movie_title?: string
}

/**
 * Get deceased actors from top-billed roles in the most popular US movies from a specific year.
 * Used by the death enrichment script to target high-profile actors.
 *
 * @param options.year - The movie release year to filter by
 * @param options.maxBilling - Maximum billing position (default: 5, top 5 billed)
 * @param options.topMoviesCount - Number of top movies to consider (default: 20)
 * @param options.limit - Maximum number of actors to return
 */
export async function getDeceasedActorsFromTopMovies(options: {
  year: number
  maxBilling?: number
  topMoviesCount?: number
  limit?: number
}): Promise<ActorForEnrichmentQuery[]> {
  const { year, maxBilling = 5, topMoviesCount = 20, limit = 100 } = options
  const db = getPool()

  // Use CTEs to:
  // 1. Identify the top N movies by popularity for the year
  // 2. Find deceased actors who were top-billed in those movies (deduplicated)
  // 3. Order final results by actor popularity
  const result = await db.query<ActorForEnrichmentQuery>(
    `WITH top_movies AS (
      SELECT tmdb_id, title, popularity AS movie_popularity
      FROM movies
      WHERE release_year = $1
        AND (original_language = 'en' OR 'US' = ANY(production_countries))
      ORDER BY popularity DESC NULLS LAST
      LIMIT $2
    ),
    unique_actors AS (
      SELECT DISTINCT ON (a.id)
        a.id,
        a.tmdb_id,
        a.name,
        a.birthday,
        a.deathday,
        a.cause_of_death,
        a.cause_of_death_details,
        a.popularity,
        c.circumstances,
        c.notable_factors,
        tm.title AS movie_title
      FROM actors a
      JOIN actor_movie_appearances ama ON ama.actor_id = a.id
      JOIN top_movies tm ON tm.tmdb_id = ama.movie_tmdb_id
      LEFT JOIN actor_death_circumstances c ON c.actor_id = a.id
      WHERE a.deathday IS NOT NULL
        AND a.cause_of_death IS NOT NULL
        AND ama.billing_order <= $3
        AND (c.circumstances IS NULL
             OR c.notable_factors IS NULL
             OR array_length(c.notable_factors, 1) IS NULL)
      ORDER BY a.id, tm.movie_popularity DESC, ama.billing_order ASC
    )
    SELECT * FROM unique_actors
    ORDER BY popularity DESC NULLS LAST
    LIMIT $4`,
    [year, topMoviesCount, maxBilling, limit]
  )

  return result.rows
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
