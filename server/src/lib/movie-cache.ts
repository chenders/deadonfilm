/**
 * Utility functions for building movie and actor appearance records for caching.
 * These are pure functions extracted for testability.
 */

import type { MovieRecord, ActorMovieAppearanceRecord } from "./db.js"

export interface MovieCacheInput {
  movie: {
    id: number
    title: string
    release_date: string | null
    poster_path: string | null
    genres?: Array<{ id: number; name: string }>
  }
  deceasedCount: number
  livingCount: number
  expectedDeaths: number
  mortalitySurpriseScore: number
}

export interface ActorAppearanceInput {
  castMember: {
    id: number
    character: string | null
  }
  movieId: number
  billingOrder: number
  releaseYear: number | null
  birthday: string | null
}

/**
 * Build a movie record from movie data and mortality statistics.
 */
export function buildMovieRecord(input: MovieCacheInput): MovieRecord {
  const { movie, deceasedCount, livingCount, expectedDeaths, mortalitySurpriseScore } = input
  const releaseYear = movie.release_date ? parseInt(movie.release_date.split("-")[0]) : null

  return {
    tmdb_id: movie.id,
    title: movie.title,
    release_date: movie.release_date || null,
    release_year: releaseYear,
    poster_path: movie.poster_path,
    genres: movie.genres?.map((g) => g.name) || [],
    original_language: null, // Not available from movie details endpoint
    popularity: null,
    vote_average: null,
    cast_count: deceasedCount + livingCount,
    deceased_count: deceasedCount,
    living_count: livingCount,
    expected_deaths: expectedDeaths,
    mortality_surprise_score: mortalitySurpriseScore,
  }
}

/**
 * Calculate age at filming from birthday and release year.
 * Returns null if either value is missing or invalid.
 *
 * @param birthday - Date string in YYYY-MM-DD format, or null
 * @param releaseYear - The year the movie was released, or null
 * @returns Age at filming, or null if birthday/releaseYear is missing or malformed
 */
export function calculateAgeAtFilming(
  birthday: string | null,
  releaseYear: number | null
): number | null {
  if (!birthday || !releaseYear) return null

  const birthYear = parseInt(birthday.split("-")[0], 10)
  if (isNaN(birthYear)) return null

  return releaseYear - birthYear
}

/**
 * Build an actor movie appearance record.
 */
export function buildActorMovieAppearanceRecord(
  input: ActorAppearanceInput
): ActorMovieAppearanceRecord {
  const { castMember, movieId, billingOrder, releaseYear, birthday } = input

  return {
    actor_tmdb_id: castMember.id,
    movie_tmdb_id: movieId,
    character_name: castMember.character || null,
    billing_order: billingOrder,
    age_at_filming: calculateAgeAtFilming(birthday, releaseYear),
  }
}
