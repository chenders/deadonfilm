// Movie types

import type { PaginationInfo } from "./common"
import type { DeceasedActor, LivingActor } from "./actor"

export interface MovieSearchResult {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
}

// Unified search result (for mixed movie/TV search)
export interface UnifiedSearchResult {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  media_type: "movie" | "tv"
}

export type SearchMediaType = "movie" | "tv" | "all"

export interface UnifiedSearchResponse {
  results: UnifiedSearchResult[]
  page: number
  total_pages: number
  total_results: number
}

export interface MovieDetails {
  id: number
  title: string
  release_date: string
  poster_path: string | null
  overview: string
  runtime: number | null
  genres: Array<{ id: number; name: string }>
}

// API Response types
export interface SearchResponse {
  results: MovieSearchResult[]
  page: number
  total_pages: number
  total_results: number
}

export interface MovieResponse {
  movie: MovieDetails
  deceased: DeceasedActor[]
  living: LivingActor[]
  stats: {
    totalCast: number
    deceasedCount: number
    livingCount: number
    mortalityPercentage: number
    // Mortality statistics
    expectedDeaths: number
    mortalitySurpriseScore: number
  }
  lastSurvivor: LivingActor | null
  enrichmentPending?: boolean
}

export interface DeathInfoResponse {
  pending: boolean
  deathInfo: Record<
    number,
    { causeOfDeath: string | null; causeOfDeathDetails: string | null; wikipediaUrl: string | null }
  >
}

export interface RandomMovieResponse {
  id: number
  title: string
  release_date: string
}

// Cursed Movies types
export interface CursedMovie {
  rank: number
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  expectedDeaths: number
  mortalitySurpriseScore: number
}

export interface CursedMoviesResponse {
  movies: CursedMovie[]
  pagination: PaginationInfo
}

export interface CursedMoviesFiltersResponse {
  maxMinDeaths: number
}

// Featured Movie types
export interface FeaturedMovie {
  tmdbId: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  expectedDeaths: number
  mortalitySurpriseScore: number
}

export interface FeaturedMovieResponse {
  movie: FeaturedMovie | null
}

// Popular Movies types
export interface PopularMovie {
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  popularity: number
}

export interface PopularMoviesResponse {
  movies: PopularMovie[]
}

// Movies by Genre types
export interface MovieByGenre {
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  deceasedCount: number
  castCount: number
  expectedDeaths: number | null
  mortalitySurpriseScore: number | null
}

export interface MoviesByGenreResponse {
  genre: string
  slug: string
  movies: MovieByGenre[]
  pagination: PaginationInfo
}
