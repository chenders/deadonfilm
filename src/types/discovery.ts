// Discovery and category types

import type { PaginationInfo } from "./common"

// Forever Young types - movies featuring actors who died tragically young
export interface ForeverYoungMovie {
  rank: number
  id: number
  title: string
  releaseYear: number | null
  posterPath: string | null
  actor: {
    id: number
    name: string
    profilePath: string | null
    yearsLost: number
    causeOfDeath: string | null
    causeOfDeathDetails: string | null
  }
}

export interface ForeverYoungResponse {
  movies: ForeverYoungMovie[]
  pagination: PaginationInfo
}

// Site Stats types
export interface SiteStatsResponse {
  totalDeceasedActors: number
  totalMoviesAnalyzed: number
  topCauseOfDeath: string | null
  avgMortalityPercentage: number | null
}

// Trivia types
export interface TriviaFact {
  type: string
  title: string
  value: string
  link?: string
}

export interface TriviaResponse {
  facts: TriviaFact[]
}

// Cause categories
export interface CauseCategory {
  cause: string
  count: number
  slug: string
}

export interface CauseCategoriesResponse {
  causes: CauseCategory[]
}

// Decade categories
export interface DecadeCategory {
  decade: number
  count: number
}

export interface DecadeCategoriesResponse {
  decades: DecadeCategory[]
}

// Genre categories
export interface GenreCategory {
  genre: string
  count: number
  slug: string
}

export interface GenreCategoriesResponse {
  genres: GenreCategory[]
}
