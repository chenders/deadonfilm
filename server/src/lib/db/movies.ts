/**
 * Movie database functions.
 *
 * Functions for managing movies in the database - CRUD operations.
 */

import { getPool } from "./pool.js"
import type { MovieRecord } from "./types.js"

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
    `INSERT INTO movies (
       tmdb_id, title, release_date, release_year, poster_path, genres,
       original_language, production_countries, tmdb_popularity, tmdb_vote_average,
       cast_count, deceased_count, living_count, expected_deaths, mortality_surprise_score,
       imdb_id,
       omdb_imdb_rating, omdb_imdb_votes, omdb_rotten_tomatoes_score,
       omdb_rotten_tomatoes_audience, omdb_metacritic_score, omdb_updated_at,
       omdb_box_office_cents, omdb_awards_wins, omdb_awards_nominations,
       trakt_rating, trakt_votes, trakt_watchers, trakt_plays,
       trakt_trending_rank, trakt_updated_at,
       updated_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16,
       $17, $18, $19, $20, $21, $22,
       $23, $24, $25,
       $26, $27, $28, $29, $30, $31,
       CURRENT_TIMESTAMP
     )
     ON CONFLICT (tmdb_id) DO UPDATE SET
       title = EXCLUDED.title,
       release_date = EXCLUDED.release_date,
       release_year = EXCLUDED.release_year,
       poster_path = EXCLUDED.poster_path,
       genres = EXCLUDED.genres,
       original_language = COALESCE(EXCLUDED.original_language, movies.original_language),
       production_countries = COALESCE(EXCLUDED.production_countries, movies.production_countries),
       tmdb_popularity = COALESCE(EXCLUDED.tmdb_popularity, movies.tmdb_popularity),
       tmdb_vote_average = EXCLUDED.tmdb_vote_average,
       cast_count = EXCLUDED.cast_count,
       deceased_count = EXCLUDED.deceased_count,
       living_count = EXCLUDED.living_count,
       expected_deaths = EXCLUDED.expected_deaths,
       mortality_surprise_score = EXCLUDED.mortality_surprise_score,
       imdb_id = COALESCE(EXCLUDED.imdb_id, movies.imdb_id),
       omdb_imdb_rating = COALESCE(EXCLUDED.omdb_imdb_rating, movies.omdb_imdb_rating),
       omdb_imdb_votes = COALESCE(EXCLUDED.omdb_imdb_votes, movies.omdb_imdb_votes),
       omdb_rotten_tomatoes_score = COALESCE(EXCLUDED.omdb_rotten_tomatoes_score, movies.omdb_rotten_tomatoes_score),
       omdb_rotten_tomatoes_audience = COALESCE(EXCLUDED.omdb_rotten_tomatoes_audience, movies.omdb_rotten_tomatoes_audience),
       omdb_metacritic_score = COALESCE(EXCLUDED.omdb_metacritic_score, movies.omdb_metacritic_score),
       omdb_updated_at = COALESCE(EXCLUDED.omdb_updated_at, movies.omdb_updated_at),
       omdb_box_office_cents = COALESCE(EXCLUDED.omdb_box_office_cents, movies.omdb_box_office_cents),
       omdb_awards_wins = COALESCE(EXCLUDED.omdb_awards_wins, movies.omdb_awards_wins),
       omdb_awards_nominations = COALESCE(EXCLUDED.omdb_awards_nominations, movies.omdb_awards_nominations),
       trakt_rating = COALESCE(EXCLUDED.trakt_rating, movies.trakt_rating),
       trakt_votes = COALESCE(EXCLUDED.trakt_votes, movies.trakt_votes),
       trakt_watchers = COALESCE(EXCLUDED.trakt_watchers, movies.trakt_watchers),
       trakt_plays = COALESCE(EXCLUDED.trakt_plays, movies.trakt_plays),
       trakt_trending_rank = COALESCE(EXCLUDED.trakt_trending_rank, movies.trakt_trending_rank),
       trakt_updated_at = COALESCE(EXCLUDED.trakt_updated_at, movies.trakt_updated_at),
       updated_at = CURRENT_TIMESTAMP`,
    [
      movie.tmdb_id,
      movie.title,
      movie.release_date,
      movie.release_year,
      movie.poster_path,
      movie.genres,
      movie.original_language,
      movie.production_countries,
      movie.tmdb_popularity,
      movie.tmdb_vote_average,
      movie.cast_count,
      movie.deceased_count,
      movie.living_count,
      movie.expected_deaths,
      movie.mortality_surprise_score,
      movie.imdb_id || null,
      movie.omdb_imdb_rating || null,
      movie.omdb_imdb_votes || null,
      movie.omdb_rotten_tomatoes_score || null,
      movie.omdb_rotten_tomatoes_audience || null,
      movie.omdb_metacritic_score || null,
      movie.omdb_updated_at || null,
      movie.omdb_box_office_cents ?? null,
      movie.omdb_awards_wins ?? null,
      movie.omdb_awards_nominations ?? null,
      movie.trakt_rating || null,
      movie.trakt_votes || null,
      movie.trakt_watchers || null,
      movie.trakt_plays || null,
      movie.trakt_trending_rank || null,
      movie.trakt_updated_at || null,
    ]
  )
}
