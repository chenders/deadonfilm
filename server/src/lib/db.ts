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
    `INSERT INTO deceased_persons (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       birthday = EXCLUDED.birthday,
       deathday = EXCLUDED.deathday,
       cause_of_death = COALESCE(deceased_persons.cause_of_death, EXCLUDED.cause_of_death),
       cause_of_death_source = COALESCE(deceased_persons.cause_of_death_source, EXCLUDED.cause_of_death_source),
       cause_of_death_details = COALESCE(deceased_persons.cause_of_death_details, EXCLUDED.cause_of_death_details),
       cause_of_death_details_source = COALESCE(deceased_persons.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
       wikipedia_url = COALESCE(deceased_persons.wikipedia_url, EXCLUDED.wikipedia_url),
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
        `INSERT INTO deceased_persons (tmdb_id, name, birthday, deathday, cause_of_death, cause_of_death_source, cause_of_death_details, cause_of_death_details_source, wikipedia_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
         ON CONFLICT (tmdb_id) DO UPDATE SET
           name = EXCLUDED.name,
           birthday = EXCLUDED.birthday,
           deathday = EXCLUDED.deathday,
           cause_of_death = COALESCE(deceased_persons.cause_of_death, EXCLUDED.cause_of_death),
           cause_of_death_source = COALESCE(deceased_persons.cause_of_death_source, EXCLUDED.cause_of_death_source),
           cause_of_death_details = COALESCE(deceased_persons.cause_of_death_details, EXCLUDED.cause_of_death_details),
           cause_of_death_details_source = COALESCE(deceased_persons.cause_of_death_details_source, EXCLUDED.cause_of_death_details_source),
           wikipedia_url = COALESCE(deceased_persons.wikipedia_url, EXCLUDED.wikipedia_url),
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
export async function getDeceasedByMonthDay(
  month: number,
  day: number
): Promise<DeceasedPersonRecord[]> {
  const db = getPool()
  const result = await db.query<DeceasedPersonRecord>(
    `SELECT * FROM deceased_persons
     WHERE EXTRACT(MONTH FROM deathday) = $1
       AND EXTRACT(DAY FROM deathday) = $2
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

// Get movies with high mortality surprise scores
export async function getHighMortalityMovies(limit: number = 20): Promise<MovieRecord[]> {
  const db = getPool()
  const result = await db.query<MovieRecord>(
    `SELECT * FROM movies
     WHERE mortality_surprise_score IS NOT NULL
     ORDER BY mortality_surprise_score DESC
     LIMIT $1`,
    [limit]
  )
  return result.rows
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

// Get "cursed actors" - living actors with high co-star mortality
// Ranks actors by total excess deaths (actual - expected) across their filmography
export async function getCursedActors(limit: number = 20): Promise<
  Array<{
    actor_tmdb_id: number
    actor_name: string
    total_movies: number
    total_actual_deaths: number
    total_expected_deaths: number
    curse_score: number
  }>
> {
  const db = getPool()
  const result = await db.query(
    `SELECT
       aa.actor_tmdb_id,
       aa.actor_name,
       COUNT(DISTINCT aa.movie_tmdb_id) as total_movies,
       SUM(m.deceased_count)::integer as total_actual_deaths,
       ROUND(SUM(m.expected_deaths)::numeric, 1) as total_expected_deaths,
       ROUND((SUM(m.deceased_count) - SUM(m.expected_deaths))::numeric, 1) as curse_score
     FROM actor_appearances aa
     JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
     WHERE aa.is_deceased = false
       AND m.expected_deaths IS NOT NULL
     GROUP BY aa.actor_tmdb_id, aa.actor_name
     HAVING COUNT(DISTINCT aa.movie_tmdb_id) >= 3
     ORDER BY curse_score DESC
     LIMIT $1`,
    [limit]
  )
  return result.rows
}
