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
  totalActors: number
  totalDeceasedActors: number
  totalMoviesAnalyzed: number
  topCauseOfDeath: string | null
  topCauseOfDeathCategorySlug: string | null
  avgMortalityPercentage: number | null
  causeOfDeathPercentage: number | null
  actorsWithCauseKnown: number | null
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
export interface DecadeFeaturedActor {
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  causeOfDeath: string | null
}

export interface DecadeTopCause {
  cause: string
  count: number
  slug: string
}

export interface DecadeTopMovie {
  tmdbId: number
  title: string
  releaseYear: number | null
  backdropPath: string | null
}

export interface DecadeCategory {
  decade: number
  count: number
  featuredActor: DecadeFeaturedActor | null
  topCauses: DecadeTopCause[]
  topMovie: DecadeTopMovie | null
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

// Causes of Death - 3-level hierarchy types

// Top cause preview shown on category cards
export interface TopCause {
  cause: string
  slug: string
  count: number
}

// Category stats for index page
export interface CauseCategoryStats {
  slug: string
  label: string
  count: number
  avgAge: number | null
  avgYearsLost: number | null
  topCauses: TopCause[]
}

// Index page response
export interface CauseCategoryIndexResponse {
  categories: CauseCategoryStats[]
  totalWithKnownCause: number
  overallAvgAge: number | null
  overallAvgYearsLost: number | null
  mostCommonCategory: string | null
}

// Notable actor for category/cause pages
export interface NotableActor {
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  deathday: string
  causeOfDeath?: string
  causeOfDeathDetails: string | null
  ageAtDeath: number | null
}

// Decade breakdown entry
export interface DecadeBreakdown {
  decade: string
  count: number
}

// Specific cause within a category
export interface SpecificCauseStats {
  cause: string
  slug: string
  count: number
  avgAge: number | null
}

// Actor entry for cause listings
export interface CauseActor {
  rank: number
  id: number
  tmdbId: number | null
  name: string
  profilePath: string | null
  deathday: string
  causeOfDeath?: string
  causeOfDeathDetails: string | null
  ageAtDeath: number | null
  yearsLost: number | null
}

// Category detail response
export interface CauseCategoryDetailResponse {
  slug: string
  label: string
  count: number
  avgAge: number | null
  avgYearsLost: number | null
  percentage: number
  notableActors: NotableActor[]
  decadeBreakdown: DecadeBreakdown[]
  specificCauses: SpecificCauseStats[]
  actors: CauseActor[]
  pagination: PaginationInfo
}

// Specific cause detail response
export interface SpecificCauseDetailResponse {
  cause: string
  slug: string
  categorySlug: string
  categoryLabel: string
  count: number
  avgAge: number | null
  avgYearsLost: number | null
  notableActors: NotableActor[]
  decadeBreakdown: DecadeBreakdown[]
  actors: CauseActor[]
  pagination: PaginationInfo
}
