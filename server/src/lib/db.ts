import pg from "pg"

const { Pool } = pg

let pool: pg.Pool | null = null

/**
 * Creates a new database pool with connection recovery settings.
 * Configures idle timeout, connection timeout, and error handling
 * to gracefully recover from connection terminations (common with
 * serverless databases like Neon).
 */
function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set")
  }

  const newPool = new Pool({
    connectionString,
    // Connection pool settings for resilience
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Fail connection attempts after 10 seconds
  })

  // Handle pool-level errors (e.g., unexpected disconnections)
  // This prevents unhandled errors from crashing the process
  newPool.on("error", (err: Error) => {
    console.error("Unexpected database pool error:", err.message)
    // Don't exit - let the pool recover naturally
    // The pool will create new connections as needed
  })

  return newPool
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = createPool()
  }
  return pool
}

/**
 * Reset the pool connection. Call this if you need to force
 * reconnection after a catastrophic failure.
 */
export async function resetPool(): Promise<void> {
  if (pool) {
    try {
      await pool.end()
    } catch (err) {
      console.error("Error closing pool:", err)
    }
    pool = null
  }
}

/**
 * Check if an error is a connection-related error that should be retried.
 */
function isConnectionError(err: unknown): boolean {
  if (err instanceof Error) {
    const message = err.message.toLowerCase()
    return (
      message.includes("connection terminated") ||
      message.includes("connection refused") ||
      message.includes("connection reset") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("etimedout") ||
      message.includes("socket hang up") ||
      message.includes("network error")
    )
  }
  return false
}

/**
 * Execute a query with automatic retry on connection errors.
 * Retries up to 3 times with exponential backoff (100ms, 200ms, 400ms).
 */
export async function queryWithRetry<T>(
  queryFn: (pool: pg.Pool) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const db = getPool()
      return await queryFn(db)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (isConnectionError(err) && attempt < maxRetries - 1) {
        // Exponential backoff: 100ms, 200ms, 400ms
        const delay = 100 * Math.pow(2, attempt)
        console.warn(
          `Database connection error (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms:`,
          lastError.message
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      throw lastError
    }
  }

  // This shouldn't be reached, but TypeScript needs it
  throw lastError ?? new Error("Query failed after retries")
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
  original_language: string | null
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
    `INSERT INTO movies (tmdb_id, title, release_date, release_year, poster_path, genres, original_language, popularity, vote_average, cast_count, deceased_count, living_count, expected_deaths, mortality_surprise_score, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       title = EXCLUDED.title,
       release_date = EXCLUDED.release_date,
       release_year = EXCLUDED.release_year,
       poster_path = EXCLUDED.poster_path,
       genres = EXCLUDED.genres,
       original_language = COALESCE(EXCLUDED.original_language, movies.original_language),
       popularity = COALESCE(EXCLUDED.popularity, movies.popularity),
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
      movie.original_language,
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
  includeObscure?: boolean // Include obscure/unknown movies (default: false)
}

// Get movies with high mortality surprise scores
// Supports pagination and filtering by year range, minimum deaths, and obscurity
export async function getHighMortalityMovies(
  options: HighMortalityOptions = {}
): Promise<{ movies: MovieRecord[]; totalCount: number }> {
  const {
    limit = 50,
    offset = 0,
    fromYear,
    toYear,
    minDeadActors = 3,
    includeObscure = false,
  } = options

  const db = getPool()
  const result = await db.query<MovieRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM movies
     WHERE mortality_surprise_score IS NOT NULL
       AND deceased_count >= $1
       AND ($2::integer IS NULL OR release_year >= $2)
       AND ($3::integer IS NULL OR release_year <= $3)
       AND (
         $6::boolean = true
         OR NOT (
           poster_path IS NULL
           OR (original_language = 'en' AND COALESCE(popularity, 0) < 5.0 AND cast_count IS NOT NULL AND cast_count < 5)
           OR (original_language IS NOT NULL AND original_language != 'en' AND COALESCE(popularity, 0) < 20.0)
         )
       )
     ORDER BY mortality_surprise_score DESC
     LIMIT $4 OFFSET $5`,
    [minDeadActors, fromYear || null, toYear || null, limit, offset, includeObscure]
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

// Get the single most cursed movie (highest mortality surprise score)
export interface FeaturedMovieRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  expected_deaths: number
  mortality_surprise_score: number
}

export async function getMostCursedMovie(): Promise<FeaturedMovieRecord | null> {
  const db = getPool()

  const result = await db.query<FeaturedMovieRecord>(
    `SELECT tmdb_id, title, release_year, poster_path,
            deceased_count, cast_count, expected_deaths, mortality_surprise_score
     FROM movies
     WHERE mortality_surprise_score IS NOT NULL
       AND poster_path IS NOT NULL
       AND deceased_count >= 3
     ORDER BY mortality_surprise_score DESC
     LIMIT 1`
  )

  return result.rows[0] || null
}

// Get interesting trivia facts from the database
export interface TriviaFact {
  type: string
  title: string
  value: string
  link?: string // Optional link to related page
}

export async function getTrivia(): Promise<TriviaFact[]> {
  const db = getPool()

  const facts: TriviaFact[] = []

  // Get oldest actor who died
  const oldestResult = await db.query<{
    name: string
    tmdb_id: number
    age_at_death: number
  }>(`
    SELECT name, tmdb_id, age_at_death
    FROM deceased_persons
    WHERE age_at_death IS NOT NULL
    ORDER BY age_at_death DESC
    LIMIT 1
  `)
  if (oldestResult.rows[0]) {
    const { name, tmdb_id, age_at_death } = oldestResult.rows[0]
    facts.push({
      type: "oldest",
      title: "Oldest at Death",
      value: `${name} lived to ${age_at_death} years old`,
      link: `/actor/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${tmdb_id}`,
    })
  }

  // Get youngest actor who died (excluding infants/children - age > 15)
  const youngestResult = await db.query<{
    name: string
    tmdb_id: number
    age_at_death: number
  }>(`
    SELECT name, tmdb_id, age_at_death
    FROM deceased_persons
    WHERE age_at_death IS NOT NULL AND age_at_death > 15
    ORDER BY age_at_death ASC
    LIMIT 1
  `)
  if (youngestResult.rows[0]) {
    const { name, tmdb_id, age_at_death } = youngestResult.rows[0]
    facts.push({
      type: "youngest",
      title: "Youngest at Death",
      value: `${name} died at just ${age_at_death} years old`,
      link: `/actor/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${tmdb_id}`,
    })
  }

  // Get total years lost across all actors
  const yearsLostResult = await db.query<{ total_years_lost: string }>(`
    SELECT ROUND(SUM(years_lost)) as total_years_lost
    FROM deceased_persons
    WHERE years_lost > 0
  `)
  if (yearsLostResult.rows[0]?.total_years_lost) {
    const totalYears = parseInt(yearsLostResult.rows[0].total_years_lost, 10)
    facts.push({
      type: "years_lost",
      title: "Total Years Lost",
      value: `${totalYears.toLocaleString()} years of life lost to early deaths`,
    })
  }

  // Get movie with highest mortality percentage
  const highestMortalityResult = await db.query<{
    title: string
    tmdb_id: number
    release_year: number
    deceased_count: number
    cast_count: number
  }>(`
    SELECT title, tmdb_id, release_year, deceased_count, cast_count
    FROM movies
    WHERE cast_count >= 5 AND deceased_count > 0 AND poster_path IS NOT NULL
    ORDER BY (deceased_count::float / cast_count) DESC
    LIMIT 1
  `)
  if (highestMortalityResult.rows[0]) {
    const { title, tmdb_id, release_year, deceased_count, cast_count } =
      highestMortalityResult.rows[0]
    const percentage = Math.round((deceased_count / cast_count) * 100)
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${release_year || "unknown"}-${tmdb_id}`
    facts.push({
      type: "highest_mortality",
      title: "Highest Mortality Rate",
      value: `${title} (${release_year}): ${percentage}% of cast deceased`,
      link: `/movie/${slug}`,
    })
  }

  // Get most common decade of death
  const decadeResult = await db.query<{ decade: number; count: string }>(`
    SELECT (EXTRACT(YEAR FROM deathday)::int / 10 * 10) as decade,
           COUNT(*) as count
    FROM deceased_persons
    WHERE deathday IS NOT NULL
    GROUP BY decade
    ORDER BY count DESC
    LIMIT 1
  `)
  if (decadeResult.rows[0]) {
    const decade = decadeResult.rows[0].decade
    const count = parseInt(decadeResult.rows[0].count, 10)
    facts.push({
      type: "common_decade",
      title: "Deadliest Decade",
      value: `${count.toLocaleString()} actors died in the ${decade}s`,
    })
  }

  // Get actor who lost the most years
  const mostYearsLostResult = await db.query<{
    name: string
    tmdb_id: number
    years_lost: number
    age_at_death: number
  }>(`
    SELECT name, tmdb_id, ROUND(years_lost) as years_lost, age_at_death
    FROM deceased_persons
    WHERE years_lost > 0
    ORDER BY years_lost DESC
    LIMIT 1
  `)
  if (mostYearsLostResult.rows[0]) {
    const { name, tmdb_id, years_lost, age_at_death } = mostYearsLostResult.rows[0]
    facts.push({
      type: "most_years_lost",
      title: "Most Potential Lost",
      value: `${name} died at ${age_at_death}, losing ${years_lost} expected years`,
      link: `/actor/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${tmdb_id}`,
    })
  }

  return facts
}

// Get deaths that occurred during this calendar week (any year)
export interface ThisWeekDeathRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string | null
  age_at_death: number | null
  year_of_death: number
}

export async function getDeathsThisWeek(): Promise<ThisWeekDeathRecord[]> {
  const db = getPool()

  // Get current week's start (Sunday) and end (Saturday)
  // Using ISO week would be Monday-Sunday, but we'll use the more common US week
  const result = await db.query<ThisWeekDeathRecord>(`
    SELECT tmdb_id, name, deathday::text, profile_path, cause_of_death, age_at_death,
           EXTRACT(YEAR FROM deathday)::int as year_of_death
    FROM deceased_persons
    WHERE deathday IS NOT NULL
      AND (EXTRACT(WEEK FROM deathday), EXTRACT(DOW FROM deathday))
          BETWEEN
          (EXTRACT(WEEK FROM CURRENT_DATE) - 1, 0)
          AND
          (EXTRACT(WEEK FROM CURRENT_DATE), 6)
      OR (
        -- Handle same-week matching for any year
        EXTRACT(MONTH FROM deathday) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY FROM deathday) BETWEEN
            EXTRACT(DAY FROM date_trunc('week', CURRENT_DATE))
            AND EXTRACT(DAY FROM date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')
      )
    ORDER BY
      EXTRACT(MONTH FROM deathday),
      EXTRACT(DAY FROM deathday),
      year_of_death DESC
    LIMIT 20
  `)

  return result.rows
}

// Get popular movies based on TMDB popularity scores
export interface PopularMovieRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  popularity: number
}

export async function getPopularMovies(limit: number = 10): Promise<PopularMovieRecord[]> {
  const db = getPool()

  const result = await db.query<PopularMovieRecord>(
    `SELECT tmdb_id, title, release_year, poster_path, deceased_count, cast_count, popularity
     FROM movies
     WHERE poster_path IS NOT NULL
       AND deceased_count > 0
       AND cast_count >= 3
     ORDER BY popularity DESC
     LIMIT $1`,
    [limit]
  )

  return result.rows
}

// Simpler approach: Get deaths that occurred on the same day of week range
export async function getDeathsThisWeekSimple(): Promise<ThisWeekDeathRecord[]> {
  const db = getPool()

  // Get the day of year range for the current week
  const result = await db.query<ThisWeekDeathRecord>(`
    WITH week_range AS (
      SELECT
        date_trunc('week', CURRENT_DATE)::date as week_start,
        (date_trunc('week', CURRENT_DATE) + INTERVAL '6 days')::date as week_end
    )
    SELECT
      dp.tmdb_id,
      dp.name,
      dp.deathday::text,
      dp.profile_path,
      dp.cause_of_death,
      dp.age_at_death,
      EXTRACT(YEAR FROM dp.deathday)::int as year_of_death
    FROM deceased_persons dp, week_range wr
    WHERE dp.deathday IS NOT NULL
      AND (
        -- Match month and day range
        (EXTRACT(MONTH FROM dp.deathday) = EXTRACT(MONTH FROM wr.week_start)
         AND EXTRACT(DAY FROM dp.deathday) >= EXTRACT(DAY FROM wr.week_start)
         AND EXTRACT(DAY FROM dp.deathday) <= EXTRACT(DAY FROM wr.week_end))
        OR
        -- Handle week spanning month boundary
        (EXTRACT(MONTH FROM wr.week_start) != EXTRACT(MONTH FROM wr.week_end)
         AND (
           (EXTRACT(MONTH FROM dp.deathday) = EXTRACT(MONTH FROM wr.week_start)
            AND EXTRACT(DAY FROM dp.deathday) >= EXTRACT(DAY FROM wr.week_start))
           OR
           (EXTRACT(MONTH FROM dp.deathday) = EXTRACT(MONTH FROM wr.week_end)
            AND EXTRACT(DAY FROM dp.deathday) <= EXTRACT(DAY FROM wr.week_end))
         ))
      )
    ORDER BY
      EXTRACT(MONTH FROM dp.deathday),
      EXTRACT(DAY FROM dp.deathday),
      year_of_death DESC
    LIMIT 15
  `)

  return result.rows
}

// ============================================================================
// Deaths by Cause functions (SEO category pages)
// ============================================================================

export interface CauseCategory {
  cause: string
  count: number
  slug: string
}

export async function getCauseCategories(): Promise<CauseCategory[]> {
  const db = getPool()

  const result = await db.query<{ cause_of_death: string; count: string }>(`
    SELECT cause_of_death, COUNT(*) as count
    FROM deceased_persons
    WHERE cause_of_death IS NOT NULL
      AND cause_of_death != ''
    GROUP BY cause_of_death
    HAVING COUNT(*) >= 5
    ORDER BY count DESC
  `)

  return result.rows.map((row) => ({
    cause: row.cause_of_death,
    count: parseInt(row.count, 10),
    slug: row.cause_of_death
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  }))
}

export interface DeathByCauseRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string
  cause_of_death_details: string | null
  age_at_death: number | null
  years_lost: number | null
}

export interface DeathsByCauseOptions {
  limit?: number
  offset?: number
}

export async function getDeathsByCause(
  cause: string,
  options: DeathsByCauseOptions = {}
): Promise<{ deaths: DeathByCauseRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM deceased_persons
     WHERE LOWER(cause_of_death) = LOWER($1)`,
    [cause]
  )
  const totalCount = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const result = await db.query<DeathByCauseRecord>(
    `SELECT tmdb_id, name, deathday::text, profile_path, cause_of_death,
            cause_of_death_details, age_at_death, years_lost
     FROM deceased_persons
     WHERE LOWER(cause_of_death) = LOWER($1)
     ORDER BY deathday DESC NULLS LAST, name
     LIMIT $2 OFFSET $3`,
    [cause, limit, offset]
  )

  return { deaths: result.rows, totalCount }
}

// ============================================================================
// Deaths by Decade functions (SEO category pages)
// ============================================================================

export interface DecadeCategory {
  decade: number // e.g., 1950, 1960, etc.
  count: number
}

export async function getDecadeCategories(): Promise<DecadeCategory[]> {
  const db = getPool()

  const result = await db.query<{ decade: number; count: string }>(`
    SELECT (EXTRACT(YEAR FROM deathday)::int / 10 * 10) as decade,
           COUNT(*) as count
    FROM deceased_persons
    WHERE deathday IS NOT NULL
    GROUP BY decade
    HAVING COUNT(*) >= 5
    ORDER BY decade DESC
  `)

  return result.rows.map((row) => ({
    decade: row.decade,
    count: parseInt(row.count, 10),
  }))
}

export interface DeathByDecadeRecord {
  tmdb_id: number
  name: string
  deathday: string
  profile_path: string | null
  cause_of_death: string | null
  age_at_death: number | null
  years_lost: number | null
}

export interface DeathsByDecadeOptions {
  limit?: number
  offset?: number
}

export async function getDeathsByDecade(
  decade: number,
  options: DeathsByDecadeOptions = {}
): Promise<{ deaths: DeathByDecadeRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()
  const decadeEnd = decade + 9

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM deceased_persons
     WHERE EXTRACT(YEAR FROM deathday) BETWEEN $1 AND $2`,
    [decade, decadeEnd]
  )
  const totalCount = parseInt(countResult.rows[0].count, 10)

  // Get paginated results
  const result = await db.query<DeathByDecadeRecord>(
    `SELECT tmdb_id, name, deathday::text, profile_path, cause_of_death,
            age_at_death, years_lost
     FROM deceased_persons
     WHERE EXTRACT(YEAR FROM deathday) BETWEEN $1 AND $2
     ORDER BY deathday DESC NULLS LAST, name
     LIMIT $3 OFFSET $4`,
    [decade, decadeEnd, limit, offset]
  )

  return { deaths: result.rows, totalCount }
}

// Find the original cause name from a slug
export async function getCauseFromSlug(slug: string): Promise<string | null> {
  const db = getPool()

  // Get all causes and find the one matching the slug
  const result = await db.query<{ cause_of_death: string }>(`
    SELECT DISTINCT cause_of_death
    FROM deceased_persons
    WHERE cause_of_death IS NOT NULL
      AND cause_of_death != ''
  `)

  for (const row of result.rows) {
    const causeSlug = row.cause_of_death
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    if (causeSlug === slug) {
      return row.cause_of_death
    }
  }

  return null
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

// Paginated version for the Forever Young list page
export interface ForeverYoungMovieRecord {
  movie_tmdb_id: number
  movie_title: string
  movie_release_year: number | null
  movie_poster_path: string | null
  actor_tmdb_id: number
  actor_name: string
  actor_profile_path: string | null
  years_lost: number
  cause_of_death: string | null
  cause_of_death_details: string | null
}

export interface ForeverYoungOptions {
  limit?: number
  offset?: number
}

// Get movies featuring leading actors who died abnormally young with pagination
export async function getForeverYoungMoviesPaginated(
  options: ForeverYoungOptions = {}
): Promise<{ movies: ForeverYoungMovieRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  // Find movies where a leading actor died with 40%+ of their expected lifespan still ahead
  // Uses CTE to get one actor per movie (the one who lost the most years),
  // then paginates and returns with total count
  const result = await db.query<ForeverYoungMovieRecord & { total_count: string }>(
    `WITH forever_young_movies AS (
       SELECT DISTINCT ON (m.tmdb_id)
         m.tmdb_id as movie_tmdb_id,
         m.title as movie_title,
         m.release_year as movie_release_year,
         m.poster_path as movie_poster_path,
         dp.tmdb_id as actor_tmdb_id,
         dp.name as actor_name,
         dp.profile_path as actor_profile_path,
         dp.years_lost,
         dp.cause_of_death,
         dp.cause_of_death_details
       FROM actor_appearances aa
       JOIN movies m ON aa.movie_tmdb_id = m.tmdb_id
       JOIN deceased_persons dp ON aa.actor_tmdb_id = dp.tmdb_id
       WHERE aa.billing_order <= 3
         AND dp.years_lost > dp.expected_lifespan * 0.40
       ORDER BY m.tmdb_id, dp.years_lost DESC
     )
     SELECT COUNT(*) OVER() as total_count, *
     FROM forever_young_movies
     ORDER BY years_lost DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const movies = result.rows.map(({ total_count: _total_count, ...movie }) => movie)

  return { movies, totalCount }
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

// ============================================================================
// COVID-19 deaths functions
// ============================================================================

export interface CovidDeathOptions {
  limit?: number
  offset?: number
}

// Get deceased persons who died from COVID-19 or related causes
export async function getCovidDeaths(options: CovidDeathOptions = {}): Promise<{
  persons: DeceasedPersonRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  const result = await db.query<DeceasedPersonRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM deceased_persons
     WHERE cause_of_death ILIKE '%covid%'
        OR cause_of_death ILIKE '%coronavirus%'
        OR cause_of_death ILIKE '%sars-cov-2%'
        OR cause_of_death_details ILIKE '%covid%'
        OR cause_of_death_details ILIKE '%coronavirus%'
        OR cause_of_death_details ILIKE '%sars-cov-2%'
     ORDER BY deathday DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const persons = result.rows.map(({ total_count: _total_count, ...person }) => person)

  return { persons, totalCount }
}

// ============================================================================
// Violent deaths functions
// ============================================================================

export interface ViolentDeathOptions {
  limit?: number
  offset?: number
}

// Get deceased persons who died from violent causes (homicide, suicide, execution, weapons)
export async function getViolentDeaths(options: ViolentDeathOptions = {}): Promise<{
  persons: DeceasedPersonRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  const result = await db.query<DeceasedPersonRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM deceased_persons
     WHERE violent_death = true
     ORDER BY deathday DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const persons = result.rows.map(({ total_count: _total_count, ...person }) => person)

  return { persons, totalCount }
}

// Get all deceased persons, paginated (for "All Deaths" page)
export interface AllDeathsOptions {
  limit?: number
  offset?: number
}

export async function getAllDeaths(options: AllDeathsOptions = {}): Promise<{
  persons: DeceasedPersonRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  const result = await db.query<DeceasedPersonRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM deceased_persons
     WHERE deathday IS NOT NULL
     ORDER BY deathday DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0
  const persons = result.rows.map(({ total_count: _total_count, ...person }) => person)

  return { persons, totalCount }
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

// ============================================================================
// Language backfill functions
// ============================================================================

// Get TMDB IDs of movies that don't have original_language set (NULL or empty string)
export async function getMoviesWithoutLanguage(limit?: number): Promise<number[]> {
  const db = getPool()
  const query = limit
    ? `SELECT tmdb_id FROM movies WHERE original_language IS NULL OR original_language = '' LIMIT $1`
    : `SELECT tmdb_id FROM movies WHERE original_language IS NULL OR original_language = ''`
  const params = limit ? [limit] : []
  const result = await db.query<{ tmdb_id: number }>(query, params)
  return result.rows.map((row) => row.tmdb_id)
}

// Update a movie's original language and optionally popularity
export async function updateMovieLanguage(
  tmdbId: number,
  language: string,
  popularity?: number
): Promise<void> {
  const db = getPool()
  if (popularity !== undefined) {
    await db.query(
      `UPDATE movies SET original_language = $1, popularity = $2, updated_at = NOW() WHERE tmdb_id = $3`,
      [language, popularity, tmdbId]
    )
  } else {
    await db.query(
      `UPDATE movies SET original_language = $1, updated_at = NOW() WHERE tmdb_id = $2`,
      [language, tmdbId]
    )
  }
}

// ============================================================================
// Death Watch feature - living actors most likely to die soon
// ============================================================================

export interface DeathWatchOptions {
  limit?: number
  offset?: number
  minAge?: number
  minMovies?: number
  includeObscure?: boolean
}

export interface DeathWatchActorRecord {
  actor_tmdb_id: number
  actor_name: string
  birthday: string
  age: number
  profile_path: string | null
  popularity: number | null
  total_movies: number
}

// Get living actors for the Death Watch feature
// Returns actors ordered by age (oldest first = highest death probability)
// Death probability is calculated in application code using actuarial tables
export async function getDeathWatchActors(options: DeathWatchOptions = {}): Promise<{
  actors: DeathWatchActorRecord[]
  totalCount: number
}> {
  const { limit = 50, offset = 0, minAge, minMovies = 2, includeObscure = false } = options

  const db = getPool()

  // Build dynamic WHERE conditions
  const conditions: string[] = []
  const params: (number | boolean)[] = []
  let paramIndex = 1

  // Min age filter (applied in outer WHERE)
  if (minAge !== undefined) {
    conditions.push(`age >= $${paramIndex}`)
    params.push(minAge)
    paramIndex++
  }

  // Obscure filter - exclude actors without profile photos or low popularity
  if (!includeObscure) {
    conditions.push(`profile_path IS NOT NULL`)
    conditions.push(`popularity >= 5.0`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""

  // Add pagination and minMovies params
  params.push(minMovies)
  const minMoviesParamIndex = paramIndex++
  params.push(limit)
  const limitParamIndex = paramIndex++
  params.push(offset)
  const offsetParamIndex = paramIndex++

  const query = `
    WITH living_actors AS (
      SELECT
        aa.actor_tmdb_id,
        aa.actor_name,
        aa.birthday,
        aa.profile_path,
        MAX(aa.popularity) as popularity,
        COUNT(DISTINCT aa.movie_tmdb_id) as total_movies,
        EXTRACT(YEAR FROM age(aa.birthday))::integer as age
      FROM actor_appearances aa
      WHERE aa.is_deceased = false
        AND aa.birthday IS NOT NULL
      GROUP BY aa.actor_tmdb_id, aa.actor_name, aa.birthday, aa.profile_path
      HAVING COUNT(DISTINCT aa.movie_tmdb_id) >= $${minMoviesParamIndex}
    )
    SELECT
      actor_tmdb_id,
      actor_name,
      birthday::text,
      age,
      profile_path,
      popularity::decimal,
      total_movies::integer,
      COUNT(*) OVER() as total_count
    FROM living_actors
    ${whereClause}
    ORDER BY age DESC, popularity DESC NULLS LAST
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `

  const result = await db.query(query, params)

  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0

  // Remove the total_count field from each row
  const actors = result.rows.map(
    ({
      total_count: _,
      ...actor
    }: { total_count: string } & DeathWatchActorRecord): DeathWatchActorRecord => ({
      ...actor,
      popularity: actor.popularity ? parseFloat(String(actor.popularity)) : null,
    })
  )

  return { actors, totalCount }
}

// ============================================================================
// Movies by Genre functions (SEO category pages)
// ============================================================================

export interface GenreCategory {
  genre: string
  count: number
  slug: string
}

export async function getGenreCategories(): Promise<GenreCategory[]> {
  const db = getPool()

  // Unnest the genres array and count movies per genre
  const result = await db.query<{ genre: string; count: string }>(`
    SELECT unnest(genres) as genre, COUNT(*) as count
    FROM movies
    WHERE genres IS NOT NULL
      AND array_length(genres, 1) > 0
      AND deceased_count > 0
    GROUP BY genre
    HAVING COUNT(*) >= 5
    ORDER BY count DESC, genre
  `)

  return result.rows.map((row) => ({
    genre: row.genre,
    count: parseInt(row.count, 10),
    slug: row.genre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  }))
}

export interface MovieByGenreRecord {
  tmdb_id: number
  title: string
  release_year: number | null
  poster_path: string | null
  deceased_count: number
  cast_count: number
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

export interface MoviesByGenreOptions {
  limit?: number
  offset?: number
}

export async function getMoviesByGenre(
  genre: string,
  options: MoviesByGenreOptions = {}
): Promise<{ movies: MovieByGenreRecord[]; totalCount: number }> {
  const { limit = 50, offset = 0 } = options
  const db = getPool()

  // Get total count
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count
     FROM movies
     WHERE $1 = ANY(genres)
       AND deceased_count > 0`,
    [genre]
  )
  const totalCount = parseInt(countResult.rows[0].count, 10)

  // Get paginated results, sorted by mortality surprise score (cursed movies first)
  const result = await db.query<MovieByGenreRecord>(
    `SELECT tmdb_id, title, release_year, poster_path, deceased_count,
            cast_count, expected_deaths, mortality_surprise_score
     FROM movies
     WHERE $1 = ANY(genres)
       AND deceased_count > 0
     ORDER BY mortality_surprise_score DESC NULLS LAST, deceased_count DESC, title
     LIMIT $2 OFFSET $3`,
    [genre, limit, offset]
  )

  return { movies: result.rows, totalCount }
}

// Find the original genre name from a slug
export async function getGenreFromSlug(slug: string): Promise<string | null> {
  const db = getPool()

  // Get all genres and find the one matching the slug
  const result = await db.query<{ genre: string }>(`
    SELECT DISTINCT unnest(genres) as genre
    FROM movies
    WHERE genres IS NOT NULL
      AND array_length(genres, 1) > 0
  `)

  for (const row of result.rows) {
    const genreSlug = row.genre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    if (genreSlug === slug) {
      return row.genre
    }
  }

  return null
}

// ============================================================================
// TV Shows table functions
// ============================================================================

export interface ShowRecord {
  tmdb_id: number
  name: string
  first_air_date: string | null
  last_air_date: string | null
  poster_path: string | null
  backdrop_path: string | null
  genres: string[]
  status: string | null
  number_of_seasons: number | null
  number_of_episodes: number | null
  popularity: number | null
  vote_average: number | null
  origin_country: string[]
  original_language: string | null
  cast_count: number | null
  deceased_count: number | null
  living_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get a show by TMDB ID
export async function getShow(tmdbId: number): Promise<ShowRecord | null> {
  const db = getPool()
  const result = await db.query<ShowRecord>("SELECT * FROM shows WHERE tmdb_id = $1", [tmdbId])
  return result.rows[0] || null
}

// Insert or update a show
export async function upsertShow(show: ShowRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO shows (
       tmdb_id, name, first_air_date, last_air_date, poster_path, backdrop_path,
       genres, status, number_of_seasons, number_of_episodes, popularity, vote_average,
       origin_country, original_language, cast_count, deceased_count, living_count,
       expected_deaths, mortality_surprise_score, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       name = EXCLUDED.name,
       first_air_date = EXCLUDED.first_air_date,
       last_air_date = EXCLUDED.last_air_date,
       poster_path = EXCLUDED.poster_path,
       backdrop_path = EXCLUDED.backdrop_path,
       genres = EXCLUDED.genres,
       status = EXCLUDED.status,
       number_of_seasons = EXCLUDED.number_of_seasons,
       number_of_episodes = EXCLUDED.number_of_episodes,
       popularity = EXCLUDED.popularity,
       vote_average = EXCLUDED.vote_average,
       origin_country = EXCLUDED.origin_country,
       original_language = COALESCE(EXCLUDED.original_language, shows.original_language),
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       living_count = EXCLUDED.living_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       updated_at = CURRENT_TIMESTAMP`,
    [
      show.tmdb_id,
      show.name,
      show.first_air_date,
      show.last_air_date,
      show.poster_path,
      show.backdrop_path,
      show.genres,
      show.status,
      show.number_of_seasons,
      show.number_of_episodes,
      show.popularity,
      show.vote_average,
      show.origin_country,
      show.original_language,
      show.cast_count,
      show.deceased_count,
      show.living_count,
      show.expected_deaths,
      show.mortality_surprise_score,
    ]
  )
}

// ============================================================================
// Seasons table functions
// ============================================================================

export interface SeasonRecord {
  show_tmdb_id: number
  season_number: number
  name: string | null
  air_date: string | null
  episode_count: number | null
  poster_path: string | null
  cast_count: number | null
  deceased_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get seasons for a show
export async function getSeasons(showTmdbId: number): Promise<SeasonRecord[]> {
  const db = getPool()
  const result = await db.query<SeasonRecord>(
    "SELECT * FROM seasons WHERE show_tmdb_id = $1 ORDER BY season_number",
    [showTmdbId]
  )
  return result.rows
}

// Insert or update a season
export async function upsertSeason(season: SeasonRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO seasons (
       show_tmdb_id, season_number, name, air_date, episode_count, poster_path,
       cast_count, deceased_count, expected_deaths, mortality_surprise_score
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (show_tmdb_id, season_number) DO UPDATE SET
       name = EXCLUDED.name,
       air_date = EXCLUDED.air_date,
       episode_count = EXCLUDED.episode_count,
       poster_path = EXCLUDED.poster_path,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score`,
    [
      season.show_tmdb_id,
      season.season_number,
      season.name,
      season.air_date,
      season.episode_count,
      season.poster_path,
      season.cast_count,
      season.deceased_count,
      season.expected_deaths,
      season.mortality_surprise_score,
    ]
  )
}

// ============================================================================
// Episodes table functions
// ============================================================================

export interface EpisodeRecord {
  show_tmdb_id: number
  season_number: number
  episode_number: number
  name: string | null
  air_date: string | null
  runtime: number | null
  cast_count: number | null
  deceased_count: number | null
  guest_star_count: number | null
  expected_deaths: number | null
  mortality_surprise_score: number | null
}

// Get episodes for a season
export async function getEpisodes(
  showTmdbId: number,
  seasonNumber: number
): Promise<EpisodeRecord[]> {
  const db = getPool()
  const result = await db.query<EpisodeRecord>(
    "SELECT * FROM episodes WHERE show_tmdb_id = $1 AND season_number = $2 ORDER BY episode_number",
    [showTmdbId, seasonNumber]
  )
  return result.rows
}

// Insert or update an episode
export async function upsertEpisode(episode: EpisodeRecord): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO episodes (
       show_tmdb_id, season_number, episode_number, name, air_date, runtime,
       cast_count, deceased_count, guest_star_count, expected_deaths, mortality_surprise_score
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (show_tmdb_id, season_number, episode_number) DO UPDATE SET
       name = EXCLUDED.name,
       air_date = EXCLUDED.air_date,
       runtime = EXCLUDED.runtime,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       guest_star_count = EXCLUDED.guest_star_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score`,
    [
      episode.show_tmdb_id,
      episode.season_number,
      episode.episode_number,
      episode.name,
      episode.air_date,
      episode.runtime,
      episode.cast_count,
      episode.deceased_count,
      episode.guest_star_count,
      episode.expected_deaths,
      episode.mortality_surprise_score,
    ]
  )
}

// ============================================================================
// Show actor appearances table functions
// ============================================================================

export interface ShowActorAppearanceRecord {
  actor_tmdb_id: number
  show_tmdb_id: number
  season_number: number
  episode_number: number
  actor_name: string
  character_name: string | null
  appearance_type: string // 'regular', 'recurring', 'guest'
  billing_order: number | null
  age_at_filming: number | null
  is_deceased: boolean
}

// Insert or update a show actor appearance
export async function upsertShowActorAppearance(
  appearance: ShowActorAppearanceRecord
): Promise<void> {
  const db = getPool()
  await db.query(
    `INSERT INTO show_actor_appearances (
       actor_tmdb_id, show_tmdb_id, season_number, episode_number, actor_name,
       character_name, appearance_type, billing_order, age_at_filming, is_deceased
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (actor_tmdb_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
       actor_name = EXCLUDED.actor_name,
       character_name = EXCLUDED.character_name,
       appearance_type = EXCLUDED.appearance_type,
       billing_order = EXCLUDED.billing_order,
       age_at_filming = EXCLUDED.age_at_filming,
       is_deceased = EXCLUDED.is_deceased`,
    [
      appearance.actor_tmdb_id,
      appearance.show_tmdb_id,
      appearance.season_number,
      appearance.episode_number,
      appearance.actor_name,
      appearance.character_name,
      appearance.appearance_type,
      appearance.billing_order,
      appearance.age_at_filming,
      appearance.is_deceased,
    ]
  )
}

// Batch insert show actor appearances using bulk VALUES for efficiency
export async function batchUpsertShowActorAppearances(
  appearances: ShowActorAppearanceRecord[]
): Promise<void> {
  if (appearances.length === 0) return

  const db = getPool()

  // Process in chunks of 100 to avoid query size limits
  const CHUNK_SIZE = 100
  for (let i = 0; i < appearances.length; i += CHUNK_SIZE) {
    const chunk = appearances.slice(i, i + CHUNK_SIZE)

    // Build VALUES clause with numbered parameters
    const values: unknown[] = []
    const placeholders = chunk.map((appearance, index) => {
      const offset = index * 10
      values.push(
        appearance.actor_tmdb_id,
        appearance.show_tmdb_id,
        appearance.season_number,
        appearance.episode_number,
        appearance.actor_name,
        appearance.character_name,
        appearance.appearance_type,
        appearance.billing_order,
        appearance.age_at_filming,
        appearance.is_deceased
      )
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`
    })

    await db.query(
      `INSERT INTO show_actor_appearances (
         actor_tmdb_id, show_tmdb_id, season_number, episode_number, actor_name,
         character_name, appearance_type, billing_order, age_at_filming, is_deceased
       )
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (actor_tmdb_id, show_tmdb_id, season_number, episode_number) DO UPDATE SET
         actor_name = EXCLUDED.actor_name,
         character_name = EXCLUDED.character_name,
         appearance_type = EXCLUDED.appearance_type,
         billing_order = EXCLUDED.billing_order,
         age_at_filming = EXCLUDED.age_at_filming,
         is_deceased = EXCLUDED.is_deceased`,
      values
    )
  }
}

// Get unique actors for a show (aggregated across all episodes)
export async function getShowActors(
  showTmdbId: number
): Promise<Array<{ actorTmdbId: number; actorName: string; isDeceased: boolean }>> {
  const db = getPool()
  const result = await db.query<{
    actor_tmdb_id: number
    actor_name: string
    is_deceased: boolean
  }>(
    `SELECT DISTINCT actor_tmdb_id, actor_name, is_deceased
     FROM show_actor_appearances
     WHERE show_tmdb_id = $1
     ORDER BY actor_name`,
    [showTmdbId]
  )
  return result.rows.map((row) => ({
    actorTmdbId: row.actor_tmdb_id,
    actorName: row.actor_name,
    isDeceased: row.is_deceased,
  }))
}
