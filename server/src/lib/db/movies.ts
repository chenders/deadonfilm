/**
 * Movie database functions.
 *
 * Functions for managing movies in the database - CRUD operations
 * and high mortality discovery queries.
 */

import { getPool } from "./pool.js"
import type { MovieRecord, HighMortalityOptions } from "./types.js"

// ============================================================================
// Movie CRUD functions
// ============================================================================

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

// ============================================================================
// High mortality discovery functions
// ============================================================================

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
  // Uses idx_movies_not_obscure_curse partial index when includeObscure = false
  const result = await db.query<MovieRecord & { total_count: string }>(
    `SELECT COUNT(*) OVER () as total_count, *
     FROM movies
     WHERE mortality_surprise_score IS NOT NULL
       AND deceased_count >= $1
       AND ($2::integer IS NULL OR release_year >= $2)
       AND ($3::integer IS NULL OR release_year <= $3)
       AND ($6::boolean = true OR NOT is_obscure)
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
