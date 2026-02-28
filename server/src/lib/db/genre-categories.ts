/**
 * Genre category database functions.
 *
 * Provides enriched genre data for the genres index page, including
 * featured actors, top causes of death, and top movies per genre.
 */

import { getPool } from "./pool.js"
import type {
  GenreCategoryEnriched,
  GenreFeaturedActor,
  GenreTopCause,
  GenreTopMovie,
} from "./types.js"
import { filterRedundantCauses } from "./cause-categories.js"
import { createCauseSlug } from "../cause-categories.js"

// Maximum number of top causes to display per genre
const MAX_CAUSES_PER_GENRE = 3

// Candidates per genre for greedy deduplication (movie/actor uniqueness across genres)
const CANDIDATES_PER_GENRE = 10

/**
 * Get enriched genre categories for the index page.
 *
 * Runs 4 parallel queries keyed by genre name:
 * 1. Genre counts (movies with deceased cast per genre)
 * 2. Top movie per genre (most popular with backdrop)
 * 3. Featured actor per genre (most popular deceased non-obscure)
 * 4. Top 3 causes per genre (normalized, deduplicated by actor)
 *
 * @returns Array of enriched genre categories sorted by movie count desc
 */
export async function getGenreCategories(): Promise<GenreCategoryEnriched[]> {
  const db = getPool()

  // Get basic genre counts
  const genresResult = await db.query<{ genre: string; count: string }>(`
    SELECT unnest(genres) as genre, COUNT(*) as count
    FROM movies
    WHERE genres IS NOT NULL
      AND array_length(genres, 1) > 0
      AND deceased_count > 0
    GROUP BY genre
    HAVING COUNT(*) >= 5
    ORDER BY count DESC, genre
  `)

  // Get top movie per genre (most popular non-obscure movie with backdrop)
  const moviesResult = await db.query<{
    genre: string
    tmdb_id: number
    title: string
    release_year: number | null
    backdrop_path: string | null
  }>(`
    WITH genre_movies AS (
      SELECT
        g.genre,
        m.tmdb_id,
        m.title,
        m.release_year,
        COALESCE(m.backdrop_path, m.poster_path) as backdrop_path,
        ROW_NUMBER() OVER (
          PARTITION BY g.genre
          ORDER BY m.dof_popularity DESC NULLS LAST
        ) as rn
      FROM movies m,
           LATERAL unnest(m.genres) AS g(genre)
      WHERE m.genres IS NOT NULL
        AND m.deceased_count > 0
        AND (m.backdrop_path IS NOT NULL OR m.poster_path IS NOT NULL)
        AND m.is_obscure = false
    )
    SELECT genre, tmdb_id, title, release_year, backdrop_path
    FROM genre_movies
    WHERE rn <= ${CANDIDATES_PER_GENRE}
  `)

  // Get featured actor per genre (most popular deceased non-obscure actor)
  const featuredResult = await db.query<{
    genre: string
    id: number
    tmdb_id: number | null
    name: string
    profile_path: string | null
    fallback_profile_url: string | null
    cause_of_death: string | null
  }>(`
    WITH genre_actors AS (
      SELECT
        g.genre,
        a.id,
        a.tmdb_id,
        a.name,
        a.profile_path,
        a.fallback_profile_url,
        a.cause_of_death,
        ROW_NUMBER() OVER (
          PARTITION BY g.genre
          ORDER BY a.dof_popularity DESC NULLS LAST
        ) as rn
      FROM actors a
      JOIN actor_movie_appearances ama ON a.id = ama.actor_id
      JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
      CROSS JOIN LATERAL unnest(m.genres) AS g(genre)
      WHERE a.deathday IS NOT NULL
        AND a.is_obscure = false
        AND m.genres IS NOT NULL
    )
    SELECT genre, id, tmdb_id, name, profile_path, fallback_profile_url, cause_of_death
    FROM genre_actors
    WHERE rn <= ${CANDIDATES_PER_GENRE}
  `)

  // Get top 3 causes per genre (count distinct actors to avoid inflation)
  const causesResult = await db.query<{
    genre: string
    cause: string
    count: string
  }>(`
    WITH genre_causes AS (
      SELECT
        g.genre,
        COALESCE(n.normalized_cause, a.cause_of_death) as cause,
        COUNT(DISTINCT a.id) as count,
        ROW_NUMBER() OVER (
          PARTITION BY g.genre
          ORDER BY COUNT(DISTINCT a.id) DESC
        ) as rn
      FROM actors a
      JOIN actor_movie_appearances ama ON a.id = ama.actor_id
      JOIN movies m ON ama.movie_tmdb_id = m.tmdb_id
      CROSS JOIN LATERAL unnest(m.genres) AS g(genre)
      LEFT JOIN cause_of_death_normalizations n ON a.cause_of_death = n.original_cause
      WHERE a.deathday IS NOT NULL
        AND a.cause_of_death IS NOT NULL
        AND a.is_obscure = false
        AND m.genres IS NOT NULL
      GROUP BY g.genre, COALESCE(n.normalized_cause, a.cause_of_death)
    )
    SELECT genre, cause, count
    FROM genre_causes
    WHERE rn <= ${MAX_CAUSES_PER_GENRE}
    ORDER BY genre, count DESC
  `)

  // Build candidate lists for greedy deduplication (multiple candidates per genre)
  const movieCandidatesByGenre = new Map<string, GenreTopMovie[]>()
  for (const row of moviesResult.rows) {
    const existing = movieCandidatesByGenre.get(row.genre) || []
    existing.push({
      tmdbId: row.tmdb_id,
      title: row.title,
      releaseYear: row.release_year,
      backdropPath: row.backdrop_path,
    })
    movieCandidatesByGenre.set(row.genre, existing)
  }

  const actorCandidatesByGenre = new Map<string, GenreFeaturedActor[]>()
  for (const row of featuredResult.rows) {
    const existing = actorCandidatesByGenre.get(row.genre) || []
    existing.push({
      id: row.id,
      tmdbId: row.tmdb_id,
      name: row.name,
      profilePath: row.profile_path,
      fallbackProfileUrl: row.fallback_profile_url,
      causeOfDeath: row.cause_of_death,
    })
    actorCandidatesByGenre.set(row.genre, existing)
  }

  // Greedy assignment: iterate genres by count desc, pick first unused movie/actor
  const usedMovieIds = new Set<number>()
  const usedActorIds = new Set<number>()
  const moviesByGenre = new Map<string, GenreTopMovie>()
  const featuredByGenre = new Map<string, GenreFeaturedActor>()

  for (const row of genresResult.rows) {
    const movieCandidates = movieCandidatesByGenre.get(row.genre) || []
    const picked = movieCandidates.find((m) => !usedMovieIds.has(m.tmdbId))
    if (picked) {
      usedMovieIds.add(picked.tmdbId)
      moviesByGenre.set(row.genre, picked)
    }

    const actorCandidates = actorCandidatesByGenre.get(row.genre) || []
    const pickedActor = actorCandidates.find((a) => !usedActorIds.has(a.id))
    if (pickedActor) {
      usedActorIds.add(pickedActor.id)
      featuredByGenre.set(row.genre, pickedActor)
    }
  }

  const causesByGenre = new Map<string, GenreTopCause[]>()
  for (const row of causesResult.rows) {
    const existing = causesByGenre.get(row.genre) || []
    existing.push({
      cause: row.cause,
      count: parseInt(row.count, 10),
      slug: createCauseSlug(row.cause),
    })
    causesByGenre.set(row.genre, existing)
  }

  // Filter out redundant causes and keep only top N
  for (const [genre, causes] of causesByGenre) {
    // filterRedundantCauses accepts { cause, count, slug }[] — same shape
    const filtered = filterRedundantCauses(causes)
    causesByGenre.set(genre, filtered.slice(0, MAX_CAUSES_PER_GENRE))
  }

  return genresResult.rows.map((row) => ({
    genre: row.genre,
    count: parseInt(row.count, 10),
    slug: row.genre
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    featuredActor: featuredByGenre.get(row.genre) || null,
    topCauses: causesByGenre.get(row.genre) || [],
    topMovie: moviesByGenre.get(row.genre) || null,
  }))
}
