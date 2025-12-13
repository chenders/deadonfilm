import pg from "pg"

const { Pool } = pg

let pool: pg.Pool | null = null

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set")
    }
    pool = new Pool({ connectionString })
  }
  return pool
}

export async function initDatabase(): Promise<void> {
  const db = getPool()

  // Create tables if they don't exist
  await db.query(`
    CREATE TABLE IF NOT EXISTS deceased_persons (
      tmdb_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      birthday DATE,
      deathday DATE NOT NULL,
      cause_of_death TEXT,
      wikipedia_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Index for faster lookups
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_deceased_persons_tmdb_id
    ON deceased_persons(tmdb_id)
  `)

  console.log("Database initialized")
}

export type DeathInfoSource = "claude" | "wikipedia" | null

export interface DeceasedPersonRecord {
  tmdb_id: number
  name: string
  birthday: string | null
  deathday: string
  cause_of_death: string | null
  cause_of_death_source: DeathInfoSource
  cause_of_death_details: string | null
  cause_of_death_details_source: DeathInfoSource
  wikipedia_url: string | null
  profile_path: string | null
  age_at_death: number | null
  expected_lifespan: number | null
  years_lost: number | null
}

// Get a deceased person by TMDB ID
export async function getDeceasedPerson(tmdbId: number): Promise<DeceasedPersonRecord | null> {
  const db = getPool()
  const result = await db.query<DeceasedPersonRecord>(
    "SELECT * FROM deceased_persons WHERE tmdb_id = $1",
    [tmdbId]
  )
  return result.rows[0] || null
}

// Get multiple deceased persons by TMDB IDs
export async function getDeceasedPersons(
  tmdbIds: number[]
): Promise<Map<number, DeceasedPersonRecord>> {
  if (tmdbIds.length === 0) return new Map()

  const db = getPool()
  const placeholders = tmdbIds.map((_, i) => `$${i + 1}`).join(", ")
  const result = await db.query<DeceasedPersonRecord>(
    `SELECT * FROM deceased_persons WHERE tmdb_id IN (${placeholders})`,
    tmdbIds
  )

  const map = new Map<number, DeceasedPersonRecord>()
  for (const row of result.rows) {
    map.set(row.tmdb_id, row)
  }
  return map
}

// Insert or update a deceased person
// Note: COALESCE prioritizes existing values over new values to preserve first-found data.
// This is intentional - once we have death info, we don't overwrite it with potentially
// different/conflicting data from later lookups.
export async function upsertDeceasedPerson(person: DeceasedPersonRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO deceased_persons (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, profile_path, age_at_death, expected_lifespan, years_lost, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       birthday = EXCLUDED.birthday,
       deathday = EXCLUDED.deathday,
       cause_of_death = COALESCE(deceased_persons.cause_of_death, EXCLUDED.cause_of_death),
       cause_of_death_source = COALESCE(deceased_persons.cause_of_death_source, EXCLUDED.cause_of_death_source),
       cause_of_death_details = COALESCE(deceased_persons.cause_of_death_details, EXCLUDED.cause_of_death_details),
       cause_of_death_details_source = COALESCE(deceased_persons.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
       wikipedia_url = COALESCE(deceased_persons.wikipedia_url, EXCLUDED.wikipedia_url),
       profile_path = COALESCE(deceased_persons.profile_path, EXCLUDED.profile_path),
       age_at_death = COALESCE(deceased_persons.age_at_death, EXCLUDED.age_at_death),
       expected_lifespan = COALESCE(deceased_persons.expected_lifespan, EXCLUDED.expected_lifespan),
       years_lost = COALESCE(deceased_persons.years_lost, EXCLUDED.years_lost),
       updated_at = CURRENT_TIMESTAMP`,
    [
      person.tmdb_id,
      person.name,
      person.birthday,
      person.deathday,
      person.cause_of_death,
      person.cause_of_death_source,
      person.cause_of_death_details,
      person.cause_of_death_details_source,
      person.wikipedia_url,
      person.profile_path,
      person.age_at_death,
      person.expected_lifespan,
      person.years_lost,
    ]
  )
}

// Batch insert/update deceased persons
export async function batchUpsertDeceasedPersons(persons: DeceasedPersonRecord[]): Promise<void> {
  if (persons.length === 0) return

  const db = getPool()

  // Use a transaction for batch insert
  const client = await db.connect()
  try {
    await client.query("BEGIN")

    for (const person of persons) {
      await client.query(
        `INSERT INTO deceased_persons (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, profile_path, age_at_death, expected_lifespan, years_lost, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
         ON CONFLICT (tmdb_id) DO UPDATE SET
           name = EXCLUDED.name,
           birthday = EXCLUDED.birthday,
           deathday = EXCLUDED.deathday,
           cause_of_death = COALESCE(deceased_persons.cause_of_death, EXCLUDED.cause_of_death),
           cause_of_death_source = COALESCE(deceased_persons.cause_of_death_source, EXCLUDED.cause_of_death_source),
           cause_of_death_details = COALESCE(deceased_persons.cause_of_death_details, EXCLUDED.cause_of_death_details),
           cause_of_death_details_source = COALESCE(deceased_persons.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
           wikipedia_url = COALESCE(deceased_persons.wikipedia_url, EXCLUDED.wikipedia_url),
           profile_path = COALESCE(deceased_persons.profile_path, EXCLUDED.profile_path),
           age_at_death = COALESCE(deceased_persons.age_at_death, EXCLUDED.age_at_death),
           expected_lifespan = COALESCE(deceased_persons.expected_lifespan, EXCLUDED.expected_lifespan),
           years_lost = COALESCE(deceased_persons.years_lost, EXCLUDED.years_lost),
           updated_at = CURRENT_TIMESTAMP`,
        [
          person.tmdb_id,
          person.name,
          person.birthday,
          person.deathday,
          person.cause_of_death,
          person.cause_of_death_source,
          person.cause_of_death_details,
          person.cause_of_death_details_source,
          person.wikipedia_url,
          person.profile_path,
          person.age_at_death,
          person.expected_lifespan,
          person.years_lost,
        ]
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Update just the cause of death and wikipedia URL for an existing person
// Note: COALESCE prioritizes existing values - see comment on upsertDeceasedPerson
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
    `UPDATE deceased_persons
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

// Get deceased persons who died on a specific month/day (for "On This Day" feature)
// Only returns actors with a profile photo
export async function getDeceasedByMonthDay(
  month: number,
  day: number
): Promise<DeceasedPersonRecord[]> {
  const db = getPool()
  const result = await db.query<DeceasedPersonRecord>(
    `SELECT * FROM deceased_persons
     WHERE EXTRACT(MONTH FROM deathday) = $1
       AND EXTRACT(DAY FROM deathday) = $2
       AND profile_path IS NOT NULL
     ORDER BY deathday DESC`,
    [month, day]
  )
  return result.rows
}

// ============================================================================
// Movies table functions
// ============================================================================

export interface MovieRecord {
  tmdb_id: number
  title: string
  release_date: string | null
  release_year: number | null
  poster_path: string | null
  genres: string[]
  popularity: number | null
  vote_average: number | null
  cast_count: number | null
  deceased_count: number | null
  living_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get a movie by TMDB ID
export async function getMovie(tmdbId: number): Promise<MovieRecord | null> {
  const db = getPool()
  const result = await db.query<MovieRecord>("SELECT * FROM movies WHERE tmdb_id = $1", [tmdbId])
  return result.rows[0] || null
}

// Insert or update a movie
export async function upsertMovie(movie: MovieRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO movies (tmdb_id, title, release_date, release_year, poster_path, genres, popularity, vote_average, cast_count, deceased_count, living_count, expected_deaths, mortality_surprise_score, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       title = EXCLUDED.title,
       release_date = EXCLUDED.release_date,
       release_year = EXCLUDED.release_year,
       poster_path = EXCLUDED.poster_path,
       genres = EXCLUDED.genres,
       popularity = EXCLUDED.popularity,
       vote_average = EXCLUDED.vote_average,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       living_count = EXCLUDED.living_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       updated_at = CURRENT_TIMESTAMP`,
    [
      movie.tmdb_id,
      movie.title,
      movie.release_date,
      movie.release_year,
      movie.poster_path,
      movie.genres,
      movie.popularity,
      movie.vote_average,
      movie.cast_count,
      movie.deceased_count,
      movie.living_count,
      movie.expected_deaths,
      movie.mortality_surprise_score,
    ]
  )
}

// Options for querying high mortality movies
export interface HighMortalityOptions {
  limit?: number
  offset?: number
  fromYear?: number // Start year (e.g., 1980)
  toYear?: number // End year (e.g., 1989)
  minDeadActors?: number
}

// Get movies with high mortality surprise scores
// Supports pagination and filtering by year range and minimum deaths
export async function getHighMortalityMovies(
  options: HighMortalityOptions = {}
): Promise<{ movies: MovieRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0, fromYear, toYear, minDeadActors = 3 } = options

  const db = getPool()
  const result = await db.query<MovieRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM movies
     WHERE mortality_surprise_score IS NOT NULL
       AND deceased_count >= $1
       AND ($2::integer IS NULL OR release_year >= $2)
       AND ($3::integer IS NULL OR release_year <= $3)
     ORDER BY mortality_surprise_score DESC
     LIMIT $4 OFFSET $5`,
    [minDeadActors, fromYear || null, toYear || null, limit, offset]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const movies = result.rows.map(({ total_count: _total_count, ...movie }) => movie as MovieRecord)

  return { movies, totalCount }
}

// Get the maximum min deaths value that still returns at least 5 movies
export async function getMaxValidMinDeaths(): Promise<number> {
  const db = getPool()

  // Find the highest threshold that still returns at least 5 movies
  // Optimized query: group by deceased_count directly instead of generating and joining
  const result = await db.query<{ max_threshold: number | null }>(`
    SELECT MAX(deceased_count) as max_threshold
    FROM (
      SELECT deceased_count, COUNT(*) as count
      FROM movies
      WHERE mortality_surprise_score IS NOT NULL
        AND deceased_count >= 3
      GROUP BY deceased_count
      HAVING COUNT(*) >= 5
    ) subq
  `)

  // Default to 3 if no valid thresholds found
  return result.rows[0]?.max_threshold ?? 3
}

// ============================================================================
// Actor appearances table functions
// ============================================================================

export interface ActorAppearanceRecord {
  actor_tmdb_id: number
  movie_tmdb_id: number
  actor_name: string
  character_name: string | null
  billing_order: number | null
  age_at_filming: number | null
  is_deceased: boolean
}

// Insert or update an actor appearance
export async function upsertActorAppearance(appearance: ActorAppearanceRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO actor_appearances (actor_tmdb_id, movie_tmdb_id, actor_name, character_name, billing_order, age_at_filming, is_deceased)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (actor_tmdb_id, movie_tmdb_id) DO UPDATE SET
       actor_name = EXCLUDED.actor_name,
       character_name = EXCLUDED.character_name,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming,
       is_deceased = EXCLUDED.is_deceased`,
    [
      appearance.actor_tmdb_id,
      appearance.movie_tmdb_id,
      appearance.actor_name,
      appearance.character_name,
      appearance.billing_order,
      appearance.age_at_filming,
      appearance.is_deceased,
    ]
  )
}

// Batch insert actor appearances
export async function batchUpsertActorAppearances(
  appearances: ActorAppearanceRecord[]
): Promise<void> {
  if (appearances.length === 0) return

  const db = getPool()
  const client = await db.connect()
  try {
    await client.query("BEGIN")

    for (const appearance of appearances) {
      await client.query(
        `INSERT INTO actor_appearances (actor_tmdb_id, movie_tmdb_id, actor_name, character_name, billing_order, age_at_filming, is_deceased)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (actor_tmdb_id, movie_tmdb_id) DO UPDATE SET
           actor_name = EXCLUDED.actor_name,
           character_name = EXCLUDED.character_name,
           billing_order = EXCLUDED.billing_order,
           age_at_filming = EXCLUDED.age_at_filming,
           is_deceased = EXCLUDED.is_deceased`,
        [
          appearance.actor_tmdb_id,
          appearance.movie_tmdb_id,
          appearance.actor_name,
          appearance.character_name,
          appearance.billing_order,
          appearance.age_at_filming,
          appearance.is_deceased,
        ]
      )
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// Get all movies an actor has appeared in
export async function getActorMovies(actorTmdbId: number): Promise<ActorAppearanceRecord[]> {
  const db = getPool()
  const result = await db.query<ActorAppearanceRecord>(
    `SELECT * FROM actor_appearances WHERE actor_tmdb_id = $1`,
    [actorTmdbId]
  )
  return result.rows
}

// Options for getCursedActors query
export interface CursedActorsOptions {
  limit?: number
  offset?: number
  minMovies?: number
  actorStatus?: "living" | "deceased" | "all"
  fromYear?: number
  toYear?: number
}

// Cursed actor record returned from database
export interface CursedActorRecord {
  actor_tmdb_id: number
  actor_name: string
  is_deceased: boolean
  total_movies: number
  total_actual_deaths: number
  total_expected_deaths: number
  curse_score: number
}

// Get "cursed actors" - actors with high co-star mortality
// Ranks actors by total excess deaths (actual - expected) across their filmography
export async function getCursedActors(options: CursedActorsOptions = {}): Promise<{
  actors: CursedActorRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0, minMovies = 2, actorStatus = "all", fromYear, toYear } = options

  const db = getPool()

  // Build dynamic WHERE clause
  const conditions: string[] = ["m.expected_deaths IS NOT NULL"]
  const params: (number | string)[] = []
  let paramIndex = 1

  // Actor status filter
  if (actorStatus === "living") {
    conditions.push(`aa.is_deceased = false`)
  } else if (actorStatus === "deceased") {
    conditions.push(`aa.is_deceased = true`)
  }
  // "all" means no filter on is_deceased

  // Year range filters
  if (fromYear !== undefined) {
    conditions.push(`m.release_year >= $${paramIndex}`)
    params.push(fromYear)
    paramIndex++
  }
  if (toYear !== undefined) {
    conditions.push(`m.release_year <= $${paramIndex}`)
    params.push(toYear)
    paramIndex++
  }

  const whereClause = conditions.join(" AND ")

  // Add pagination params
  params.push(minMovies) // for HAVING clause
  const minMoviesParamIndex = paramIndex++
  params.push(limit)
  const limitParamIndex = paramIndex++
  params.push(offset)
  const offsetParamIndex = paramIndex++

  const query = `
    SELECT
      aa.actor_tmdb_id,
      aa.actor_name,
      aa.is_deceased,
      COUNT(DISTINCT aa.movie_tmdb_id)::integer as total_movies,
      SUM(m.deceased_count)::integer as total_actual_deaths,
      ROUND(SUM(m.expected_deaths)::numeric, 1) as total_expected_deaths,
      ROUND((SUM(m.deceased_count) - SUM(m.expected_deaths))::numeric, 1) as curse_score,
      COUNT(*) OVER() as total_count
    FROM actor_appearances aa
    JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
    WHERE ${whereClause}
    GROUP BY aa.actor_tmdb_id, aa.actor_name, aa.is_deceased
    HAVING COUNT(DISTINCT aa.movie_tmdb_id) >= $${minMoviesParamIndex}
    ORDER BY curse_score DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `

  const result = await db.query(query, params)

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0

  // Remove the total_count field from each row
  const actors = result.rows.map(
    ({ total_count: _, ...actor }: { total_count: string } & CursedActorRecord) => actor
  )

  return { actors, totalCount }
}

// ============================================================================
// Site statistics functions
// ============================================================================

export interface SiteStats {
  totalDeceasedActors: number
  totalMoviesAnalyzed: number
  topCauseOfDeath: string | null
  avgMortalityPercentage: number | null
}

// Get aggregate site statistics for the homepage
export async function getSiteStats(): Promise<SiteStats> {
  const db = getPool()

  // Get counts and top cause of death in a single query
  const result = await db.query<{
    total_actors: string
    total_movies: string
    top_cause: string | null
    avg_mortality: string | null
  }>(`
    SELECT
      (SELECT COUNT(*) FROM deceased_persons) as total_actors,
      (SELECT COUNT(*) FROM movies WHERE mortality_surprise_score IS NOT NULL) as total_movies,
      (SELECT cause_of_death FROM deceased_persons
       WHERE cause_of_death IS NOT NULL
       GROUP BY cause_of_death
       ORDER BY COUNT(*) DESC
       LIMIT 1) as top_cause,
      (SELECT ROUND(AVG(
        CASE WHEN cast_count > 0
          THEN (deceased_count::numeric / cast_count) * 100
          ELSE NULL
        END
      ), 1) FROM movies WHERE cast_count > 0) as avg_mortality
  `)

  const row = result.rows[0]
  return {
    totalDeceasedActors: parseInt(row.total_actors, 10) || 0,
    totalMoviesAnalyzed: parseInt(row.total_movies, 10) || 0,
    topCauseOfDeath: row.top_cause,
    avgMortalityPercentage: row.avg_mortality ? parseFloat(row.avg_mortality) : null,
  }
}

// ============================================================================
// Sync state functions for TMDB Changes API synchronization
// ============================================================================

export interface SyncStateRecord {
  sync_type: string
  last_sync_date: string // YYYY-MM-DD
  last_run_at: Date
  items_processed: number
  new_deaths_found: number
  movies_updated: number
  errors_count: number
}

/**
 * Get sync state for a given sync type.
 * @param syncType - The sync type identifier (e.g., 'person_changes', 'movie_changes')
 * @returns The sync state record, or null if no sync has been run for this type
 */
export async function getSyncState(syncType: string): Promise<SyncStateRecord | null> {
  const db = getPool()
  const result = await db.query<SyncStateRecord>(
    `SELECT sync_type, last_sync_date::text, last_run_at, items_processed, new_deaths_found, movies_updated, errors_count
     FROM sync_state WHERE sync_type = $1`,
    [syncType]
  )
  return result.rows[0] || null
}

/**
 * Update or insert sync state. Uses COALESCE to preserve existing values
 * when fields are not provided (null/undefined).
 * @param state - Partial sync state with required sync_type. Omit fields to preserve existing DB values.
 */
export async function updateSyncState(
  state: Partial<SyncStateRecord> & { sync_type: string }
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO sync_state (sync_type, last_sync_date, last_run_at, items_processed, new_deaths_found, movies_updated, errors_count)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6)
     ON CONFLICT (sync_type) DO UPDATE SET
       last_sync_date = COALESCE($2, sync_state.last_sync_date),
       last_run_at = NOW(),
       items_processed = COALESCE($3, sync_state.items_processed),
       new_deaths_found = COALESCE($4, sync_state.new_deaths_found),
       movies_updated = COALESCE($5, sync_state.movies_updated),
       errors_count = COALESCE($6, sync_state.errors_count)`,
    [
      state.sync_type,
      state.last_sync_date || null,
      state.items_processed ?? null,
      state.new_deaths_found ?? null,
      state.movies_updated ?? null,
      state.errors_count ?? null,
    ]
  )
}

// Get all unique actor TMDB IDs from actor_appearances
export async function getAllActorTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ actor_tmdb_id: number }>(
    `SELECT DISTINCT actor_tmdb_id FROM actor_appearances`
  )
  return new Set(result.rows.map((r) => r.actor_tmdb_id))
}

// Get all TMDB IDs of deceased persons in our database
export async function getDeceasedTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(`SELECT tmdb_id FROM deceased_persons`)
  return new Set(result.rows.map((r) => r.tmdb_id))
}

// Get all movie TMDB IDs from movies table
export async function getAllMovieTmdbIds(): Promise<Set<number>> {
  const db = getPool()
  const result = await db.query<{ tmdb_id: number }>(`SELECT tmdb_id FROM movies`)
  return new Set(result.rows.map((r) => r.tmdb_id))
}

// Mark actors as deceased in actor_appearances table
export async function markActorsDeceased(actorTmdbIds: number[]): Promise<void> {
  if (actorTmdbIds.length === 0) return

  const db = getPool()
  // Batch size of 1000 is well under PostgreSQL's 65535 parameter limit.
  // This conservative value balances performance with memory usage and transaction timeouts.
  const BATCH_SIZE = 1000

  for (let i = 0; i < actorTmdbIds.length; i += BATCH_SIZE) {
    const batch = actorTmdbIds.slice(i, i + BATCH_SIZE)
    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(", ")
    await db.query(
      `UPDATE actor_appearances SET is_deceased = true WHERE actor_tmdb_id IN (${placeholders})`,
      batch
    )
  }
}

// Get recently deceased actors for homepage display (ordered by death date)
export async function getRecentDeaths(limit: number = 5): Promise<
  Array<{
    tmdb_id: number
    name: string
    deathday: string
    cause_of_death: string | null
    profile_path: string | null
  }>
> {
  const db = getPool()
  const result = await db.query(
    `SELECT tmdb_id, name, deathday, cause_of_death, profile_path
     FROM deceased_persons
     ORDER BY deathday DESC
     LIMIT $1`,
    [limit]
  )
  return result.rows
}

// ============================================================================
// Forever Young feature - movies with leading actors who died young
// ============================================================================

export interface ForeverYoungMovie {
  tmdb_id: number
  title: string
  release_date: string | null
  actor_name: string
  years_lost: number
}

// Get movies featuring leading actors (top 3 billing) who died abnormally young
// Returns movies ordered by years lost, for random selection
export async function getForeverYoungMovies(limit: number = 100): Promise<ForeverYoungMovie[]> {
  const db = getPool()
  // Find movies where a leading actor died with 40%+ of their expected lifespan still ahead
  // i.e., years_lost > expected_lifespan * 0.40
  const result = await db.query<ForeverYoungMovie>(
    `SELECT DISTINCT ON (m.tmdb_id)
       m.tmdb_id,
       m.title,
       m.release_date,
       dp.name as actor_name,
       dp.years_lost
     FROM actor_appearances aa
     JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
     JOIN deceased_persons dp ON aa.actor_tmdb_id = dp.tmdb_id
     WHERE aa.billing_order <= 3
       AND dp.years_lost > dp.expected_lifespan * 0.40
     ORDER BY m.tmdb_id, dp.years_lost DESC`,
    []
  )

  // Sort by years_lost and limit after deduplication
  return result.rows.sort((a, b) => b.years_lost - a.years_lost).slice(0, limit)
}

// ============================================================================
// Actor profile functions
// ============================================================================

export interface ActorFilmographyMovie {
  movieId: number
  title: string
  releaseYear: number | null
  character: string | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
}

// Get actor's filmography from our database
export async function getActorFilmography(actorTmdbId: number): Promise<ActorFilmographyMovie[]> {
  const db = getPool()

  const filmographyResult = await db.query<{
    movie_id: number
    title: string
    release_year: number | null
    character_name: string | null
    poster_path: string | null
    deceased_count: number
    cast_count: number
  }>(
    `SELECT
       m.tmdb_id as movie_id,
       m.title,
       m.release_year,
       aa.character_name,
       m.poster_path,
       m.deceased_count,
       m.cast_count
     FROM actor_appearances aa
     JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
     WHERE aa.actor_tmdb_id = $1
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
